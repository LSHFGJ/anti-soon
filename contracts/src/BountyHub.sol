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
        bytes projectPublicKey;      // ECDH public key for POC encryption (64 bytes)
        // VNet fields
        VnetStatus vnetStatus;       // VNet creation status
        string vnetRpcUrl;           // Tenderly VNet RPC URL
        bytes32 baseSnapshotId;      // evm_snapshot ID for state isolation
        uint256 vnetCreatedAt;       // Timestamp of VNet creation
    }

    /// @notice Vulnerability submission with commit-reveal mechanism
    struct Submission {
        address auditor;
        uint256 projectId;
        bytes32 commitHash;          // keccak256(cipherHash, sender, salt)
        string  cipherURI;           // IPFS URI to encrypted PoC
        bytes32 decryptionKey;       // Filled on reveal
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

    // V1 Submission struct for backward compatibility
    struct SubmissionV1 {
        address auditor;
        uint256 projectId;
        bytes32 pocHash;
        string  pocURI;
        uint256 timestamp;
        SubmissionStatusV1 status;
    }

    // V1 Status enum for backward compatibility
    enum SubmissionStatusV1 { Pending, Valid, Invalid }

    // ═══════════ State Variables ═══════════

    uint256 public nextProjectId;
    uint256 public nextSubmissionId;
    mapping(uint256 => Project) public projects;
    mapping(uint256 => Submission) public submissions;
    mapping(uint256 => ProjectRules) public projectRules;

    // V1 mappings for backward compatibility
    mapping(bytes32 => bool) public pocHashUsed;           // V1: duplicate PoC check
    mapping(bytes32 => bool) public commitHashUsed;        // V2: duplicate commit check
    mapping(address => mapping(uint256 => uint256)) public lastSubmitTime;  // V1 cooldown
    mapping(address => mapping(uint256 => uint256)) public lastCommitTime;  // V2 cooldown

    uint256 public constant COOLDOWN = 10 minutes;
    uint256 public constant MIN_CHALLENGE_BOND = 0.01 ether;
    uint256 public constant TIMEOUT_PENALTY_BPS = 500; // 5% in basis points

    // ═══════════ Events ═══════════

    // V1 Events (kept for backward compatibility)
    event PoCSubmitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 pocHash, string pocURI);
    event BountyPaid(uint256 indexed submissionId, address indexed auditor, uint256 amount);
    event ProjectRegistered(uint256 indexed projectId, address indexed owner);

    // V2 Events
    event ProjectRegisteredV2(uint256 indexed projectId, address indexed owner, CompetitionMode mode);
    event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash);
    event PoCRevealed(uint256 indexed submissionId, bytes32 decryptionKey);
    event PoCVerified(uint256 indexed submissionId, bool isValid, uint256 drainAmountWei, uint8 severity);
    event DisputeRaised(uint256 indexed submissionId, address indexed challenger, uint256 bond);
    event DisputeResolved(uint256 indexed submissionId, bool overturned);
    event BountyFinalized(uint256 indexed submissionId);
    event ProjectPublicKeyUpdated(uint256 indexed projectId, bytes publicKey);
    event ProjectVnetCreated(uint256 indexed projectId, string vnetRpcUrl, bytes32 baseSnapshotId);
    event ProjectVnetFailed(uint256 indexed projectId, string reason);

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
        
        Project storage p = projects[projectId];
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
        p.projectPublicKey = "";  // Empty until filled by CRE workflow

        projectRules[projectId] = _rules;

        _setVnetPending(projectId);

        emit ProjectRegistered(projectId, msg.sender);
        emit ProjectRegisteredV2(projectId, msg.sender, _mode);
    }

    /// @notice Add more funds to a project's bounty pool
    /// @param _projectId The project ID to top up
    function topUpBounty(uint256 _projectId) external payable {
        require(projects[_projectId].owner == msg.sender, "Not owner");
        projects[_projectId].bountyPool += msg.value;
    }

    /// @notice Update project public key (CRE Forwarder only)
    /// @dev Only the CRE Forwarder can call this to set the ECDH public key after key generation
    /// @param _projectId The project ID to update
    /// @param _publicKey The ECDH public key (64 bytes)
    function updateProjectPublicKey(uint256 _projectId, bytes calldata _publicKey) external {
        require(msg.sender == getForwarderAddress(), "Not authorized");
        projects[_projectId].projectPublicKey = _publicKey;
        emit ProjectPublicKeyUpdated(_projectId, _publicKey);
    }

    /// @notice Set VNet info after successful creation (CRE Forwarder only)
    function setProjectVnet(
        uint256 _projectId,
        string calldata _vnetRpcUrl,
        bytes32 _baseSnapshotId
    ) external {
        require(msg.sender == getForwarderAddress(), "Not authorized");
        require(_projectId < nextProjectId, "Invalid project");
        require(bytes(_vnetRpcUrl).length > 0, "Empty RPC URL");

        Project storage p = projects[_projectId];
        require(p.vnetStatus == VnetStatus.None || p.vnetStatus == VnetStatus.Pending, "VNet already set");

        p.vnetRpcUrl = _vnetRpcUrl;
        p.baseSnapshotId = _baseSnapshotId;
        p.vnetStatus = VnetStatus.Active;
        p.vnetCreatedAt = block.timestamp;

        emit ProjectVnetCreated(_projectId, _vnetRpcUrl, _baseSnapshotId);
    }

    /// @notice Mark VNet creation as failed (CRE Forwarder only)
    function markVnetFailed(uint256 _projectId, string calldata _reason) external {
        require(msg.sender == getForwarderAddress(), "Not authorized");
        require(_projectId < nextProjectId, "Invalid project");
        projects[_projectId].vnetStatus = VnetStatus.Failed;
        emit ProjectVnetFailed(_projectId, _reason);
    }

    /// @notice Set VNet status to Pending (called during project registration)
    function _setVnetPending(uint256 _projectId) internal {
        projects[_projectId].vnetStatus = VnetStatus.Pending;
    }

    // ═══════════ Project Management (V1 - Backward Compatibility) ═══════════

    /// @notice V1 project registration (defaults to UNIQUE mode with no deadlines)
    /// @param _targetContract The vulnerable contract to test
    /// @param _maxPayoutPerBug Maximum payout per bug
    /// @param _forkBlock Block number to fork from
    /// @return projectId The ID of the newly registered project
    function registerProject(
        address _targetContract,
        uint256 _maxPayoutPerBug,
        uint256 _forkBlock
    ) external payable returns (uint256 projectId) {
        require(msg.value > 0, "Must deposit bounty");
        require(_targetContract != address(0), "Invalid target");

        projectId = nextProjectId++;

        // Store project with default V1 rules
        projects[projectId] = Project({
            owner: msg.sender,
            bountyPool: msg.value,
            maxPayoutPerBug: _maxPayoutPerBug,
            targetContract: _targetContract,
            forkBlock: _forkBlock,
            active: true,
            mode: CompetitionMode.UNIQUE,
            commitDeadline: 0,
            revealDeadline: 0,
            disputeWindow: 0,
            rulesHash: bytes32(0),
            projectPublicKey: "",
            vnetStatus: VnetStatus.Pending,
            vnetRpcUrl: "",
            baseSnapshotId: bytes32(0),
            vnetCreatedAt: 0
        });

        // Store default rules
        projectRules[projectId].thresholds = SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        projectRules[projectId].maxAttackerSeedWei = 100 ether;
        projectRules[projectId].allowImpersonation = true;

        emit ProjectRegistered(projectId, msg.sender);
        emit ProjectRegisteredV2(projectId, msg.sender, CompetitionMode.UNIQUE);
    }

    // ═══════════ Commit-Reveal (V2) ═══════════

    /// @notice Phase 1: Auditor commits an encrypted PoC
    /// @param _projectId The project ID to submit to
    /// @param _commitHash keccak256(abi.encodePacked(keccak256(ciphertext), msg.sender, salt))
    /// @param _cipherURI IPFS URI to the encrypted PoC
    /// @return submissionId The ID of the new submission
    function commitPoC(
        uint256 _projectId,
        bytes32 _commitHash,
        string calldata _cipherURI
    ) external returns (uint256 submissionId) {
        Project storage p = projects[_projectId];
        require(p.active, "Project not active");
        require(p.bountyPool > 0, "No bounty remaining");
        require(!commitHashUsed[_commitHash], "Duplicate commit");
        require(block.timestamp >= lastCommitTime[msg.sender][_projectId] + COOLDOWN, "Cooldown active");

        // MULTI mode: check commit deadline
        if (p.mode == CompetitionMode.MULTI && p.commitDeadline > 0) {
            require(block.timestamp <= p.commitDeadline, "Commit deadline passed");
        }

        commitHashUsed[_commitHash] = true;
        lastCommitTime[msg.sender][_projectId] = block.timestamp;

        submissionId = nextSubmissionId++;
        
        Submission storage sub = submissions[submissionId];
        sub.auditor = msg.sender;
        sub.projectId = _projectId;
        sub.commitHash = _commitHash;
        sub.cipherURI = _cipherURI;
        sub.commitTimestamp = block.timestamp;
        sub.status = SubmissionStatus.Committed;

        emit PoCCommitted(submissionId, _projectId, msg.sender, _commitHash);
    }

    /// @notice Phase 2: Auditor reveals the decryption key
    /// @param _submissionId The submission ID to reveal
    /// @param _decryptionKey The AES decryption key for the encrypted PoC
    /// @param _salt Random salt used in commit hash
    function revealPoC(
        uint256 _submissionId,
        bytes32 _decryptionKey,
        bytes32 _salt
    ) external {
        Submission storage sub = submissions[_submissionId];
        require(sub.auditor == msg.sender, "Not the auditor");
        require(sub.status == SubmissionStatus.Committed, "Not in committed status");

        Project storage p = projects[sub.projectId];

        // Verify commit hash: keccak256(abi.encodePacked(keccak256(cipherURI), msg.sender, _salt))
        // Note: cipherURI is the IPFS hash, we verify the commitment matches
        bytes32 cipherHash = keccak256(bytes(sub.cipherURI));
        bytes32 computedCommit = keccak256(abi.encodePacked(cipherHash, msg.sender, _salt));
        require(computedCommit == sub.commitHash, "Invalid reveal");

        // MULTI mode: check reveal window
        if (p.mode == CompetitionMode.MULTI) {
            require(p.commitDeadline > 0 && block.timestamp > p.commitDeadline, "Reveal not started");
            if (p.revealDeadline > 0) {
                require(block.timestamp <= p.revealDeadline, "Reveal deadline passed");
            }
        }

        sub.decryptionKey = _decryptionKey;
        sub.salt = _salt;
        sub.revealTimestamp = block.timestamp;
        sub.status = SubmissionStatus.Revealed;

        emit PoCRevealed(_submissionId, _decryptionKey);
    }

    // ═══════════ V1 Submission (Backward Compatibility) ═══════════

    /// @notice V1 PoC submission (no encryption, immediate CRE trigger)
    /// @dev DEPRECATED: Use commitPoC + revealPoC instead
    function submitPoC(
        uint256 _projectId,
        bytes32 _pocHash,
        string calldata _pocURI
    ) external returns (uint256 submissionId) {
        // DEPRECATED: Use V2 commit-reveal flow
        Project storage p = projects[_projectId];
        require(p.active, "Project not active");
        require(p.bountyPool > 0, "No bounty remaining");
        require(!pocHashUsed[_pocHash], "Duplicate PoC");
        require(block.timestamp >= lastSubmitTime[msg.sender][_projectId] + COOLDOWN, "Cooldown active");

        pocHashUsed[_pocHash] = true;
        lastSubmitTime[msg.sender][_projectId] = block.timestamp;

        submissionId = nextSubmissionId++;

        // Store as V2 submission but mark for V1 processing
        Submission storage sub = submissions[submissionId];
        sub.auditor = msg.sender;
        sub.projectId = _projectId;
        sub.commitHash = _pocHash;
        sub.cipherURI = _pocURI;
        sub.commitTimestamp = block.timestamp;
        sub.revealTimestamp = block.timestamp;
        sub.status = SubmissionStatus.Revealed;

        emit PoCSubmitted(submissionId, _projectId, msg.sender, _pocHash, _pocURI);
    }

    // ═══════════ CRE Report Processing (V2) ═══════════

    /// @notice Process verification report from CRE
    /// @dev V2 format: (submissionId, isValid, drainAmountWei)
    /// @param report Encoded report data from CRE
    function _processReport(bytes calldata report) internal override {
        (uint256 submissionId, bool isValid, uint256 drainAmountWei) = 
            abi.decode(report, (uint256, bool, uint256));

        Submission storage sub = submissions[submissionId];
        require(sub.status == SubmissionStatus.Revealed, "Not revealed");

        Project storage p = projects[sub.projectId];
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

            emit PoCVerified(submissionId, true, drainAmountWei, uint8(sub.severity));
        } else {
            sub.status = SubmissionStatus.Invalid;
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
        Project storage p = projects[sub.projectId];

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
        Project storage p = projects[sub.projectId];

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

        Project storage p = projects[sub.projectId];
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
    
    // Note: projects() and submissions() mappings are public and can be accessed directly
    // For full struct access, use the auto-generated getters from the public mappings

    /// @notice Check if a submission can be revealed
    /// @param _submissionId The submission ID
    /// @return canReveal Whether reveal is allowed
    function canReveal(uint256 _submissionId) external view returns (bool) {
        Submission storage sub = submissions[_submissionId];
        if (sub.status != SubmissionStatus.Committed) return false;
        if (sub.auditor != msg.sender) return false;

        Project storage p = projects[sub.projectId];
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
