// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {OasisPoCStore} from "../src/OasisPoCStore.sol";

contract DeployOasisPoCStore is Script {
    function run() external returns (OasisPoCStore store) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        string memory siweDomain = vm.envString("SIWE_DOMAIN");

        require(bytes(siweDomain).length > 0, "SIWE_DOMAIN is required");

        vm.startBroadcast(deployerPrivateKey);
        store = new OasisPoCStore(siweDomain);
        vm.stopBroadcast();

        console.log("OasisPoCStore deployed at:", address(store));
        console.log("SIWE domain:", siweDomain);
    }
}
