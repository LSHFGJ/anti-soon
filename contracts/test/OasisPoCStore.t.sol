// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/OasisPoCStore.sol";

contract OasisPoCStoreTest is Test {
    OasisPoCStore internal store;

    function setUp() public {
        store = new OasisPoCStore();
    }

    function test_writeAndRead() public {
        string memory slotId = "slot-alpha";
        string memory payload = '{"ok":true,"encryptedPoc":{"ciphertextHex":"0x01"}}';

        store.write(slotId, payload);

        assertEq(store.read(slotId), payload, "stored payload should round-trip");
    }

    function test_writeOverwritesExistingSlot() public {
        string memory slotId = "slot-overwrite";

        store.write(slotId, "v1");
        store.write(slotId, "v2");

        assertEq(store.read(slotId), "v2", "latest payload should win for same slot");
    }

    function test_writeRevertsWhenSlotMissing() public {
        vm.expectRevert("Slot required");
        store.write("", "payload");
    }

    function test_writeRevertsWhenPayloadMissing() public {
        vm.expectRevert("Payload required");
        store.write("slot-empty", "");
    }
}
