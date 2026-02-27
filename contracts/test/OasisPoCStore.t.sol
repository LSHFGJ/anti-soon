// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/OasisPoCStore.sol";

contract OasisPoCStoreTest is Test {
    OasisPoCStore internal store;

    function setUp() public {
        store = new OasisPoCStore();
    }

    function test_authorizedReaderCanReadPayload() public {
        string memory slotId = "slot-alpha";
        string memory payload = '{"ok":true,"sealedPoc":{"ciphertextHex":"0x01"}}';
        address reader = address(0xBEEF);

        store.write(slotId, payload);
        store.grantReadAccess(slotId, reader);

        vm.prank(reader);
        assertEq(store.read(slotId), payload, "authorized reader should receive payload");
    }

    function test_unauthorizedReaderReverts() public {
        string memory slotId = "slot-private";
        address intruder = address(0xCAFE);

        store.write(slotId, "sensitive-payload");

        vm.prank(intruder);
        vm.expectRevert("Not authorized");
        store.read(slotId);
    }

    function test_overwriteRevokesPriorReaderUntilRegranted() public {
        string memory slotId = "slot-versioned";
        address reader = address(0xBEEF);

        store.write(slotId, "payload-v1");
        store.grantReadAccess(slotId, reader);

        vm.prank(reader);
        assertEq(store.read(slotId), "payload-v1", "reader should access granted version");

        // New write increments slot version and must fail closed for stale grants.
        store.write(slotId, "payload-v2");

        vm.prank(reader);
        vm.expectRevert("Not authorized");
        store.read(slotId);

        store.grantReadAccess(slotId, reader);

        vm.prank(reader);
        assertEq(store.read(slotId), "payload-v2", "reader should access latest version after re-grant");
    }

    function test_nonWriterCannotGrantReadAccess() public {
        string memory slotId = "slot-grant";
        address attacker = address(0xCAFE);
        address principal = address(0xBEEF);

        store.write(slotId, "payload");

        vm.prank(attacker);
        vm.expectRevert("Not authorized");
        store.grantReadAccess(slotId, principal);
    }

    function test_nonOwnerCannotOverwriteExistingSlot() public {
        string memory slotId = "slot-protected";
        address attacker = address(0xCAFE);

        store.write(slotId, "payload-v1");

        vm.prank(attacker);
        vm.expectRevert("Not authorized");
        store.write(slotId, "payload-attacker");

        assertEq(store.read(slotId), "payload-v1", "existing payload must remain intact");

        (address writer, ) = store.readMeta(slotId);
        assertEq(writer, address(this), "slot writer must remain the original owner");
    }

    function test_eventEmitsOpaqueMetadataOnly() public {
        string memory slotId = "slot-event";
        string memory payload = '{"proof":"plaintext must never leak"}';

        vm.recordLogs();
        store.write(slotId, payload);
        Vm.Log[] memory entries = vm.getRecordedLogs();

        assertEq(entries.length, 1, "expected one event");
        assertEq(
            entries[0].topics[0],
            keccak256("PoCStored(bytes32,address,uint256,bytes32)"),
            "unexpected event signature"
        );

        bytes memory payloadBytes = bytes(payload);
        assertFalse(_contains(entries[0].data, payloadBytes), "event data must not contain plaintext payload");
        assertEq(entries[0].topics.length, 3, "expected indexed slot key + writer topics");
    }

    function test_writeRevertsWhenSlotMissing() public {
        vm.expectRevert("Slot required");
        store.write("", "payload");
    }

    function test_writeRevertsWhenPayloadMissing() public {
        vm.expectRevert("Payload required");
        store.write("slot-empty", "");
    }

    function _contains(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
        if (needle.length == 0 || needle.length > haystack.length) {
            return false;
        }

        for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
            bool matchFound = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) {
                return true;
            }
        }

        return false;
    }
}
