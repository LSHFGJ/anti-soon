// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {BountyHub} from "../src/BountyHub.sol";

contract DeployBountyHub is Script {
    // MockForwarder on Sepolia (for CRE simulation)
    address constant MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external {
        vm.startBroadcast();

        BountyHub hub = new BountyHub(MOCK_FORWARDER);

        vm.stopBroadcast();
        console.log("BountyHub deployed at:", address(hub));
    }
}
