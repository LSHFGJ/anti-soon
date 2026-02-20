// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {BountyHub} from "../src/BountyHub.sol";

contract BountyHubVNetTest is Test {
    BountyHub public hub;
    address constant FORWARDER = address(0xF0);
    address constant TARGET = address(0xBEEF);
    address owner = address(this);
    address otherUser = address(0xA2);

    function setUp() public {
        vm.warp(1000);
        hub = new BountyHub(FORWARDER);
        vm.deal(owner, 100 ether);
        vm.deal(otherUser, 10 ether);
    }

    // ============ VNET STATUS TESTS ============

    function test_registerProjectV2_setsPendingStatus() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        (, , , , , , , , , , , , BountyHub.VnetStatus vnetStatus, , , ) = hub.projects(projectId);
        assertEq(uint8(vnetStatus), uint8(BountyHub.VnetStatus.Pending), "VNet status should be Pending");
    }

    // ============ SET PROJECT VNET TESTS ============

    function test_setProjectVnet_onlyForwarder() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        // Non-forwarder should fail
        vm.expectRevert("Not authorized");
        hub.setProjectVnet(projectId, "https://rpc.tenderly.co/123", keccak256("snap"));
    }

    function test_setProjectVnet_storesFields() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        string memory vnetRpcUrl = "https://rpc.tenderly.co/123";
        bytes32 baseSnapshotId = keccak256("snap");

        vm.prank(FORWARDER);
        hub.setProjectVnet(projectId, vnetRpcUrl, baseSnapshotId);

        (, , , , , , , , , , , , BountyHub.VnetStatus vnetStatus, string memory storedRpcUrl, bytes32 storedSnapshotId, ) = hub.projects(projectId);

        assertEq(uint8(vnetStatus), uint8(BountyHub.VnetStatus.Active), "VNet status should be Active");
        assertEq(storedRpcUrl, vnetRpcUrl, "RPC URL should match");
        assertEq(storedSnapshotId, baseSnapshotId, "Snapshot ID should match");
    }

    function test_setProjectVnet_emitsEvent() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        string memory vnetRpcUrl = "https://rpc.tenderly.co/123";
        bytes32 baseSnapshotId = keccak256("snap");

        vm.prank(FORWARDER);
        vm.expectEmit(true, true, false, true);
        emit BountyHub.ProjectVnetCreated(projectId, vnetRpcUrl, baseSnapshotId);
        hub.setProjectVnet(projectId, vnetRpcUrl, baseSnapshotId);
    }

    function test_setProjectVnet_revertsIfAlreadyActive() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        // Set VNet to Active
        vm.prank(FORWARDER);
        hub.setProjectVnet(projectId, "https://rpc.tenderly.co/123", keccak256("snap"));

        // Try to set again
        vm.prank(FORWARDER);
        vm.expectRevert("VNet already set");
        hub.setProjectVnet(projectId, "https://rpc.tenderly.co/456", keccak256("snap2"));
    }

    // ============ MARK VNET FAILED TESTS ============

    function test_markVnetFailed_onlyForwarder() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        // Non-forwarder should fail
        vm.expectRevert("Not authorized");
        hub.markVnetFailed(projectId, "Failed to create fork");
    }

    function test_markVnetFailed_updatesStatus() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        string memory reason = "Failed to create fork";

        vm.prank(FORWARDER);
        hub.markVnetFailed(projectId, reason);

        (, , , , , , , , , , , , BountyHub.VnetStatus vnetStatus, , , ) = hub.projects(projectId);
        assertEq(uint8(vnetStatus), uint8(BountyHub.VnetStatus.Failed), "VNet status should be Failed");
    }

    function test_markVnetFailed_emitsEvent() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        string memory reason = "Failed to create fork";

        vm.prank(FORWARDER);
        vm.expectEmit(true, false, false, true);
        emit BountyHub.ProjectVnetFailed(projectId, reason);
        hub.markVnetFailed(projectId, reason);
    }
}
