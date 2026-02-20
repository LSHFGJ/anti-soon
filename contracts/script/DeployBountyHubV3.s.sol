// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {BountyHub} from "../src/BountyHub.sol";

contract DeployBountyHubV3 is Script {
    // CRE Forwarder address on Sepolia (same as V2 deployment)
    address constant CRE_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external {
        vm.startBroadcast();

        BountyHub hub = new BountyHub(CRE_FORWARDER);

        vm.stopBroadcast();
        console.log("BountyHub V3 deployed at:", address(hub));
    }
}
