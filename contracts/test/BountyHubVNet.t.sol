// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {BountyHub} from "../src/BountyHub.sol";
import {DeployBountyHubV4} from "../script/DeployBountyHubV4.s.sol";

contract BountyHubVNetTest is Test {
    BountyHub public hub;
    DeployBountyHubV4 internal deployScript;
    address constant FORWARDER = address(0xF0);
    address constant TARGET = address(0xBEEF);
    address constant WORKFLOW_OWNER = address(0xCAFE);
    bytes4 constant REPORT_ENVELOPE_MAGIC = 0x41535250;
    uint8 constant REPORT_TYPE_VNET_SUCCESS = 1;
    uint8 constant REPORT_TYPE_VNET_FAILED = 2;
    bytes4 constant INVALID_SENDER_SELECTOR = bytes4(keccak256("InvalidSender(address,address)"));
    bytes32 constant WORKFLOW_VERIFY_POC_ID = keccak256("verify-poc");
    bytes32 constant WORKFLOW_VNET_INIT_ID = keccak256("vnet-init");
    bytes10 constant WORKFLOW_NAME = bytes10("vnetinit01");
    address owner = address(this);
    address otherUser = address(0xA2);

    function setUp() public {
        vm.warp(1000);
        hub = new BountyHub(FORWARDER);
        deployScript = new DeployBountyHubV4();
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

    function test_onlyOwnerCanSetExpectedAuthor() public {
        address expectedAuthor = WORKFLOW_OWNER;

        vm.expectRevert();
        vm.prank(otherUser);
        hub.setExpectedAuthor(expectedAuthor);

        assertEq(hub.getExpectedAuthor(), address(0), "Author pin should remain unset");

        hub.setExpectedAuthor(expectedAuthor);
        assertEq(hub.getExpectedAuthor(), expectedAuthor, "Owner should be able to pin author");
    }

    function test_rejectsForwarderZeroInProductionConfigPath() public {
        hub.setForwarderAddress(address(0));

        vm.expectRevert("Unsafe forwarder config");
        deployScript.configureProductionPins(hub, WORKFLOW_OWNER);

        assertEq(hub.getExpectedAuthor(), address(0), "Unsafe path should not pin author");
    }

    function test_productionInit_setsAuthorAndForwarder() public {
        test_onlyOwnerCanSetExpectedAuthor();
    }

    function test_productionInit_revertsOnUnsafePinning() public {
        test_rejectsForwarderZeroInProductionConfigPath();
    }

    function test_onReport_revertsForUnauthorizedSender_beforeProvenanceChecks() public {
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

        bytes memory payload = abi.encode(projectId, "https://rpc.tenderly.co/from-report", keccak256("report-snapshot"));
        bytes memory report = _buildTypedReport(REPORT_TYPE_VNET_SUCCESS, payload);

        vm.expectRevert(abi.encodeWithSelector(INVALID_SENDER_SELECTOR, otherUser, FORWARDER));
        vm.prank(otherUser);
        hub.onReport(_metadataForWorkflow(WORKFLOW_VNET_INIT_ID), report);
    }

    function test_onReport_acceptsAuthorizedWorkflowMetadata() public {
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

        // Multi-workflow provenance: both verification and vnet-init workflows are authorized.
        hub.setAuthorizedWorkflow(WORKFLOW_VERIFY_POC_ID, true);
        hub.setAuthorizedWorkflow(WORKFLOW_VNET_INIT_ID, true);

        string memory vnetRpcUrl = "https://rpc.tenderly.co/authorized";
        bytes32 baseSnapshotId = keccak256("authorized-snapshot");
        bytes memory payload = abi.encode(projectId, vnetRpcUrl, baseSnapshotId);
        bytes memory report = _buildTypedReport(REPORT_TYPE_VNET_SUCCESS, payload);

        vm.prank(FORWARDER);
        hub.onReport(_metadataForWorkflow(WORKFLOW_VNET_INIT_ID), report);

        BountyHub.Project memory p = hub.projects(projectId);
        assertEq(uint8(p.vnetStatus), uint8(BountyHub.VnetStatus.Active), "VNet status should be Active");
        assertEq(p.vnetRpcUrl, vnetRpcUrl, "RPC URL should match report payload");
        assertEq(p.baseSnapshotId, baseSnapshotId, "Snapshot ID should match report payload");
    }

    function test_onReport_revertsOnUnauthorizedWorkflowMetadata() public {
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

        hub.setAuthorizedWorkflow(WORKFLOW_VNET_INIT_ID, true);

        bytes32 rogueWorkflowId = keccak256("rogue-workflow");
        bytes memory payload = abi.encode(projectId, "https://rpc.tenderly.co/rogue", keccak256("rogue-snapshot"));
        bytes memory report = _buildTypedReport(REPORT_TYPE_VNET_SUCCESS, payload);

        vm.expectRevert(abi.encodeWithSelector(BountyHub.UnauthorizedWorkflowProvenance.selector, rogueWorkflowId));
        vm.prank(FORWARDER);
        hub.onReport(_metadataForWorkflow(rogueWorkflowId), report);
    }

    function test_onReport_revertsOnMalformedMetadataWhenGuardrailEnabled() public {
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

        hub.setAuthorizedWorkflow(WORKFLOW_VNET_INIT_ID, true);

        bytes memory payload = abi.encode(projectId, "https://rpc.tenderly.co/malformed", keccak256("malformed-snapshot"));
        bytes memory report = _buildTypedReport(REPORT_TYPE_VNET_SUCCESS, payload);

        vm.expectRevert(abi.encodeWithSelector(BountyHub.InvalidReportMetadataLength.selector, uint256(0)));
        vm.prank(FORWARDER);
        hub.onReport("", report);
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

    function _metadataForWorkflow(bytes32 workflowId) internal pure returns (bytes memory) {
        return abi.encodePacked(workflowId, WORKFLOW_NAME, WORKFLOW_OWNER);
    }
}
