// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

contract BountyHub is ReceiverTemplate {
    constructor(address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {}

    function _processReport(bytes calldata report) internal override {
        // TODO: implement in Task 5
    }
}
