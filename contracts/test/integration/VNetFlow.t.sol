// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {BountyHub} from "../../src/BountyHub.sol";

contract VNetFlowTest is Test {
    BountyHub public hub;
    address constant FORWARDER = address(0xF0);
    address constant TARGET = address(0xBEEF);
    bytes4 constant REPORT_ENVELOPE_MAGIC = 0x41535250;
    uint8 constant REPORT_TYPE_VNET_SUCCESS = 1;
    address owner = address(this);
    address auditor = address(0xA1);
    address auditor2 = address(0xA2);

    function setUp() public {
        vm.warp(1000);
        hub = new BountyHub(FORWARDER);
        vm.deal(owner, 100 ether);
        vm.deal(auditor, 10 ether);
        vm.deal(auditor2, 10 ether);
    }

    function test_fullFlow_registerToVnetCreated() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(100 ether, 10 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 commitDeadline = block.timestamp + 7 days;
        uint256 projectId = hub.registerProjectV2{value: 1 ether}(
            TARGET,
            0.5 ether,
            12345,
            BountyHub.CompetitionMode.MULTI,
            commitDeadline,
            block.timestamp + 14 days,
            3 days,
            rules
        );

        // Verify vnetStatus == Pending after registration
        assertEq(uint8(hub.projects(projectId).vnetStatus), uint8(BountyHub.VnetStatus.Pending), "VNet status should be Pending after registration");
    }

    function test_fullFlow_setProjectVnet() public {
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

        // Verify initial state
        BountyHub.Project memory pBefore = hub.projects(projectId);
        assertEq(uint8(pBefore.vnetStatus), uint8(BountyHub.VnetStatus.Pending), "Initial VNet status should be Pending");
        assertEq(pBefore.vnetRpcUrl, "", "Initial RPC URL should be empty");
        assertEq(pBefore.baseSnapshotId, bytes32(0), "Initial snapshot ID should be zero");

        // Set VNet via forwarder
        string memory vnetRpcUrl = "https://rpc.tenderly.co/vnet/123";
        bytes32 baseSnapshotId = keccak256("base-snapshot");

        vm.prank(FORWARDER);
        hub.setProjectVnet(projectId, vnetRpcUrl, baseSnapshotId);

        // Verify vnetStatus == Active and fields are stored
        BountyHub.Project memory pAfter = hub.projects(projectId);
        assertEq(uint8(pAfter.vnetStatus), uint8(BountyHub.VnetStatus.Active), "VNet status should be Active");
        assertEq(pAfter.vnetRpcUrl, vnetRpcUrl, "RPC URL should be stored");
        assertEq(pAfter.baseSnapshotId, baseSnapshotId, "Snapshot ID should be stored");
        assertGt(pAfter.vnetCreatedAt, 0, "VNet creation timestamp should be set");
    }

    function test_fullFlow_typedVnetInitReport_updatesProjectState() public {
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

        string memory vnetRpcUrl = "https://rpc.tenderly.co/vnet/typed";
        bytes32 baseSnapshotId = keccak256("typed-snapshot");
        bytes memory report = _buildTypedReport(
            REPORT_TYPE_VNET_SUCCESS,
            abi.encode(projectId, vnetRpcUrl, baseSnapshotId)
        );

        vm.prank(FORWARDER);
        hub.onReport("", report);

        BountyHub.Project memory project = hub.projects(projectId);
        assertEq(uint8(project.vnetStatus), uint8(BountyHub.VnetStatus.Active), "typed vnet report should activate project VNet");
        assertEq(project.vnetRpcUrl, vnetRpcUrl, "typed vnet report should store rpc url");
        assertEq(project.baseSnapshotId, baseSnapshotId, "typed vnet report should store snapshot id");
    }

    function test_fullFlow_verifyPoCWithVnet() public {
        // Register project
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 10 ether}(
            TARGET,
            1 ether,
            0,
            BountyHub.CompetitionMode.UNIQUE,
            0,
            0,
            1 days,
            rules
        );

        // Set VNet
        string memory vnetRpcUrl = "https://rpc.tenderly.co/vnet/456";
        bytes32 baseSnapshotId = keccak256("snapshot");
        vm.prank(FORWARDER);
        hub.setProjectVnet(projectId, vnetRpcUrl, baseSnapshotId);

        // Verify VNet is active
        BountyHub.Project memory proj = hub.projects(projectId);
        assertEq(uint8(proj.vnetStatus), uint8(BountyHub.VnetStatus.Active), "VNet should be active");

        // Submit PoC (commit + reveal)
        bytes32 salt = keccak256("salt");
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256("uri"), auditor, salt));

        vm.prank(auditor);
        uint256 submissionId = hub.commitPoC(projectId, commitHash, "uri");

        vm.warp(block.timestamp + 1);
        vm.prank(auditor);
        hub.revealPoC(submissionId, salt);

        // Verify submission is revealed
        (address subAuditor, uint256 subProjectId, bytes32 subCommitHash, string memory subCipherURI, , uint256 commitTime, , BountyHub.SubmissionStatus status, , , , , , , ) = hub.submissions(submissionId);
        assertEq(subAuditor, auditor, "Auditor should match");
        assertEq(subProjectId, projectId, "Project ID should match");
        assertEq(uint8(status), uint8(BountyHub.SubmissionStatus.Revealed), "Status should be Revealed");

        // Simulate CRE report with VNet data (mocked - doesn't use real Tenderly)
        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(submissionId, true, 10 ether));

        // Verify submission is verified with correct severity
        (, , , , , , , , uint256 drainAmount, BountyHub.Severity severity, uint256 payoutAmount, , , , ) = hub.submissions(submissionId);
        assertEq(drainAmount, 10 ether, "Drain amount should be 10 ether");
        assertEq(uint8(severity), uint8(BountyHub.Severity.CRITICAL), "Severity should be CRITICAL");
        assertGt(payoutAmount, 0, "Payout should be calculated");
    }

    function test_fullFlow_legacyVerifyPocReport_verifiesSubmission() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 10 ether}(
            TARGET,
            1 ether,
            0,
            BountyHub.CompetitionMode.UNIQUE,
            0,
            0,
            1 days,
            rules
        );

        bytes32 salt = keccak256("typed-verify-salt");
        string memory cipherUri = "ipfs://typed-verify";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherUri)), auditor, salt));

        vm.prank(auditor);
        uint256 submissionId = hub.commitPoC(projectId, commitHash, cipherUri);

        vm.warp(block.timestamp + 1);
        vm.prank(auditor);
        hub.revealPoC(submissionId, salt);

        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(submissionId, true, 1 ether));

        (, , , , , , , BountyHub.SubmissionStatus status, uint256 drainAmountWei, , uint256 payoutAmount, , , , ) =
            hub.submissions(submissionId);
        assertEq(uint8(status), uint8(BountyHub.SubmissionStatus.Verified), "legacy verify report should verify submission");
        assertEq(drainAmountWei, 1 ether, "legacy verify report should persist drain amount");
        assertGt(payoutAmount, 0, "legacy verify report should calculate payout");
    }

    function test_fullFlow_malformedLegacyVerifyPocPayload_revertsWithoutStateMutation() public {
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 10 ether}(
            TARGET,
            1 ether,
            0,
            BountyHub.CompetitionMode.UNIQUE,
            0,
            0,
            1 days,
            rules
        );

        bytes32 salt = keccak256("legacy-malformed-salt");
        string memory cipherUri = "ipfs://legacy-malformed";
        bytes32 commitHash = keccak256(abi.encodePacked(keccak256(bytes(cipherUri)), auditor, salt));

        vm.prank(auditor);
        uint256 submissionId = hub.commitPoC(projectId, commitHash, cipherUri);

        vm.warp(block.timestamp + 1);
        vm.prank(auditor);
        hub.revealPoC(submissionId, salt);

        bytes memory malformedReport = abi.encode(submissionId);

        vm.expectRevert();
        vm.prank(FORWARDER);
        hub.onReport("", malformedReport);

        (, , , , , , , BountyHub.SubmissionStatus status, uint256 drainAmountWei, , uint256 payoutAmount, , , , ) =
            hub.submissions(submissionId);
        assertEq(uint8(status), uint8(BountyHub.SubmissionStatus.Revealed), "malformed legacy verify report must not change submission state");
        assertEq(drainAmountWei, 0, "malformed legacy verify report must not set drain amount");
        assertEq(payoutAmount, 0, "malformed legacy verify report must not set payout amount");
    }

    function test_fullFlow_vnetCreationFailure() public {
        // Register project
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

        // Verify initial status is Pending
        assertEq(uint8(hub.projects(projectId).vnetStatus), uint8(BountyHub.VnetStatus.Pending), "Initial status should be Pending");

        // Mark VNet as failed via forwarder
        string memory failureReason = "Failed to create Tenderly fork: insufficient quota";

        vm.prank(FORWARDER);
        hub.markVnetFailed(projectId, failureReason);

        // Verify vnetStatus == Failed
        assertEq(uint8(hub.projects(projectId).vnetStatus), uint8(BountyHub.VnetStatus.Failed), "VNet status should be Failed");
    }

    function test_concurrentPoCVerification() public {
        // Register project
        BountyHub.SeverityThresholds memory thresholds = BountyHub.SeverityThresholds(10 ether, 5 ether, 1 ether, 0.1 ether);
        BountyHub.ProjectRules memory rules = BountyHub.ProjectRules(100 ether, 3600, true, thresholds);

        uint256 projectId = hub.registerProjectV2{value: 20 ether}(
            TARGET,
            1 ether,
            0,
            BountyHub.CompetitionMode.MULTI,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            1 days,
            rules
        );

        // Set VNet
        string memory vnetRpcUrl = "https://rpc.tenderly.co/vnet/789";
        bytes32 baseSnapshotId = keccak256("snapshot");
        vm.prank(FORWARDER);
        hub.setProjectVnet(projectId, vnetRpcUrl, baseSnapshotId);

        // Submit PoC from auditor1
        bytes32 salt1 = keccak256("salt1");
        bytes32 commitHash1 = keccak256(abi.encodePacked(keccak256("uri1"), auditor, salt1));

        vm.prank(auditor);
        uint256 submissionId1 = hub.commitPoC(projectId, commitHash1, "uri1");

        // Submit PoC from auditor2
        bytes32 salt2 = keccak256("salt2");
        bytes32 commitHash2 = keccak256(abi.encodePacked(keccak256("uri2"), auditor2, salt2));

        vm.prank(auditor2);
        uint256 submissionId2 = hub.commitPoC(projectId, commitHash2, "uri2");

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(auditor);
        hub.revealPoC(submissionId1, salt1);

        vm.prank(auditor2);
        hub.revealPoC(submissionId2, salt2);

        // Verify both submissions are revealed
        (address subAuditor1, , , , , , , BountyHub.SubmissionStatus status1, , , , , , , ) = hub.submissions(submissionId1);
        (address subAuditor2, , , , , , , BountyHub.SubmissionStatus status2, , , , , , , ) = hub.submissions(submissionId2);

        assertEq(subAuditor1, auditor, "First submission auditor should match");
        assertEq(subAuditor2, auditor2, "Second submission auditor should match");
        assertEq(uint8(status1), uint8(BountyHub.SubmissionStatus.Revealed), "First submission should be Revealed");
        assertEq(uint8(status2), uint8(BountyHub.SubmissionStatus.Revealed), "Second submission should be Revealed");

        // Process CRE report for submission1 (mocked)
        vm.prank(FORWARDER);
        hub.onReport("", abi.encode(submissionId1, true, 10 ether));

        // Verify submission1 is verified, submission2 unchanged
        (, , , , , , , BountyHub.SubmissionStatus statusAfter1, , , , , , , ) = hub.submissions(submissionId1);
        (, , , , , , , BountyHub.SubmissionStatus statusAfter2, , , , , , , ) = hub.submissions(submissionId2);

        assertEq(uint8(statusAfter1), uint8(BountyHub.SubmissionStatus.Verified), "First submission should be Verified");
        assertEq(uint8(statusAfter2), uint8(BountyHub.SubmissionStatus.Revealed), "Second submission should still be Revealed");

        // Verify state isolation: submission1 has payout calculated, submission2 doesn't
        (, , , , , , , , , BountyHub.Severity dummySeverity1, uint256 payout1, , , , ) = hub.submissions(submissionId1);
        (, , , , , , , , , BountyHub.Severity dummySeverity2, uint256 payout2, , , , ) = hub.submissions(submissionId2);

        assertGt(payout1, 0, "First submission should have payout amount");
        assertEq(payout2, 0, "Second submission should have no payout yet");
    }

    function _buildTypedReport(uint8 reportType, bytes memory payload) internal pure returns (bytes memory) {
        return abi.encode(REPORT_ENVELOPE_MAGIC, reportType, payload);
    }
}
