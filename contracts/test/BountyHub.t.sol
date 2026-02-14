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
        vm.warp(1000); // ensure block.timestamp > COOLDOWN so first submitPoC passes
        hub = new BountyHub(FORWARDER);
        vm.deal(owner, 100 ether);
        vm.deal(auditor, 10 ether);
        vm.deal(otherUser, 10 ether);
    }

    // ──────────── registerProject ────────────

    function test_registerProject() public {
        uint256 projectId = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 12345);
        assertEq(projectId, 0);

        (
            address pOwner,
            uint256 bountyPool,
            uint256 maxPayout,
            address target,
            uint256 forkBlock,
            bool active
        ) = hub.projects(projectId);

        assertEq(pOwner, owner);
        assertEq(bountyPool, 1 ether);
        assertEq(maxPayout, 0.5 ether);
        assertEq(target, TARGET);
        assertEq(forkBlock, 12345);
        assertTrue(active);
        assertEq(hub.nextProjectId(), 1);
    }

    function test_registerProject_revert_noDeposit() public {
        vm.expectRevert("Must deposit bounty");
        hub.registerProject{value: 0}(TARGET, 0.5 ether, 12345);
    }

    function test_registerProject_revert_zeroAddress() public {
        vm.expectRevert("Invalid target");
        hub.registerProject{value: 1 ether}(address(0), 0.5 ether, 12345);
    }

    // ──────────── topUpBounty ────────────

    function test_topUpBounty() public {
        uint256 pid = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        hub.topUpBounty{value: 2 ether}(pid);

        (, uint256 bountyPool,,,,) = hub.projects(pid);
        assertEq(bountyPool, 3 ether);
    }

    function test_topUpBounty_revert_notOwner() public {
        uint256 pid = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        vm.prank(otherUser);
        vm.expectRevert("Not owner");
        hub.topUpBounty{value: 1 ether}(pid);
    }

    // ──────────── submitPoC ────────────

    function test_submitPoC() public {
        uint256 pid = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 pocHash = keccak256("poc-1");

        vm.prank(auditor);
        uint256 subId = hub.submitPoC(pid, pocHash, "ipfs://poc1");
        assertEq(subId, 0);

        (
            address sAuditor,
            uint256 sProjectId,
            bytes32 sPocHash,
            string memory sPocURI,
            uint256 sTimestamp,
            BountyHub.SubmissionStatus sStatus
        ) = hub.submissions(subId);

        assertEq(sAuditor, auditor);
        assertEq(sProjectId, pid);
        assertEq(sPocHash, pocHash);
        assertEq(sPocURI, "ipfs://poc1");
        assertEq(sTimestamp, block.timestamp);
        assertEq(uint8(sStatus), uint8(BountyHub.SubmissionStatus.Pending));
        assertTrue(hub.pocHashUsed(pocHash));
        assertEq(hub.nextSubmissionId(), 1);
    }

    function test_submitPoC_emits_event() public {
        uint256 pid = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 pocHash = keccak256("poc-event");

        vm.prank(auditor);
        vm.expectEmit(true, true, true, true);
        emit BountyHub.PoCSubmitted(0, pid, auditor, pocHash, "ipfs://poc-event");
        hub.submitPoC(pid, pocHash, "ipfs://poc-event");
    }

    function test_submitPoC_revert_duplicate() public {
        uint256 pid = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);
        bytes32 pocHash = keccak256("dup");

        vm.prank(auditor);
        hub.submitPoC(pid, pocHash, "ipfs://dup");

        vm.warp(block.timestamp + 11 minutes);
        vm.prank(auditor);
        vm.expectRevert("Duplicate PoC");
        hub.submitPoC(pid, pocHash, "ipfs://dup");
    }

    function test_submitPoC_revert_cooldown() public {
        uint256 pid = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        vm.prank(auditor);
        hub.submitPoC(pid, keccak256("a"), "ipfs://a");

        vm.prank(auditor);
        vm.expectRevert("Cooldown active");
        hub.submitPoC(pid, keccak256("b"), "ipfs://b");
    }

    function test_submitPoC_after_cooldown() public {
        uint256 pid = hub.registerProject{value: 1 ether}(TARGET, 0.5 ether, 0);

        vm.prank(auditor);
        hub.submitPoC(pid, keccak256("c"), "ipfs://c");

        vm.warp(block.timestamp + 10 minutes);

        vm.prank(auditor);
        uint256 subId = hub.submitPoC(pid, keccak256("d"), "ipfs://d");
        assertEq(subId, 1);
    }

    // ──────────── _processReport (via onReport) ────────────

    function _registerAndSubmit(uint256 bounty, uint256 maxPayout)
        internal
        returns (uint256 pid, uint256 subId)
    {
        pid = hub.registerProject{value: bounty}(TARGET, maxPayout, 0);
        vm.prank(auditor);
        subId = hub.submitPoC(pid, keccak256(abi.encodePacked("sub-", bounty, maxPayout)), "ipfs://sub");
    }

    function _buildReport(uint256 subId, bool isValid, uint256 severity, uint256 payout)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(subId, isValid, severity, payout);
    }

    function test_processReport_valid() public {
        (uint256 pid, uint256 subId) = _registerAndSubmit(5 ether, 2 ether);
        bytes memory report = _buildReport(subId, true, 8, 1 ether);

        uint256 auditorBalBefore = auditor.balance;

        vm.prank(FORWARDER);
        hub.onReport("", report);

        // Check payout
        assertEq(auditor.balance, auditorBalBefore + 1 ether);

        // Check submission status
        (,,,,, BountyHub.SubmissionStatus status) = hub.submissions(subId);
        assertEq(uint8(status), uint8(BountyHub.SubmissionStatus.Valid));

        // Check pool decreased
        (, uint256 pool,,,,) = hub.projects(pid);
        assertEq(pool, 4 ether);
    }

    function test_processReport_invalid() public {
        (, uint256 subId) = _registerAndSubmit(5 ether, 2 ether);
        bytes memory report = _buildReport(subId, false, 0, 0);

        uint256 auditorBalBefore = auditor.balance;

        vm.prank(FORWARDER);
        hub.onReport("", report);

        // No payout
        assertEq(auditor.balance, auditorBalBefore);

        // Check submission status
        (,,,,, BountyHub.SubmissionStatus status) = hub.submissions(subId);
        assertEq(uint8(status), uint8(BountyHub.SubmissionStatus.Invalid));
    }

    function test_processReport_caps_at_maxPayout() public {
        (uint256 pid, uint256 subId) = _registerAndSubmit(5 ether, 0.5 ether);
        // Request 2 ether but maxPayout is 0.5 ether
        bytes memory report = _buildReport(subId, true, 10, 2 ether);

        uint256 auditorBalBefore = auditor.balance;

        vm.prank(FORWARDER);
        hub.onReport("", report);

        assertEq(auditor.balance, auditorBalBefore + 0.5 ether);

        (, uint256 pool,,,,) = hub.projects(pid);
        assertEq(pool, 4.5 ether);
    }

    function test_processReport_caps_at_pool() public {
        (uint256 pid, uint256 subId) = _registerAndSubmit(0.3 ether, 10 ether);
        // Request 5 ether, maxPayout 10 ether, but pool is only 0.3 ether
        bytes memory report = _buildReport(subId, true, 10, 5 ether);

        uint256 auditorBalBefore = auditor.balance;

        vm.prank(FORWARDER);
        hub.onReport("", report);

        assertEq(auditor.balance, auditorBalBefore + 0.3 ether);

        (, uint256 pool,,,,) = hub.projects(pid);
        assertEq(pool, 0);
    }

    function test_processReport_revert_alreadyProcessed() public {
        (, uint256 subId) = _registerAndSubmit(5 ether, 2 ether);
        bytes memory report = _buildReport(subId, true, 8, 1 ether);

        vm.prank(FORWARDER);
        hub.onReport("", report);

        // Second call should revert
        vm.prank(FORWARDER);
        vm.expectRevert("Already processed");
        hub.onReport("", report);
    }
}
