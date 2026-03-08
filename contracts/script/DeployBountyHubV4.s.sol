// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {BountyHub} from "../src/BountyHub.sol";

/// @title DeployBountyHubV4
/// @notice Deploys BountyHub V4 with multi-contract scope support
/// @dev V4 features: ContractScope struct, projectScopes mapping, repoUrl field, registerProjectV3()
contract DeployBountyHubV4 is Script {
    // CRE Forwarder address on Sepolia
    address constant CRE_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
bytes32 constant WORKFLOW_VERIFY_POC_ID = keccak256("verify-poc");
bytes32 constant WORKFLOW_JURY_ORCHESTRATOR_ID = keccak256("jury-orchestrator");
bytes32 constant WORKFLOW_VNET_INIT_ID = keccak256("vnet-init");

    function configureProductionPins(BountyHub hub, address expectedAuthor) public {
        _requireProductionSafeConfig(hub.getForwarderAddress(), expectedAuthor);

        hub.setExpectedAuthor(expectedAuthor);
        hub.setAuthorizedWorkflow(WORKFLOW_VERIFY_POC_ID, true);
        hub.setAuthorizedWorkflow(WORKFLOW_JURY_ORCHESTRATOR_ID, true);
        hub.setAuthorizedWorkflow(WORKFLOW_VNET_INIT_ID, true);
    }

    function _requireProductionSafeConfig(address forwarder, address expectedAuthor) internal pure {
        require(forwarder != address(0), "Unsafe forwarder config");
        require(expectedAuthor != address(0), "Expected author required");
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address expectedAuthor = vm.envAddress("CRE_WORKFLOW_OWNER");
        
        vm.startBroadcast(deployerPrivateKey);

        BountyHub hub = new BountyHub(CRE_FORWARDER);
        configureProductionPins(hub, expectedAuthor);

        vm.stopBroadcast();
        
        console.log("BountyHub V4 deployed at:", address(hub));
        console.log("Receiver expected author pinned to:", expectedAuthor);
        console.log("Features: ContractScope, projectScopes, repoUrl, registerProjectV3");
    }
}
