// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {BountyHub} from "../src/BountyHub.sol";

contract BountyHubTest is Test {
    BountyHub public hub;
    address constant FORWARDER = address(0xF0);
    address constant TARGET = address(0xBEEF);
    bytes32 constant EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 constant COMMIT_BY_SIG_TYPEHASH = keccak256("CommitPoCBySig(address auditor,uint256 projectId,bytes32 commitHash,bytes32 cipherURIHash,uint256 nonce,uint256 deadline)");
    bytes32 constant REVEAL_BY_SIG_TYPEHASH = keccak256("RevealPoCBySig(address auditor,uint256 submissionId,bytes32 decryptionKey,bytes32 salt,uint256 nonce,uint256 deadline)");
    bytes32 constant QUEUE_REVEAL_BY_SIG_TYPEHASH = keccak256("QueueRevealBySig(address auditor,uint256 submissionId,bytes32 decryptionKey,bytes32 salt,uint256 nonce,uint256 deadline)");
    bytes32 constant ZERO_KEY = bytes32(0);
    address owner = address(this);
    address auditor = address(0xA1);
    address otherUser = address(0xA2);
    uint256 bySigAuditorPk = 0xA11CE;
    address bySigAuditor;

    function setUp() public {
        vm.warp(1000);
        hub = new BountyHub(FORWARDER);
        bySigAuditor = vm.addr(bySigAuditorPk);
        vm.deal(owner, 100 ether);
        vm.deal(auditor, 10 ether);
        vm.deal(bySigAuditor, 10 ether);
        vm.deal(otherUser, 10 ether);
    }

    function test_registerProject() public {
        uint256 projectId = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 12345);
        assertEq(projectId, 0);
        assertEq(hub.nextProjectId(), 1);
    }

    function test_registerProjectV2() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 commitDeadline = block.timestamp + 7 days;
        hub.registerProjectV2{value: 1 ether}(
            TARGET, 0.5 ether, 12345, BountyHub.CompetitionMode.MULTI,
            commitDeadline, block.timestamp + 14 days, 3 days, rules
        );
        assertEq(hub.nextProjectId(), 1);
    }

    function test_registerProjectV3() public {
        // Setup scopes
        BountyHub.ContractScope[] memory scopes = new BountyHub.ContractScope[](2);
        scopes[0] = BountyHub.ContractScope({
            contractAddress: address(0x1),
            name: "MainContract",
            ipfsCid: "QmTest1",
            verified: true
        });
        scopes[1] = BountyHub.ContractScope({
            contractAddress: address(0x2),
            name: "HelperContract",
            ipfsCid: "QmTest2",
            verified: true
        });

        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        // Register project
        uint256 projectId = hub.registerProjectV3{value: 1 ether}(
            "https://github.com/test/repo",
            scopes,
            TARGET,
            0.5 ether,  // maxPayout
            0,          // forkBlock
            BountyHub.CompetitionMode.UNIQUE,
            0, 0, 3600, // deadlines and dispute window
            rules
        );

        // Verify
        assertEq(projectId, 0, "First project should have ID 0");

        // Check project stored correctly
        BountyHub.Project memory project = hub.projects(projectId);

        assertEq(project.owner, address(this), "Owner should be caller");
        assertEq(project.bountyPool, 1 ether, "Bounty pool should be 1 ether");
        assertEq(project.repoUrl, "https://github.com/test/repo", "Repo URL should match");

        // Verify scopes via the mapping getter (returns individual fields as tuple)
        (
            address scope0Addr,
            string memory scope0Name,
            ,
        ) = hub.projectScopes(projectId, 0);
        assertEq(scope0Addr, address(0x1), "Scope 0 address should match");
        assertEq(scope0Name, "MainContract", "Scope 0 name should match");

        (
            address scope1Addr,
            string memory scope1Name,
            ,
        ) = hub.projectScopes(projectId, 1);
        assertEq(scope1Addr, address(0x2), "Scope 1 address should match");
        assertEq(scope1Name, "HelperContract", "Scope 1 name should match");
    }

    function test_commitPoC() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 salt = keccak256("salt");
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256("uri"), auditor, salt));

        vm.prank(auditor);
        hub.commitPoC(0, commitHash, "uri");
        assertTrue(hub.commitHashUsed(commitHash));
    }

    function test_commitPoC_setsSubmissionMetadataHash() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("salt-metadata");
        string memory cipherURI = "ipfs://oasis/metadata-pointer";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), auditor, salt));

        vm.prank(auditor);
        uint256 submissionId = hub.commitPoC(0, commitHash, cipherURI);

        assertEq(
            hub.submissionMetadataHash(submissionId),
            keccak256(bytes(cipherURI)),
            "Metadata hash should track cipher URI hash"
        );
    }

    function test_commitPoC_emitsMetadataEventWithLegacyCommitEvent() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("salt-metadata-event");
        string memory cipherURI = "ipfs://oasis/metadata-event";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), auditor, salt));
        bytes32 metadataHash = keccak256(bytes(cipherURI));

        vm.expectEmit(true, true, true, true);
        emit BountyHub.PoCCommitted(0, 0, auditor, commitHash);
        vm.expectEmit(true, false, false, true);
        emit BountyHub.PoCCommitMetadata(0, metadataHash);

        vm.prank(auditor);
        hub.commitPoC(0, commitHash, cipherURI);
    }

    function test_revealPoC() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 salt = keccak256("salt");
        string memory cipherURI = "uri";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), auditor, salt));
        bytes32 key = ZERO_KEY;

        vm.prank(auditor);
        hub.commitPoC(0, commitHash, cipherURI);

        vm.prank(auditor);
        hub.revealPoC(0, key, salt);
    }

    function test_revealPoC_rejectsNonZeroKey() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 salt = keccak256("salt-non-zero-key");
        string memory cipherURI = "uri";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), auditor, salt));

        vm.prank(auditor);
        uint256 submissionId = hub.commitPoC(0, commitHash, cipherURI);

        vm.expectRevert("Key must be zero");
        vm.prank(auditor);
        hub.revealPoC(submissionId, keccak256("real-key"), salt);
    }

    function test_uniqueCandidateBlocksSecondRevealUntilCandidateResolved() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);
        uint256 projectId = hub.registerProjectV2{value: 2 ether}(
            TARGET,
            1 ether,
            0,
            BountyHub.CompetitionMode.UNIQUE,
            0,
            0,
            1 days,
            rules
        );

        bytes32 saltA = keccak256("candidate-salt-a");
        bytes32 saltB = keccak256("candidate-salt-b");
        string memory uriA = "ipfs://candidate-a";
        string memory uriB = "ipfs://candidate-b";

        vm.prank(auditor);
        uint256 submissionA = hub.commitPoC(
            projectId,
            keccak256(abi.encodePacked(keccak256(bytes(uriA)), auditor, saltA)),
            uriA
        );

        vm.prank(otherUser);
        uint256 submissionB = hub.commitPoC(
            projectId,
            keccak256(abi.encodePacked(keccak256(bytes(uriB)), otherUser, saltB)),
            uriB
        );

        vm.prank(auditor);
        hub.revealPoC(submissionA, ZERO_KEY, saltA);

        vm.expectRevert("Candidate pending");
        vm.prank(otherUser);
        hub.revealPoC(submissionB, ZERO_KEY, saltB);

        vm.prank(FORWARDER);
        hub.onReport("", _buildReportV2(submissionA, false, 0));

        vm.prank(otherUser);
        hub.revealPoC(submissionB, ZERO_KEY, saltB);
    }

    function test_uniqueWinnerLocksAfterValidVerification() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);
        uint256 projectId = hub.registerProjectV2{value: 2 ether}(
            TARGET,
            1 ether,
            0,
            BountyHub.CompetitionMode.UNIQUE,
            0,
            0,
            1 days,
            rules
        );

        bytes32 saltA = keccak256("winner-salt-a");
        bytes32 saltB = keccak256("winner-salt-b");
        string memory uriA = "ipfs://winner-a";
        string memory uriB = "ipfs://winner-b";

        vm.prank(auditor);
        uint256 submissionA = hub.commitPoC(
            projectId,
            keccak256(abi.encodePacked(keccak256(bytes(uriA)), auditor, saltA)),
            uriA
        );

        vm.prank(otherUser);
        uint256 submissionB = hub.commitPoC(
            projectId,
            keccak256(abi.encodePacked(keccak256(bytes(uriB)), otherUser, saltB)),
            uriB
        );

        vm.prank(auditor);
        hub.revealPoC(submissionA, ZERO_KEY, saltA);

        vm.prank(FORWARDER);
        hub.onReport("", _buildReportV2(submissionA, true, 1 ether));

        vm.expectRevert("Winner locked");
        vm.prank(otherUser);
        hub.revealPoC(submissionB, ZERO_KEY, saltB);

        (bool hasCandidate,, bool winnerLocked, uint256 winnerSubmissionId) = hub.uniqueRevealStateByProject(projectId);
        assertTrue(!hasCandidate, "candidate should clear after winner lock");
        assertTrue(winnerLocked, "winner must be locked");
        assertEq(winnerSubmissionId, submissionA, "winner should be first valid candidate");
    }

    function test_commitHashBinding_preventsCopyClaimReuse() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 salt = keccak256("copy-claim-salt");
        string memory cipherURI = "ipfs://copy-claim";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), auditor, salt));

        vm.prank(auditor);
        hub.commitPoC(0, commitHash, cipherURI);

        vm.expectRevert("Duplicate commit");
        vm.prank(otherUser);
        hub.commitPoC(0, commitHash, cipherURI);
    }

    function test_commitPoCBySig_relayerCanCommitForAuditor() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("salt-bysig");
        string memory cipherURI = "ipfs://cipher-bysig";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));
        uint256 nonce = hub.sigNonces(bySigAuditor);
        uint256 deadline = block.timestamp + 1 days;
        bytes memory signature = _signCommitBySig(bySigAuditorPk, bySigAuditor, 0, commitHash, keccak256(bytes(cipherURI)), nonce, deadline);

        vm.prank(otherUser);
        uint256 submissionId = hub.commitPoCBySig(bySigAuditor, 0, commitHash, cipherURI, deadline, signature);

        BountyHub.Submission memory sub = _getSubmission(submissionId);
        assertEq(sub.auditor, bySigAuditor, "auditor should be signer");
        assertTrue(hub.commitHashUsed(commitHash), "commit hash should be consumed");
        assertEq(hub.sigNonces(bySigAuditor), nonce + 1, "nonce should increment");
    }

    function test_commitPoCBySig_rejectsReplayedSignature() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("salt-bysig");
        string memory cipherURI = "ipfs://cipher-bysig";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));
        uint256 nonce = hub.sigNonces(bySigAuditor);
        uint256 deadline = block.timestamp + 1 days;
        bytes memory signature = _signCommitBySig(bySigAuditorPk, bySigAuditor, 0, commitHash, keccak256(bytes(cipherURI)), nonce, deadline);

        vm.prank(otherUser);
        hub.commitPoCBySig(bySigAuditor, 0, commitHash, cipherURI, deadline, signature);

        vm.expectRevert("Invalid signer");
        vm.prank(otherUser);
        hub.commitPoCBySig(bySigAuditor, 0, commitHash, cipherURI, deadline, signature);
    }

    function test_revealPoCBySig_relayerCanRevealForAuditor() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("salt-bysig");
        string memory cipherURI = "ipfs://cipher-bysig";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));

        uint256 commitNonce = hub.sigNonces(bySigAuditor);
        uint256 commitDeadline = block.timestamp + 1 days;
        bytes memory commitSig = _signCommitBySig(bySigAuditorPk, bySigAuditor, 0, commitHash, keccak256(bytes(cipherURI)), commitNonce, commitDeadline);

        vm.prank(otherUser);
        uint256 submissionId = hub.commitPoCBySig(bySigAuditor, 0, commitHash, cipherURI, commitDeadline, commitSig);

        bytes32 decryptionKey = ZERO_KEY;
        uint256 revealNonce = hub.sigNonces(bySigAuditor);
        uint256 revealDeadline = block.timestamp + 1 days;
        bytes memory revealSig = _signRevealBySig(bySigAuditorPk, bySigAuditor, submissionId, decryptionKey, salt, revealNonce, revealDeadline);

        vm.warp(block.timestamp + 1);
        vm.prank(otherUser);
        hub.revealPoCBySig(bySigAuditor, submissionId, decryptionKey, salt, revealDeadline, revealSig);

        BountyHub.Submission memory sub = _getSubmission(submissionId);
        assertEq(uint8(sub.status), uint8(BountyHub.SubmissionStatus.Revealed), "status should be revealed");
        assertEq(sub.decryptionKey, ZERO_KEY, "key should remain zero");
        assertEq(hub.sigNonces(bySigAuditor), revealNonce + 1, "nonce should increment");
    }

    function test_revealPoCBySig_rejectsWrongSigner() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("salt-bysig");
        string memory cipherURI = "ipfs://cipher-bysig";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));
        uint256 commitNonce = hub.sigNonces(bySigAuditor);
        uint256 commitDeadline = block.timestamp + 1 days;
        bytes memory commitSig = _signCommitBySig(bySigAuditorPk, bySigAuditor, 0, commitHash, keccak256(bytes(cipherURI)), commitNonce, commitDeadline);

        vm.prank(otherUser);
        uint256 submissionId = hub.commitPoCBySig(bySigAuditor, 0, commitHash, cipherURI, commitDeadline, commitSig);

        uint256 wrongPk = 0xB0B;
        bytes32 decryptionKey = ZERO_KEY;
        uint256 revealNonce = hub.sigNonces(bySigAuditor);
        uint256 revealDeadline = block.timestamp + 1 days;
        bytes memory revealSig = _signRevealBySig(wrongPk, bySigAuditor, submissionId, decryptionKey, salt, revealNonce, revealDeadline);

        vm.warp(block.timestamp + 1);
        vm.expectRevert("Invalid signer");
        vm.prank(otherUser);
        hub.revealPoCBySig(bySigAuditor, submissionId, decryptionKey, salt, revealDeadline, revealSig);
    }

    function test_queueRevealBySig_andExecuteAfterCommitDeadline() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);
        uint256 commitDeadline = block.timestamp + 1 days;
        uint256 revealDeadline = block.timestamp + 2 days;
        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            0,
            BountyHub.CompetitionMode.MULTI,
            commitDeadline,
            revealDeadline,
            1 days,
            rules
        );

        bytes32 salt = keccak256("queue-salt");
        string memory cipherURI = "ipfs://queued-reveal";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));
        vm.prank(bySigAuditor);
        uint256 submissionId = hub.commitPoC(projectId, commitHash, cipherURI);

        bytes32 decryptionKey = ZERO_KEY;
        uint256 nonce = hub.sigNonces(bySigAuditor);
        bytes memory revealSig = _signQueueRevealBySig(bySigAuditorPk, bySigAuditor, submissionId, decryptionKey, salt, nonce, revealDeadline);

        vm.prank(otherUser);
        hub.queueRevealBySig(bySigAuditor, submissionId, decryptionKey, salt, revealDeadline, revealSig);

        (,,, uint256 queuedDeadline, bool queued) = hub.queuedReveals(submissionId);
        assertTrue(queued, "queued reveal should be stored");
        assertEq(queuedDeadline, revealDeadline, "queued deadline should match");

        vm.expectRevert("Reveal not started");
        vm.prank(otherUser);
        hub.executeQueuedReveal(submissionId);

        vm.warp(commitDeadline + 1);
        vm.prank(otherUser);
        hub.executeQueuedReveal(submissionId);

        BountyHub.Submission memory sub = _getSubmission(submissionId);
        assertEq(uint8(sub.status), uint8(BountyHub.SubmissionStatus.Revealed), "status should be revealed");
        (,,,, bool queueCleared) = hub.queuedReveals(submissionId);
        assertTrue(!queueCleared, "queued reveal should be cleared");
    }

    function test_queueRevealBySig_rejectsWrongSigner() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("queue-salt");
        string memory cipherURI = "ipfs://queued-reveal";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));
        vm.prank(bySigAuditor);
        uint256 submissionId = hub.commitPoC(0, commitHash, cipherURI);

        uint256 nonce = hub.sigNonces(bySigAuditor);
        uint256 deadline = block.timestamp + 1 days;
        bytes memory revealSig = _signQueueRevealBySig(0xB0B, bySigAuditor, submissionId, ZERO_KEY, salt, nonce, deadline);

        vm.expectRevert("Invalid signer");
        vm.prank(otherUser);
        hub.queueRevealBySig(bySigAuditor, submissionId, ZERO_KEY, salt, deadline, revealSig);
    }

    function test_queueRevealBySig_rejectsRevealSignatureType() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("queue-salt");
        string memory cipherURI = "ipfs://queued-reveal";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));
        vm.prank(bySigAuditor);
        uint256 submissionId = hub.commitPoC(0, commitHash, cipherURI);

        uint256 nonce = hub.sigNonces(bySigAuditor);
        uint256 deadline = block.timestamp + 1 days;
        bytes memory revealSig = _signRevealBySig(
            bySigAuditorPk,
            bySigAuditor,
            submissionId,
            ZERO_KEY,
            salt,
            nonce,
            deadline
        );

        vm.expectRevert("Invalid signer");
        vm.prank(otherUser);
        hub.queueRevealBySig(bySigAuditor, submissionId, ZERO_KEY, salt, deadline, revealSig);
    }

    function test_executeQueuedReveal_respectsSignatureDeadline() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("queue-salt");
        string memory cipherURI = "ipfs://queued-reveal";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));
        vm.prank(bySigAuditor);
        uint256 submissionId = hub.commitPoC(0, commitHash, cipherURI);

        uint256 nonce = hub.sigNonces(bySigAuditor);
        uint256 deadline = block.timestamp + 120;
        bytes memory revealSig = _signQueueRevealBySig(bySigAuditorPk, bySigAuditor, submissionId, ZERO_KEY, salt, nonce, deadline);

        vm.prank(otherUser);
        hub.queueRevealBySig(bySigAuditor, submissionId, ZERO_KEY, salt, deadline, revealSig);

        vm.warp(deadline + 1);
        vm.expectRevert("Signature expired");
        vm.prank(otherUser);
        hub.executeQueuedReveal(submissionId);
    }

    function test_revealPoC_clearsQueuedReveal() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        bytes32 salt = keccak256("queue-salt");
        string memory cipherURI = "ipfs://queued-reveal";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), bySigAuditor, salt));
        vm.prank(bySigAuditor);
        uint256 submissionId = hub.commitPoC(0, commitHash, cipherURI);

        bytes32 decryptionKey = ZERO_KEY;
        uint256 nonce = hub.sigNonces(bySigAuditor);
        uint256 deadline = block.timestamp + 1 days;
        bytes memory revealSig = _signQueueRevealBySig(bySigAuditorPk, bySigAuditor, submissionId, decryptionKey, salt, nonce, deadline);

        vm.prank(otherUser);
        hub.queueRevealBySig(bySigAuditor, submissionId, decryptionKey, salt, deadline, revealSig);

        vm.prank(bySigAuditor);
        hub.revealPoC(submissionId, decryptionKey, salt);

        (,,,, bool queued) = hub.queuedReveals(submissionId);
        assertTrue(!queued, "queued reveal should be cleared after direct reveal");
    }

    function test_submitPoC_V1_backwardCompat() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 pocHash = keccak256("poc");

        vm.prank(auditor);
        hub.submitPoC(0, pocHash, "ipfs://poc");
        assertTrue(hub.pocHashUsed(pocHash));
    }

    function _buildReportV2(uint256 subId, bool isValid, uint256 drain)
        internal pure returns (bytes memory)
    {
        return abi.encode(subId, isValid, drain);
    }

    function test_processReport_valid_V1() public {
        hub.registerProject{value: 5 ether}(TARGET, 2 ether, 0);
        vm.prank(auditor);
        hub.submitPoC(0, keccak256("poc"), "ipfs://poc");

        uint256 auditorBalBefore = auditor.balance;
        vm.prank(FORWARDER);
        hub.onReport("", _buildReportV2(0, true, 10 ether));

        assertGt(auditor.balance, auditorBalBefore);
    }

    function test_processReport_severity_critical() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);
        hub.registerProjectV2{value: 10 ether}(TARGET, 1 ether, 0, BountyHub.CompetitionMode.UNIQUE, 0, 0, 0, rules);

        bytes32 salt = keccak256("salt");
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256("uri"), auditor, salt));
        vm.prank(auditor);
        hub.commitPoC(0, commitHash, "uri");
        vm.prank(auditor);
        hub.revealPoC(0, ZERO_KEY, salt);

        vm.prank(FORWARDER);
        hub.onReport("", _buildReportV2(0, true, 10 ether));
    }

    function test_challenge() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);
        hub.registerProjectV2{value: 10 ether}(TARGET, 1 ether, 0, BountyHub.CompetitionMode.UNIQUE, 0, 0, 1 days, rules);

        bytes32 salt = keccak256("salt");
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256("uri"), auditor, salt));
        vm.prank(auditor);
        hub.commitPoC(0, commitHash, "uri");
        vm.prank(auditor);
        hub.revealPoC(0, ZERO_KEY, salt);

        vm.prank(FORWARDER);
        hub.onReport("", _buildReportV2(0, true, 10 ether));

        vm.deal(otherUser, 1 ether);
        vm.prank(otherUser);
        hub.challenge{value: 0.01 ether}(0);
    }

    function test_finalize() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);
        hub.registerProjectV2{value: 10 ether}(TARGET, 1 ether, 0, BountyHub.CompetitionMode.UNIQUE, 0, 0, 1 days, rules);

        bytes32 salt = keccak256("salt");
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256("uri"), auditor, salt));
        vm.prank(auditor);
        hub.commitPoC(0, commitHash, "uri");
        vm.prank(auditor);
        hub.revealPoC(0, ZERO_KEY, salt);

        vm.prank(FORWARDER);
        hub.onReport("", _buildReportV2(0, true, 10 ether));

        vm.warp(block.timestamp + 2 days);

        uint256 auditorBalBefore = auditor.balance;
        hub.finalize(0);

        assertGt(auditor.balance, auditorBalBefore);
    }

    function test_finalize_timeoutPenalty() public {
        (uint256 pid, uint256 subId) = _registerCommitAndReveal(5 ether, 2 ether);
        
        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(subId, true, 1 ether)); // drainAmount = 1 ETH
        
        // Get initial payout amount (should be 0.6 ETH = 60% of 1 ETH maxPayout for HIGH severity)
        BountyHub.Submission memory subBefore = _getSubmission(subId);
        uint256 payoutBefore = subBefore.payoutAmount;
        
        // Warp past dispute window
        vm.warp(subBefore.disputeDeadline + 1);
        
        uint256 auditorBalBefore = auditor.balance;
        
        // Finalize
        hub.finalize(subId);
        
        // Verify payout includes 5% penalty
        uint256 expectedPenalty = (payoutBefore * 500) / 10000; // 5%
        uint256 expectedTotal = payoutBefore + expectedPenalty;
        
        assertEq(auditor.balance - auditorBalBefore, expectedTotal, "Should include timeout penalty");
        
        // Verify status
        BountyHub.Submission memory subAfter = _getSubmission(subId);
        assertEq(uint8(subAfter.status), uint8(BountyHub.SubmissionStatus.Finalized));
    }

    // ============ ESCROW TESTS ============

    function test_processReport_noImmediatePayout() public {
        // Setup
        (uint256 pid, uint256 subId) = _registerCommitAndReveal(5 ether, 2 ether);

        uint256 auditorBalBefore = auditor.balance;
        uint256 contractBalBefore = address(hub).balance;

        // Process report
        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(subId, true, 1 ether)); // drainAmount = 1 ETH

        // Verify NO immediate payout
        assertEq(auditor.balance, auditorBalBefore, "Auditor should not receive immediate payout");

        // Verify status is Verified (not Finalized)
        BountyHub.Submission memory sub = _getSubmission(subId);
        assertEq(uint8(sub.status), uint8(BountyHub.SubmissionStatus.Verified), "Status should be Verified");

        // Verify disputeDeadline is set
        assertGt(sub.disputeDeadline, block.timestamp, "Dispute deadline should be future");

        // Verify payoutAmount is set (calculated from severity)
        assertGt(sub.payoutAmount, 0, "Payout amount should be set");

        // Verify contract still holds the funds
        assertEq(address(hub).balance, contractBalBefore, "Contract balance should not change");
    }

    function test_finalize_payoutAfterDisputeWindow() public {
        (uint256 pid, uint256 subId) = _registerCommitAndReveal(5 ether, 2 ether);

        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(subId, true, 1 ether));

        // Get dispute deadline
        BountyHub.Submission memory subBefore = _getSubmission(subId);
        uint256 disputeDeadline = subBefore.disputeDeadline;

        // Warp past dispute window
        vm.warp(disputeDeadline + 1);

        uint256 auditorBalBefore = auditor.balance;

        // Finalize
        hub.finalize(subId);

        // Verify payout happened
        BountyHub.Submission memory subAfter = _getSubmission(subId);
        assertEq(uint8(subAfter.status), uint8(BountyHub.SubmissionStatus.Finalized), "Status should be Finalized");
        assertGt(auditor.balance, auditorBalBefore, "Auditor should receive payout");
    }

    function test_finalize_beforeDeadline_reverts() public {
        (uint256 pid, uint256 subId) = _registerCommitAndReveal(5 ether, 2 ether);

        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(subId, true, 1 ether));

        // Try to finalize immediately (before dispute deadline)
        vm.expectRevert("Dispute window open");
        hub.finalize(subId);
    }

    function test_challenge_duringDisputeWindow() public {
        (uint256 pid, uint256 subId) = _registerCommitAndReveal(5 ether, 2 ether);

        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(subId, true, 1 ether));

        // Challenge
        vm.deal(otherUser, 1 ether);
        vm.prank(otherUser);
        hub.challenge{value: 0.1 ether}(subId);

        // Verify challenge recorded
        BountyHub.Submission memory sub = _getSubmission(subId);
        assertTrue(sub.challenged, "Should be challenged");
        assertEq(sub.challenger, otherUser, "Challenger should be otherUser");
        assertEq(sub.challengeBond, 0.1 ether, "Bond should be 0.1 ether");
        assertEq(uint8(sub.status), uint8(BountyHub.SubmissionStatus.Disputed), "Status should be Disputed");
    }

    function test_submissionMetadataHash_disputeAndFinalizeFlowUnchanged() public {
        (uint256 pid, uint256 subId) = _registerCommitAndReveal(5 ether, 2 ether);
        bytes32 expectedMetadataHash = keccak256(bytes("uri"));

        assertEq(hub.submissionMetadataHash(subId), expectedMetadataHash, "Metadata hash should persist after reveal");

        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(subId, true, 1 ether));

        vm.deal(otherUser, 1 ether);
        vm.prank(otherUser);
        hub.challenge{value: 0.1 ether}(subId);

        BountyHub.Submission memory disputed = _getSubmission(subId);
        assertEq(uint8(disputed.status), uint8(BountyHub.SubmissionStatus.Disputed), "Should remain disputable");
        assertEq(
            hub.submissionMetadataHash(subId),
            expectedMetadataHash,
            "Metadata hash should persist during dispute"
        );

        hub.resolveDispute(subId, false);

        BountyHub.Submission memory resolved = _getSubmission(subId);
        assertEq(
            uint8(resolved.status),
            uint8(BountyHub.SubmissionStatus.Verified),
            "Owner resolution should keep payout flow"
        );

        vm.warp(resolved.disputeDeadline + 1);
        uint256 auditorBalBefore = auditor.balance;
        hub.finalize(subId);

        assertGt(auditor.balance, auditorBalBefore, "Finalize payout should remain unchanged");
        assertEq(
            hub.submissionMetadataHash(subId),
            expectedMetadataHash,
            "Metadata hash should persist after finalize"
        );
    }

    // ============ HELPER FUNCTIONS ============

    function _registerCommitAndReveal(uint256 bounty, uint256 maxPayout) internal returns (uint256 pid, uint256 subId) {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);
        pid = hub.registerProjectV2{value: bounty}(TARGET, maxPayout, 0, BountyHub.CompetitionMode.UNIQUE, 0, 0, 1 days, rules);

        bytes32 commitHash = keccak256(abi.encodePacked(keccak256("uri"), auditor, keccak256("salt")));
        vm.prank(auditor);
        subId = hub.commitPoC(pid, commitHash, "uri");

        vm.warp(block.timestamp + 1); // Ensure reveal after commit
        vm.prank(auditor);
        hub.revealPoC(subId, ZERO_KEY, keccak256("salt"));
    }

    function _getSubmission(uint256 subId) internal view returns (BountyHub.Submission memory sub) {
        (sub.auditor, sub.projectId, sub.commitHash, sub.cipherURI, sub.decryptionKey, sub.salt, 
         sub.commitTimestamp, sub.revealTimestamp, sub.status, sub.drainAmountWei, sub.severity, 
         sub.payoutAmount, sub.disputeDeadline, sub.challenged, sub.challenger, sub.challengeBond) = hub.submissions(subId);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("BountyHub")),
                keccak256(bytes("1")),
                block.chainid,
                address(hub)
            )
        );
    }

    function _signCommitBySig(
        uint256 pk,
        address signer,
        uint256 projectId,
        bytes32 commitHash,
        bytes32 cipherURIHash,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(COMMIT_BY_SIG_TYPEHASH, signer, projectId, commitHash, cipherURIHash, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signRevealBySig(
        uint256 pk,
        address signer,
        uint256 submissionId,
        bytes32 decryptionKey,
        bytes32 salt,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(REVEAL_BY_SIG_TYPEHASH, signer, submissionId, decryptionKey, salt, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signQueueRevealBySig(
        uint256 pk,
        address signer,
        uint256 submissionId,
        bytes32 decryptionKey,
        bytes32 salt,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(QUEUE_REVEAL_BY_SIG_TYPEHASH, signer, submissionId, decryptionKey, salt, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ============ ENCRYPTION TESTS ============

    function test_updateProjectPublicKey_onlyForwarder() public {
        uint256 projectId = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes memory publicKey = hex"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"; // 64 bytes

        // Non-forwarder should fail
        vm.expectRevert("Not authorized");
        hub.updateProjectPublicKey(projectId, publicKey);

        // Forwarder should succeed
        vm.prank(address(hub.getForwarderAddress()));
        hub.updateProjectPublicKey(projectId, publicKey);
    }

    function test_updateProjectPublicKey_emitsEvent() public {
        uint256 projectId = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes memory publicKey = hex"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"; // 64 bytes

        vm.prank(address(hub.getForwarderAddress()));
        vm.expectEmit(true, true, false, true);
        emit BountyHub.ProjectPublicKeyUpdated(projectId, publicKey);
        hub.updateProjectPublicKey(projectId, publicKey);
    }

    function test_updateProjectPublicKey_storesKey() public {
        uint256 projectId = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes memory publicKey = hex"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"; // 64 bytes

        // Get project before update
        bytes memory initialKey = hub.projects(projectId).projectPublicKey;
        assertEq(initialKey.length, 0, "Initial key should be empty");

        // Update key
        vm.prank(address(hub.getForwarderAddress()));
        hub.updateProjectPublicKey(projectId, publicKey);

        // Verify key is stored
        bytes memory storedKey = hub.projects(projectId).projectPublicKey;
        assertEq(storedKey, publicKey, "Public key should be stored correctly");
    }

    function test_commitReveal_withProjectPublicKey() public {
        // 1. Register project V2
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);
        uint256 projectId = hub.registerProjectV2{value: 10 ether}(
            TARGET, 1 ether, 0, BountyHub.CompetitionMode.UNIQUE, 0, 0, 1 days, rules
        );

        // 2. Update projectPublicKey via Forwarder
        bytes memory publicKey = hex"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        vm.prank(address(hub.getForwarderAddress()));
        hub.updateProjectPublicKey(projectId, publicKey);

        // Verify key is stored
        bytes memory storedKey = hub.projects(projectId).projectPublicKey;
        assertEq(storedKey, publicKey, "Public key should be stored");

        // 3. Commit PoC
        bytes32 salt = keccak256("salt");
        string memory cipherURI = "ipfs://encrypted-poc";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), auditor, salt));

        vm.prank(auditor);
        uint256 submissionId = hub.commitPoC(projectId, commitHash, cipherURI);

        // Verify commit
        assertTrue(hub.commitHashUsed(commitHash), "Commit hash should be marked as used");
        BountyHub.Submission memory sub = _getSubmission(submissionId);
        assertEq(uint8(sub.status), uint8(BountyHub.SubmissionStatus.Committed), "Status should be Committed");
        assertEq(sub.commitHash, commitHash, "Commit hash should match");
        assertEq(sub.cipherURI, cipherURI, "Cipher URI should match");
        assertEq(sub.auditor, auditor, "Auditor should be set");

        // 4. Reveal PoC
        bytes32 decryptionKey = ZERO_KEY;
        vm.warp(block.timestamp + 1); // Ensure reveal after commit
        vm.prank(auditor);
        hub.revealPoC(submissionId, decryptionKey, salt);

        // 5. Verify submission state after reveal
        sub = _getSubmission(submissionId);
        assertEq(uint8(sub.status), uint8(BountyHub.SubmissionStatus.Revealed), "Status should be Revealed");
        assertEq(sub.decryptionKey, ZERO_KEY, "Decryption key should remain zero");
        assertEq(sub.salt, salt, "Salt should be set");
        assertGt(sub.revealTimestamp, 0, "Reveal timestamp should be set");
        assertGt(sub.revealTimestamp, sub.commitTimestamp, "Reveal should be after commit");
    }

    // ═══════════════════ V3 Integration Tests ═══════════════════

    function test_registerProjectV3_ManyScopes() public {
        // Create 10 scopes to test multi-contract support
        BountyHub.ContractScope[] memory scopes = new BountyHub.ContractScope[](10);
        for (uint256 i = 0; i < 10; i++) {
            scopes[i] = BountyHub.ContractScope({
                contractAddress: address(uint160(i + 1)),
                name: string(abi.encodePacked("Contract", i)),
                ipfsCid: string(abi.encodePacked("QmTest", i)),
                verified: i % 2 == 0
            });
        }

        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV3{value: 10 ether}(
            "https://github.com/test/multi-contract",
            scopes,
            TARGET,
            1 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        assertEq(projectId, 0);
        
        for (uint256 i = 0; i < 10; i++) {
            (address addr,,, bool verified) = hub.projectScopes(projectId, i);
            assertEq(addr, address(uint160(i + 1)));
            assertEq(verified, i % 2 == 0);
        }
    }

    function test_registerProjectV3_ZeroScopes() public {
        BountyHub.ContractScope[] memory scopes = new BountyHub.ContractScope[](0);

        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV3{value: 1 ether}(
            "https://github.com/test/empty",
            scopes,
            TARGET,
            0.5 ether,
            0,
            BountyHub.CompetitionMode.UNIQUE,
            0, 0, 3600,
            rules
        );

        assertEq(projectId, 0);
        assertEq(hub.projects(projectId).repoUrl, "https://github.com/test/empty");
    }
}
