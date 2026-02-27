// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

/// @title BountyHub - Decentralized vulnerability bounty platform with commit-reveal verification
/// @notice V2 introduces commit-reveal mechanism, competition modes, deterministic severity, and dispute resolution
contract BountyHub is ReceiverTemplate {

    // ═══════════ Enums ═══════════

    /// @notice Status of a vulnerability submission through its lifecycle
    enum SubmissionStatus { Committed, Revealed, Verified, Disputed, Finalized, Invalid }

    /// @notice Competition mode for project bounty programs
    enum CompetitionMode { UNIQUE, MULTI }

    /// @notice Severity levels based on drain amount thresholds
    enum Severity { NONE, LOW, MEDIUM, HIGH, CRITICAL }

    /// @notice VNet creation status for a project
    enum VnetStatus { None, Pending, Active, Failed }

    // ═══════════ Structs ═══════════

    /// @notice Thresholds for determining severity based on drain amount
    struct SeverityThresholds {
        uint256 criticalDrainWei;   // drain >= this = Critical
        uint256 highDrainWei;       // drain >= this = High
        uint256 mediumDrainWei;     // drain >= this = Medium
        uint256 lowDrainWei;        // drain >= this = Low
    }

    /// @notice Rules and constraints for PoC execution within a project
    struct ProjectRules {
        uint256 maxAttackerSeedWei;     // Max initial funds attacker can receive
        uint256 maxWarpSeconds;          // Max time warp allowed (0 = disabled)
        bool    allowImpersonation;      // Whether impersonation is allowed
        SeverityThresholds thresholds;   // Severity calculation thresholds
    }

    /// @notice Contract scope for multi-contract projects (V4)
    struct ContractScope {
        address contractAddress;
        string name;
        string ipfsCid;          // IPFS CID for ABI/source metadata
        bool verified;           // Etherscan verification status
    }

    /// @notice Project configuration for bounty programs
    struct Project {
        address owner;
        uint256 bountyPool;
        uint256 maxPayoutPerBug;
        address targetContract;
        uint256 forkBlock;
        bool    active;
        // V2 fields
        CompetitionMode mode;
        uint256 commitDeadline;      // MULTI: commit deadline (0 = no limit)
        uint256 revealDeadline;      // MULTI: reveal deadline (0 = no limit)
        uint256 disputeWindow;       // Seconds for dispute resolution
        bytes32 rulesHash;           // keccak256(abi.encode(ProjectRules))
        // VNet fields
        VnetStatus vnetStatus;       // VNet creation status
        string vnetRpcUrl;           // Tenderly VNet RPC URL
        bytes32 baseSnapshotId;      // evm_snapshot ID for state isolation
        uint256 vnetCreatedAt;       // Timestamp of VNet creation
        string repoUrl;              // V4: GitHub repository URL
    }

    /// @notice Vulnerability submission with commit-reveal mechanism
    struct Submission {
        address auditor;
        uint256 projectId;
        bytes32 commitHash;          // keccak256(cipherHash, sender, salt)
        string  cipherURI;           // IPFS URI to encrypted PoC
        bytes32 salt;                // Filled on reveal
        uint256 commitTimestamp;
        uint256 revealTimestamp;
        SubmissionStatus status;
        // Verification results
        uint256 drainAmountWei;      // CRE reported actual drain
        Severity severity;           // Calculated from thresholds
        uint256 payoutAmount;        // Calculated payout (escrow until finalized)
        uint256 disputeDeadline;     // Dispute window end timestamp
        bool    challenged;
        address challenger;
        uint256 challengeBond;
    }

    /// @notice Pre-authorized reveal payload stored for delayed execution
    struct QueuedReveal {
        address auditor;
        bytes32 salt;
        uint256 deadline;
        bool queued;
    }

    /// @notice UNIQUE mode reveal arbitration state (first reveal candidate, then winner lock on valid verification)
    struct UniqueRevealState {
        bool hasCandidate;
        uint256 candidateSubmissionId;
        bool winnerLocked;
        uint256 winnerSubmissionId;
    }

    // ═══════════ State Variables ═══════════

    uint256 public nextProjectId;
    uint256 public nextSubmissionId;
    mapping(uint256 => Project) internal _projects;
    mapping(uint256 => Submission) public submissions;
    mapping(uint256 => QueuedReveal) public queuedReveals;
    mapping(uint256 => ProjectRules) public projectRules;
    mapping(uint256 => ContractScope[]) public projectScopes;  // V4: multi-contract support
    mapping(uint256 => UniqueRevealState) public uniqueRevealStateByProject;

    mapping(bytes32 => bool) public commitHashUsed;        // V2: duplicate commit check
    mapping(uint256 => bytes32) public submissionMetadataHash; // V2+: deterministic bridge linkage metadata
    mapping(address => mapping(uint256 => uint256)) public lastCommitTime;  // V2 cooldown
    mapping(address => uint256) public sigNonces;          // bySig replay protection

    uint256 public constant COOLDOWN = 10 minutes;
    uint256 public constant MIN_CHALLENGE_BOND = 0.01 ether;
    uint256 public constant TIMEOUT_PENALTY_BPS = 500; // 5% in basis points

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant EIP712_NAME_HASH = keccak256("BountyHub");
    bytes32 private constant EIP712_VERSION_HASH = keccak256("1");
    bytes32 private constant COMMIT_BY_SIG_TYPEHASH = keccak256("CommitPoCBySig(address auditor,uint256 projectId,bytes32 commitHash,bytes32 cipherURIHash,uint256 nonce,uint256 deadline)");
    bytes32 private constant REVEAL_BY_SIG_TYPEHASH = keccak256("RevealPoCBySig(address auditor,uint256 submissionId,bytes32 salt,uint256 nonce,uint256 deadline)");
    bytes32 private constant QUEUE_REVEAL_BY_SIG_TYPEHASH = keccak256("QueueRevealBySig(address auditor,uint256 submissionId,bytes32 salt,uint256 nonce,uint256 deadline)");
    bytes4 private constant REPORT_ENVELOPE_MAGIC = 0x41535250;
    uint8 private constant REPORT_TYPE_VNET_SUCCESS = 1;
    uint8 private constant REPORT_TYPE_VNET_FAILED = 2;

    // ═══════════ Events ═══════════

    // Legacy-named events still emitted by active V2/V3 flows.
    event PoCSubmitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 pocHash, string pocURI);
    event BountyPaid(uint256 indexed submissionId, address indexed auditor, uint256 amount);
    event ProjectRegistered(uint256 indexed projectId, address indexed owner);

    // V2 Events
    event ProjectRegisteredV2(uint256 indexed projectId, address indexed owner, CompetitionMode mode);
    event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash);
    event PoCCommitMetadata(uint256 indexed submissionId, bytes32 metadataHash);
    event PoCRevealed(uint256 indexed submissionId);
    event RevealQueued(uint256 indexed submissionId, address indexed auditor, uint256 deadline);
    event QueuedRevealExecuted(uint256 indexed submissionId, address indexed executor);
    event PoCVerified(uint256 indexed submissionId, bool isValid, uint256 drainAmountWei, uint8 severity);
    event DisputeRaised(uint256 indexed submissionId, address indexed challenger, uint256 bond);
    event DisputeResolved(uint256 indexed submissionId, bool overturned);
    event BountyFinalized(uint256 indexed submissionId);
    event ProjectVnetCreated(uint256 indexed projectId, string vnetRpcUrl, bytes32 baseSnapshotId);
    event ProjectVnetFailed(uint256 indexed projectId, string reason);
    event UniqueRevealCandidateSet(uint256 indexed projectId, uint256 indexed submissionId);
    event UniqueRevealCandidateCleared(uint256 indexed projectId, uint256 indexed submissionId);
    event UniqueWinnerLocked(uint256 indexed projectId, uint256 indexed submissionId);

    // V3 Events
    event ProjectRegisteredV3(
        uint256 indexed projectId,
        address indexed owner,
        string repoUrl,
        ContractScope[] scopes
    );

    // ═══════════ Constructor ═══════════

    constructor(address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {}

    // ═══════════ Project Management (V2) ═══════════

    /// @notice Register a new bounty project with V2 features
    /// @param _targetContract The vulnerable contract to test
    /// @param _maxPayoutPerBug Maximum payout per bug
    /// @param _forkBlock Block number to fork from
    /// @param _mode Competition mode (UNIQUE or MULTI)
    /// @param _commitDeadline Timestamp for commit deadline (0 = no limit)
    /// @param _revealDeadline Timestamp for reveal deadline (0 = no limit)
    /// @param _disputeWindow Seconds for dispute resolution
    /// @param _rules Project rules and thresholds
    /// @return projectId The ID of the newly registered project
    function registerProjectV2(
        address _targetContract,
        uint256 _maxPayoutPerBug,
        uint256 _forkBlock,
        CompetitionMode _mode,
        uint256 _commitDeadline,
        uint256 _revealDeadline,
        uint256 _disputeWindow,
        ProjectRules calldata _rules
    ) external payable returns (uint256 projectId) {
        require(msg.value > 0, "Must deposit bounty");
        require(_targetContract != address(0), "Invalid target");
        require(_commitDeadline == 0 || _commitDeadline > block.timestamp, "Invalid commit deadline");
        require(_revealDeadline == 0 || _revealDeadline > _commitDeadline, "Reveal must be after commit");

        projectId = nextProjectId++;
        
        Project storage p = _projects[projectId];
        p.owner = msg.sender;
        p.bountyPool = msg.value;
        p.maxPayoutPerBug = _maxPayoutPerBug;
        p.targetContract = _targetContract;
        p.forkBlock = _forkBlock;
        p.active = true;
        p.mode = _mode;
        p.commitDeadline = _commitDeadline;
        p.revealDeadline = _revealDeadline;
        p.disputeWindow = _disputeWindow;
        p.rulesHash = keccak256(abi.encode(_rules));

        projectRules[projectId] = _rules;

        _setVnetPending(projectId);

        emit ProjectRegistered(projectId, msg.sender);
        emit ProjectRegisteredV2(projectId, msg.sender, _mode);
    }

    /// @notice Register a new bounty project with V3 features (repo URL + multi-contract scopes)
    /// @param _repoUrl GitHub repository URL
    /// @param _scopes Array of contract scopes for multi-contract projects
    /// @param _targetContract The vulnerable contract to test
    /// @param _maxPayoutPerBug Maximum payout per bug
    /// @param _forkBlock Block number to fork from
    /// @param _mode Competition mode (UNIQUE or MULTI)
    /// @param _commitDeadline Timestamp for commit deadline (0 = no limit)
    /// @param _revealDeadline Timestamp for reveal deadline (0 = no limit)
    /// @param _disputeWindow Seconds for dispute resolution
    /// @param _rules Project rules and thresholds
    /// @return projectId The ID of the newly registered project
    function registerProjectV3(
        string calldata _repoUrl,
        ContractScope[] calldata _scopes,
        address _targetContract,
        uint256 _maxPayoutPerBug,
        uint256 _forkBlock,
        CompetitionMode _mode,
        uint256 _commitDeadline,
        uint256 _revealDeadline,
        uint256 _disputeWindow,
        ProjectRules calldata _rules
    ) external payable returns (uint256 projectId) {
        require(msg.value > 0, "Must deposit bounty");
        require(_targetContract != address(0), "Invalid target");
        require(_commitDeadline == 0 || _commitDeadline > block.timestamp, "Invalid commit deadline");
        require(_revealDeadline == 0 || _revealDeadline > _commitDeadline, "Reveal must be after commit");

        projectId = nextProjectId++;

        Project storage p = _projects[projectId];
        p.owner = msg.sender;
        p.bountyPool = msg.value;
        p.maxPayoutPerBug = _maxPayoutPerBug;
        p.targetContract = _targetContract;
        p.forkBlock = _forkBlock;
        p.active = true;
        p.mode = _mode;
        p.commitDeadline = _commitDeadline;
        p.revealDeadline = _revealDeadline;
        p.disputeWindow = _disputeWindow;
        p.rulesHash = keccak256(abi.encode(_rules));
        p.repoUrl = _repoUrl;

        projectRules[projectId] = _rules;

        // Store scopes
        for (uint256 i = 0; i < _scopes.length; i++) {
            projectScopes[projectId].push(_scopes[i]);
        }

        _setVnetPending(projectId);

        emit ProjectRegistered(projectId, msg.sender);
        emit ProjectRegisteredV2(projectId, msg.sender, _mode);
        emit ProjectRegisteredV3(projectId, msg.sender, _repoUrl, _scopes);
    }

    /// @notice Add more funds to a project's bounty pool
    /// @param _projectId The project ID to top up
    function topUpBounty(uint256 _projectId) external payable {
        require(_projects[_projectId].owner == msg.sender, "Not owner");
        _projects[_projectId].bountyPool += msg.value;
    }

    /// @notice Set VNet info after successful creation (CRE Forwarder only)
    function setProjectVnet(
        uint256 _projectId,
        string calldata _vnetRpcUrl,
        bytes32 _baseSnapshotId
    ) external {
        require(msg.sender == getForwarderAddress(), "Not authorized");
        _applyProjectVnet(_projectId, _vnetRpcUrl, _baseSnapshotId);
    }

    /// @notice Mark VNet creation as failed (CRE Forwarder only)
    function markVnetFailed(uint256 _projectId, string calldata _reason) external {
        require(msg.sender == getForwarderAddress(), "Not authorized");
        _applyVnetFailed(_projectId, _reason);
    }

    function _applyProjectVnet(
        uint256 _projectId,
        string memory _vnetRpcUrl,
        bytes32 _baseSnapshotId
    ) internal {
        require(_projectId < nextProjectId, "Invalid project");
        require(bytes(_vnetRpcUrl).length > 0, "Empty RPC URL");

        Project storage p = _projects[_projectId];
        require(p.vnetStatus == VnetStatus.None || p.vnetStatus == VnetStatus.Pending, "VNet already set");

        p.vnetRpcUrl = _vnetRpcUrl;
        p.baseSnapshotId = _baseSnapshotId;
        p.vnetStatus = VnetStatus.Active;
        p.vnetCreatedAt = block.timestamp;

        emit ProjectVnetCreated(_projectId, _vnetRpcUrl, _baseSnapshotId);
    }

    function _applyVnetFailed(uint256 _projectId, string memory _reason) internal {
        require(_projectId < nextProjectId, "Invalid project");
        _projects[_projectId].vnetStatus = VnetStatus.Failed;
        emit ProjectVnetFailed(_projectId, _reason);
    }

    /// @notice Set VNet status to Pending (called during project registration)
    function _setVnetPending(uint256 _projectId) internal {
        _projects[_projectId].vnetStatus = VnetStatus.Pending;
    }

    // ═══════════ Legacy Endpoint Hard Rejection ═══════════

    /// @notice Legacy V1 project registration endpoint (hard-rejected after cutover)
    /// @param _targetContract The vulnerable contract to test
    /// @param _maxPayoutPerBug Maximum payout per bug
    /// @param _forkBlock Block number to fork from
    /// @return projectId The ID of the newly registered project
    function registerProject(
        address _targetContract,
        uint256 _maxPayoutPerBug,
        uint256 _forkBlock
    ) external payable returns (uint256 projectId) {
        _targetContract;
        _maxPayoutPerBug;
        _forkBlock;
        revert("UNSUPPORTED_LEGACY_REGISTER_PROJECT");
    }

    // ═══════════ Commit-Reveal (V2) ═══════════

    /// @notice Phase 1: Auditor commits an encrypted PoC
    /// @param _projectId The project ID to submit to
    /// @param _commitHash keccak256(abi.encodePacked(keccak256(cipherURI), auditor, salt))
    /// @param _cipherURI IPFS URI to the encrypted PoC
    /// @return submissionId The ID of the new submission
    function commitPoC(
        uint256 _projectId,
        bytes32 _commitHash,
        string calldata _cipherURI
    ) external returns (uint256 submissionId) {
        return _commitPoC(_projectId, _commitHash, _cipherURI, msg.sender);
    }

    /// @notice Phase 1 (relayed): commit an encrypted PoC with auditor signature
    /// @param _auditor Auditor address authorizing this commit
    /// @param _projectId The project ID to submit to
    /// @param _commitHash keccak256(abi.encodePacked(keccak256(cipherURI), auditor, salt))
    /// @param _cipherURI IPFS URI to the encrypted PoC
    /// @param _deadline Signature expiry timestamp
    /// @param _signature EIP-712 signature from auditor
    function commitPoCBySig(
        address _auditor,
        uint256 _projectId,
        bytes32 _commitHash,
        string calldata _cipherURI,
        uint256 _deadline,
        bytes calldata _signature
    ) external returns (uint256 submissionId) {
        require(block.timestamp <= _deadline, "Signature expired");

        uint256 nonce = sigNonces[_auditor];
        bytes32 structHash = keccak256(
            abi.encode(
                COMMIT_BY_SIG_TYPEHASH,
                _auditor,
                _projectId,
                _commitHash,
                keccak256(bytes(_cipherURI)),
                nonce,
                _deadline
            )
        );

        _requireValidSignature(_auditor, structHash, _signature);
        sigNonces[_auditor] = nonce + 1;

        return _commitPoC(_projectId, _commitHash, _cipherURI, _auditor);
    }

    function _commitPoC(
        uint256 _projectId,
        bytes32 _commitHash,
        string calldata _cipherURI,
        address _auditor
    ) internal returns (uint256 submissionId) {
        Project storage p = _projects[_projectId];
        require(p.active, "Project not active");
        require(p.bountyPool > 0, "No bounty remaining");
        require(!commitHashUsed[_commitHash], "Duplicate commit");
        require(block.timestamp >= lastCommitTime[_auditor][_projectId] + COOLDOWN, "Cooldown active");

        // MULTI mode: check commit deadline
        if (p.mode == CompetitionMode.MULTI && p.commitDeadline > 0) {
            require(block.timestamp <= p.commitDeadline, "Commit deadline passed");
        }

        commitHashUsed[_commitHash] = true;
        lastCommitTime[_auditor][_projectId] = block.timestamp;

        submissionId = nextSubmissionId++;
        
        Submission storage sub = submissions[submissionId];
        sub.auditor = _auditor;
        sub.projectId = _projectId;
        sub.commitHash = _commitHash;
        sub.cipherURI = _cipherURI;
        sub.commitTimestamp = block.timestamp;
        sub.status = SubmissionStatus.Committed;
        bytes32 metadataHash = keccak256(bytes(_cipherURI));
        submissionMetadataHash[submissionId] = metadataHash;

        emit PoCCommitted(submissionId, _projectId, _auditor, _commitHash);
        emit PoCCommitMetadata(submissionId, metadataHash);
    }

    /// @notice Phase 2: Auditor reveals commitment salt to unlock ACL workflow
    /// @param _submissionId The submission ID to reveal
    /// @param _salt Random salt used in commit hash
    function revealPoC(
        uint256 _submissionId,
        bytes32 _salt
    ) external {
        _revealPoC(_submissionId, _salt, msg.sender);
    }

    /// @notice Phase 2 (relayed): reveal PoC with auditor signature
    /// @param _auditor Auditor address authorizing reveal
    /// @param _submissionId The submission ID to reveal
    /// @param _salt Random salt used in commit hash
    /// @param _deadline Signature expiry timestamp
    /// @param _signature EIP-712 signature from auditor
    function revealPoCBySig(
        address _auditor,
        uint256 _submissionId,
        bytes32 _salt,
        uint256 _deadline,
        bytes calldata _signature
    ) external {
        require(block.timestamp <= _deadline, "Signature expired");

        uint256 nonce = sigNonces[_auditor];
        bytes32 structHash = keccak256(
            abi.encode(
                REVEAL_BY_SIG_TYPEHASH,
                _auditor,
                _submissionId,
                _salt,
                nonce,
                _deadline
            )
        );

        _requireValidSignature(_auditor, structHash, _signature);
        sigNonces[_auditor] = nonce + 1;

        _revealPoC(_submissionId, _salt, _auditor);
    }

    /// @notice Queue a reveal payload authorized by auditor signature for delayed execution
    /// @dev Signature is validated and nonce consumed when queued (not at execution time)
    function queueRevealBySig(
        address _auditor,
        uint256 _submissionId,
        bytes32 _salt,
        uint256 _deadline,
        bytes calldata _signature
    ) external {
        require(block.timestamp <= _deadline, "Signature expired");

        Submission storage sub = submissions[_submissionId];
        require(sub.auditor == _auditor, "Not the auditor");
        require(sub.status == SubmissionStatus.Committed, "Not in committed status");
        require(!queuedReveals[_submissionId].queued, "Reveal already queued");

        uint256 nonce = sigNonces[_auditor];
        bytes32 structHash = keccak256(
            abi.encode(
                QUEUE_REVEAL_BY_SIG_TYPEHASH,
                _auditor,
                _submissionId,
                _salt,
                nonce,
                _deadline
            )
        );

        _requireValidSignature(_auditor, structHash, _signature);
        sigNonces[_auditor] = nonce + 1;
        queuedReveals[_submissionId] = QueuedReveal({
            auditor: _auditor,
            salt: _salt,
            deadline: _deadline,
            queued: true
        });

        emit RevealQueued(_submissionId, _auditor, _deadline);
    }

    /// @notice Execute a previously queued reveal once timing constraints permit it
    /// @dev Callable by anyone (workflow/relayer/keeper). Auditor authorization was checked at queue time.
    function executeQueuedReveal(uint256 _submissionId) external {
        QueuedReveal memory queued = queuedReveals[_submissionId];
        require(queued.queued, "No queued reveal");
        require(block.timestamp <= queued.deadline, "Signature expired");

        _revealPoC(_submissionId, queued.salt, queued.auditor);
        emit QueuedRevealExecuted(_submissionId, msg.sender);
    }

    /// @notice Cancel queued reveal payload (auditor only)
    function cancelQueuedReveal(uint256 _submissionId) external {
        Submission storage sub = submissions[_submissionId];
        require(sub.auditor == msg.sender, "Not the auditor");
        require(queuedReveals[_submissionId].queued, "No queued reveal");

        delete queuedReveals[_submissionId];
    }

    function _revealPoC(
        uint256 _submissionId,
        bytes32 _salt,
        address _auditor
    ) internal {
        Submission storage sub = submissions[_submissionId];
        require(sub.auditor == _auditor, "Not the auditor");
        require(sub.status == SubmissionStatus.Committed, "Not in committed status");

        Project storage p = _projects[sub.projectId];

        // Verify commit hash: keccak256(abi.encodePacked(keccak256(cipherURI), auditor, _salt))
        // Note: cipherURI is the IPFS hash, we verify the commitment matches
        bytes32 cipherHash = keccak256(bytes(sub.cipherURI));
        bytes32 computedCommit = keccak256(abi.encodePacked(cipherHash, _auditor, _salt));
        require(computedCommit == sub.commitHash, "Invalid reveal");
        require(_salt != bytes32(0), "Salt required");

        if (p.mode == CompetitionMode.UNIQUE) {
            UniqueRevealState storage uniqueState = uniqueRevealStateByProject[sub.projectId];
            require(!uniqueState.winnerLocked, "Winner locked");
            if (!uniqueState.hasCandidate) {
                uniqueState.hasCandidate = true;
                uniqueState.candidateSubmissionId = _submissionId;
                emit UniqueRevealCandidateSet(sub.projectId, _submissionId);
            } else {
                require(uniqueState.candidateSubmissionId == _submissionId, "Candidate pending");
            }
        }

        // MULTI mode: check reveal window
        if (p.mode == CompetitionMode.MULTI) {
            require(p.commitDeadline > 0 && block.timestamp > p.commitDeadline, "Reveal not started");
            if (p.revealDeadline > 0) {
                require(block.timestamp <= p.revealDeadline, "Reveal deadline passed");
            }
        }

        sub.salt = _salt;
        sub.revealTimestamp = block.timestamp;
        sub.status = SubmissionStatus.Revealed;
        delete queuedReveals[_submissionId];

        emit PoCRevealed(_submissionId);
    }

    function _requireValidSignature(
        address _expectedSigner,
        bytes32 _structHash,
        bytes calldata _signature
    ) internal view {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), _structHash));
        address recoveredSigner = _recoverSigner(digest, _signature);
        require(recoveredSigner == _expectedSigner, "Invalid signer");
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                EIP712_NAME_HASH,
                EIP712_VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function _recoverSigner(bytes32 _digest, bytes calldata _signature) internal pure returns (address signer) {
        require(_signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(_signature.offset)
            s := calldataload(add(_signature.offset, 32))
            v := byte(0, calldataload(add(_signature.offset, 64)))
        }

        require(v == 27 || v == 28, "Invalid signature v");
        signer = ecrecover(_digest, v, r, s);
        require(signer != address(0), "Invalid signer");
    }

    // ═══════════ Legacy Submission Endpoint Hard Rejection ═══════════

    /// @notice Legacy V1 PoC submission endpoint (hard-rejected after cutover)
    function submitPoC(
        uint256 _projectId,
        bytes32 _pocHash,
        string calldata _pocURI
    ) external returns (uint256 submissionId) {
        _projectId;
        _pocHash;
        _pocURI;
        revert("UNSUPPORTED_LEGACY_SUBMIT_POC");
    }

    // ═══════════ CRE Report Processing (V2) ═══════════

    /// @notice Process verification report from CRE
    /// @dev Legacy V2 verification format: (submissionId, isValid, drainAmountWei)
    /// @param report Encoded report data from CRE
    function _processReport(bytes calldata report) internal override {
        if (_isTypedReport(report)) {
            (bytes4 magic, uint8 reportType, bytes memory payload) = abi.decode(report, (bytes4, uint8, bytes));
            require(magic == REPORT_ENVELOPE_MAGIC, "Invalid report magic");

            if (reportType == REPORT_TYPE_VNET_SUCCESS) {
                (uint256 projectId, string memory vnetRpcUrl, bytes32 baseSnapshotId) =
                    abi.decode(payload, (uint256, string, bytes32));
                _applyProjectVnet(projectId, vnetRpcUrl, baseSnapshotId);
                return;
            }

            if (reportType == REPORT_TYPE_VNET_FAILED) {
                (uint256 projectId, string memory reason) = abi.decode(payload, (uint256, string));
                _applyVnetFailed(projectId, reason);
                return;
            }

            revert("Unknown report type");
        }

        _processVerificationReport(report);
    }

    function _isTypedReport(bytes calldata report) internal pure returns (bool) {
        if (report.length < 32) {
            return false;
        }

        bytes4 reportMagic;
        assembly {
            reportMagic := calldataload(report.offset)
        }

        return reportMagic == REPORT_ENVELOPE_MAGIC;
    }

    function _processVerificationReport(bytes calldata report) internal {
        (uint256 submissionId, bool isValid, uint256 drainAmountWei) = 
            abi.decode(report, (uint256, bool, uint256));

        Submission storage sub = submissions[submissionId];
        require(sub.status == SubmissionStatus.Revealed, "Not revealed");

        Project storage p = _projects[sub.projectId];
        UniqueRevealState storage uniqueState = uniqueRevealStateByProject[sub.projectId];
        if (p.mode == CompetitionMode.UNIQUE && sub.salt != bytes32(0)) {
            require(uniqueState.hasCandidate && uniqueState.candidateSubmissionId == submissionId, "Not active candidate");
        }
        sub.drainAmountWei = drainAmountWei;

        if (isValid && drainAmountWei > 0) {
            // Calculate severity from thresholds
            ProjectRules storage rules = projectRules[sub.projectId];
            sub.severity = _calculateSeverity(drainAmountWei, rules.thresholds);
            sub.payoutAmount = _calculatePayout(sub.severity, p.maxPayoutPerBug);

            // For V1 projects (no dispute window), pay immediately
            if (p.disputeWindow == 0) {
                sub.status = SubmissionStatus.Finalized;
                _executePayout(submissionId, sub);
            } else {
                // V2: Set dispute deadline and escrow
                sub.status = SubmissionStatus.Verified;
                sub.disputeDeadline = block.timestamp + p.disputeWindow;
            }

            if (p.mode == CompetitionMode.UNIQUE) {
                uniqueState.hasCandidate = false;
                uniqueState.winnerLocked = true;
                uniqueState.winnerSubmissionId = submissionId;
                emit UniqueWinnerLocked(sub.projectId, submissionId);
            }

            emit PoCVerified(submissionId, true, drainAmountWei, uint8(sub.severity));
        } else {
            sub.status = SubmissionStatus.Invalid;
            if (p.mode == CompetitionMode.UNIQUE) {
                uniqueState.hasCandidate = false;
                uniqueState.candidateSubmissionId = 0;
                emit UniqueRevealCandidateCleared(sub.projectId, submissionId);
            }
            emit PoCVerified(submissionId, false, 0, uint8(Severity.NONE));
        }
    }

    /// @notice Calculate severity based on drain amount and thresholds
    /// @param drain The drain amount in wei
    /// @param thresholds The severity thresholds
    /// @return severity The calculated severity level
    function _calculateSeverity(uint256 drain, SeverityThresholds storage thresholds) 
        internal view returns (Severity severity) {
        if (drain >= thresholds.criticalDrainWei) return Severity.CRITICAL;
        if (drain >= thresholds.highDrainWei) return Severity.HIGH;
        if (drain >= thresholds.mediumDrainWei) return Severity.MEDIUM;
        if (drain >= thresholds.lowDrainWei) return Severity.LOW;
        return Severity.NONE;
    }

    /// @notice Calculate payout amount based on severity
    /// @param severity The severity level
    /// @param maxPayout The maximum payout per bug
    /// @return payout The calculated payout amount
    function _calculatePayout(Severity severity, uint256 maxPayout) internal pure returns (uint256 payout) {
        if (severity == Severity.CRITICAL) return maxPayout;
        if (severity == Severity.HIGH) return maxPayout * 60 / 100;
        if (severity == Severity.MEDIUM) return maxPayout * 30 / 100;
        if (severity == Severity.LOW) return maxPayout * 10 / 100;
        return 0;
    }

    /// @notice Execute payout to auditor
    /// @param _submissionId The submission ID
    /// @param sub The submission storage reference
    function _executePayout(uint256 _submissionId, Submission storage sub) internal {
        Project storage p = _projects[sub.projectId];

        uint256 payout = sub.payoutAmount;
        if (payout > p.maxPayoutPerBug) payout = p.maxPayoutPerBug;
        if (payout > p.bountyPool) payout = p.bountyPool;

        p.bountyPool -= payout;
        sub.payoutAmount = payout; // Store actual payout

        (bool success, ) = sub.auditor.call{value: payout}("");
        require(success, "Transfer failed");

        emit BountyPaid(_submissionId, sub.auditor, payout);
        emit BountyFinalized(_submissionId);
    }

    // ═══════════ Dispute Resolution (V2) ═══════════

    /// @notice Challenge a verified submission during the dispute window
    /// @param _submissionId The submission ID to challenge
    function challenge(uint256 _submissionId) external payable {
        Submission storage sub = submissions[_submissionId];
        require(sub.status == SubmissionStatus.Verified, "Not verified");
        require(block.timestamp <= sub.disputeDeadline, "Dispute window closed");
        require(!sub.challenged, "Already challenged");
        require(msg.value >= MIN_CHALLENGE_BOND, "Insufficient bond");

        sub.challenged = true;
        sub.challenger = msg.sender;
        sub.challengeBond = msg.value;
        sub.status = SubmissionStatus.Disputed;

        emit DisputeRaised(_submissionId, msg.sender, msg.value);
    }

    /// @notice Resolve a dispute (only project owner)
    /// @param _submissionId The submission ID to resolve
    /// @param _overturn If true, overturn the verification result
    function resolveDispute(uint256 _submissionId, bool _overturn) external {
        Submission storage sub = submissions[_submissionId];
        Project storage p = _projects[sub.projectId];

        require(p.owner == msg.sender, "Not owner");
        require(sub.status == SubmissionStatus.Disputed, "Not disputed");
        require(block.timestamp <= sub.disputeDeadline, "Dispute window closed");

        if (_overturn) {
            // Reject the submission, challenger wins bond
            sub.status = SubmissionStatus.Invalid;
            sub.payoutAmount = 0;

            // Return bond to challenger
            (bool success, ) = sub.challenger.call{value: sub.challengeBond}("");
            require(success, "Bond return failed");
        } else {
            // Confirm the submission, challenger loses bond
            // Bond goes to the bounty pool (or could go to project owner)
            sub.status = SubmissionStatus.Verified;
            p.bountyPool += sub.challengeBond;
            sub.challengeBond = 0;
        }

        emit DisputeResolved(_submissionId, _overturn);
    }

    /// @notice Finalize a submission after dispute window expires
    /// @param _submissionId The submission ID to finalize
    function finalize(uint256 _submissionId) external {
        Submission storage sub = submissions[_submissionId];
        require(
            sub.status == SubmissionStatus.Verified || 
            sub.status == SubmissionStatus.Disputed, 
            "Cannot finalize"
        );
        require(block.timestamp > sub.disputeDeadline, "Dispute window open");

        Project storage p = _projects[sub.projectId];
        uint256 timeoutPenalty = 0;

        if (sub.status == SubmissionStatus.Disputed && sub.challenged) {
            // Owner didn't resolve in time - add 5% penalty from bountyPool
            // This incentivizes timely dispute resolution
            timeoutPenalty = (sub.payoutAmount * TIMEOUT_PENALTY_BPS) / 10000;
            
            // Challenger loses bond (goes to bountyPool)
            p.bountyPool += sub.challengeBond;
            sub.challengeBond = 0;
        } else if (sub.status == SubmissionStatus.Verified) {
            // No challenge, but owner didn't call finalize promptly
            // Still add penalty to incentivize active participation
            timeoutPenalty = (sub.payoutAmount * TIMEOUT_PENALTY_BPS) / 10000;
        }

        // Deduct penalty from bounty pool and add to payout
        if (timeoutPenalty > 0 && timeoutPenalty <= p.bountyPool) {
            p.bountyPool -= timeoutPenalty;
            sub.payoutAmount += timeoutPenalty;
        }

        sub.status = SubmissionStatus.Finalized;
        _executePayout(_submissionId, sub);
    }

    // ═══════════ View Functions ═══════════
    
    /// @notice Get project by ID (replaces auto-generated getter to avoid stack-too-deep)
    /// @param _projectId The project ID
    /// @return project The project struct
    function projects(uint256 _projectId) external view returns (Project memory) {
        return _projects[_projectId];
    }

    /// @notice Check if a submission can be revealed
    /// @param _submissionId The submission ID
    /// @return canReveal Whether reveal is allowed
    function canReveal(uint256 _submissionId) external view returns (bool) {
        Submission storage sub = submissions[_submissionId];
        if (sub.status != SubmissionStatus.Committed) return false;
        if (sub.auditor != msg.sender) return false;

        Project storage p = _projects[sub.projectId];
        if (p.mode == CompetitionMode.UNIQUE) {
            UniqueRevealState storage uniqueState = uniqueRevealStateByProject[sub.projectId];
            if (uniqueState.winnerLocked) {
                return false;
            }
            if (uniqueState.hasCandidate && uniqueState.candidateSubmissionId != _submissionId) {
                return false;
            }
        }
        if (p.mode == CompetitionMode.MULTI && p.commitDeadline > 0) {
            return block.timestamp > p.commitDeadline;
        }
        return true;
    }

    /// @notice Check if a submission can be finalized
    /// @param _submissionId The submission ID
    /// @return canFinalize Whether finalize is allowed
    function canFinalize(uint256 _submissionId) external view returns (bool) {
        Submission storage sub = submissions[_submissionId];
        if (sub.status != SubmissionStatus.Verified && sub.status != SubmissionStatus.Disputed) {
            return false;
        }
        return block.timestamp > sub.disputeDeadline;
    }
}
