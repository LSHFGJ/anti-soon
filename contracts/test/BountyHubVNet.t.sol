// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {BountyHub} from "../src/BountyHub.sol";

contract BountyHubVNetTest is Test {
    BountyHub public hub;
    address constant FORWARDER = address(0xF0);
    address constant TARGET = address(0xBEEF);
    bytes4 constant REPORT_ENVELOPE_MAGIC = 0x41535250;
    uint8 constant REPORT_TYPE_VNET_SUCCESS = 1;
    uint8 constant REPORT_TYPE_VNET_FAILED = 2;
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

        assertEq(uint8(hub.projects(projectId).vnetStatus), uint8(BountyHub.VnetStatus.Pending), "VNet status should be Pending");
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

        BountyHub.Project memory p = hub.projects(projectId);

        assertEq(uint8(p.vnetStatus), uint8(BountyHub.VnetStatus.Active), "VNet status should be Active");
        assertEq(p.vnetRpcUrl, vnetRpcUrl, "RPC URL should match");
        assertEq(p.baseSnapshotId, baseSnapshotId, "Snapshot ID should match");
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

        assertEq(uint8(hub.projects(projectId).vnetStatus), uint8(BountyHub.VnetStatus.Failed), "VNet status should be Failed");
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

    function test_onReport_vnetSuccessEnvelope_updatesProjectVnet() public {
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

        string memory vnetRpcUrl = "https://rpc.tenderly.co/from-report";
        bytes32 baseSnapshotId = keccak256("report-snapshot");
        bytes memory payload = abi.encode(projectId, vnetRpcUrl, baseSnapshotId);
        bytes memory report = _buildTypedReport(REPORT_TYPE_VNET_SUCCESS, payload);

        vm.prank(FORWARDER);
        hub.onReport("", report);

        BountyHub.Project memory p = hub.projects(projectId);
        assertEq(uint8(p.vnetStatus), uint8(BountyHub.VnetStatus.Active), "VNet status should be Active");
        assertEq(p.vnetRpcUrl, vnetRpcUrl, "RPC URL should match report payload");
        assertEq(p.baseSnapshotId, baseSnapshotId, "Snapshot ID should match report payload");
    }

    function test_onReport_vnetFailedEnvelope_marksFailed() public {
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

        bytes memory payload = abi.encode(projectId, "vnet failed in workflow");
        bytes memory report = _buildTypedReport(REPORT_TYPE_VNET_FAILED, payload);

        vm.prank(FORWARDER);
        hub.onReport("", report);

        assertEq(uint8(hub.projects(projectId).vnetStatus), uint8(BountyHub.VnetStatus.Failed), "VNet status should be Failed");
    }

    function test_onReport_unknownTypedReport_reverts() public {
        bytes memory report = _buildTypedReport(99, abi.encode(uint256(1)));

        vm.expectRevert("Unknown report type");
        vm.prank(FORWARDER);
        hub.onReport("", report);
    }

    function _buildTypedReport(uint8 reportType, bytes memory payload) internal pure returns (bytes memory) {
        return abi.encode(REPORT_ENVELOPE_MAGIC, reportType, payload);
    }
}
