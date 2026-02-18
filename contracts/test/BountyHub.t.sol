// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {BountyHub} from "../src/BountyHub.sol";

contract BountyHubTest is Test {
    BountyHub public hub;
    address constant FORWARDER = address(0xF0);
    address constant TARGET = address(0xBEEF);
    address owner = address(this);
    address auditor = address(0xA1);
    address otherUser = address(0xA2);

    function setUp() public {
        vm.warp(1000);
        hub = new BountyHub(FORWARDER);
        vm.deal(owner, 100 ether);
        vm.deal(auditor, 10 ether);
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

    function test_commitPoC() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 salt = keccak256("salt");
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256("uri"), auditor, salt));

        vm.prank(auditor);
        hub.commitPoC(0, commitHash, "uri");
        assertTrue(hub.commitHashUsed(commitHash));
    }

    function test_revealPoC() public {
        hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 salt = keccak256("salt");
        string memory cipherURI = "uri";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherURI)), auditor, salt));
        bytes32 key = keccak256("key");

        vm.prank(auditor);
        hub.commitPoC(0, commitHash, cipherURI);

        vm.prank(auditor);
        hub.revealPoC(0, key, salt);
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
        hub.revealPoC(0, keccak256("key"), salt);

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
        hub.revealPoC(0, keccak256("key"), salt);

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
        hub.revealPoC(0, keccak256("key"), salt);

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
        hub.revealPoC(subId, keccak256("key"), keccak256("salt"));
    }

    function _getSubmission(uint256 subId) internal view returns (BountyHub.Submission memory sub) {
        (sub.auditor, sub.projectId, sub.commitHash, sub.cipherURI, sub.decryptionKey, sub.salt, 
         sub.commitTimestamp, sub.revealTimestamp, sub.status, sub.drainAmountWei, sub.severity, 
         sub.payoutAmount, sub.disputeDeadline, sub.challenged, sub.challenger, sub.challengeBond) = hub.submissions(subId);
    }
}
