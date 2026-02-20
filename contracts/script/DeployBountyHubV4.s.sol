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

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        BountyHub hub = new BountyHub(CRE_FORWARDER);

        vm.stopBroadcast();
        
        console.log("BountyHub V4 deployed at:", address(hub));
        console.log("Features: ContractScope, projectScopes, repoUrl, registerProjectV3");
    }
}
