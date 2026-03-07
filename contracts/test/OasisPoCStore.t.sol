// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {SignatureRSV} from "@oasisprotocol/sapphire-contracts/contracts/EthereumUtils.sol";
import "forge-std/Test.sol";
import "../src/OasisPoCStore.sol";

contract RandomBytesPrecompileMock {
    fallback(bytes calldata input) external returns (bytes memory) {
        (uint256 numBytes, ) = abi.decode(input, (uint256, bytes));
        bytes memory output = new bytes(numBytes);
        for (uint256 i = 0; i < numBytes; i++) {
            output[i] = bytes1(uint8((i % 251) + 1));
        }
        return output;
    }
}

contract EncryptPrecompileMock {
    fallback(bytes calldata input) external returns (bytes memory) {
        (, , bytes memory plaintext, ) = abi.decode(
            input,
            (bytes32, bytes32, bytes, bytes)
        );
        return plaintext;
    }
}

contract DecryptPrecompileMock {
    fallback(bytes calldata input) external returns (bytes memory) {
        (, , bytes memory ciphertext, ) = abi.decode(
            input,
            (bytes32, bytes32, bytes, bytes)
        );
        return ciphertext;
    }
}

contract OasisPoCStoreTest is Test {
    OasisPoCStore internal store;

    uint256 private constant READER_PRIVATE_KEY = 0xBEEF;
    uint256 private constant OTHER_PRIVATE_KEY = 0xCAFE;
    string private constant SIWE_DOMAIN = "preview.anti-soon.test";
    string private constant DEFAULT_ISSUED_AT = "2029-12-31T23:58:00Z";
    string private constant DEFAULT_EXPIRATION = "2030-01-01T00:00:00Z";

    address private constant RANDOM_BYTES =
        0x0100000000000000000000000000000000000001;
    address private constant ENCRYPT =
        0x0100000000000000000000000000000000000003;
    address private constant DECRYPT =
        0x0100000000000000000000000000000000000004;

    function setUp() public {
        vm.etch(RANDOM_BYTES, type(RandomBytesPrecompileMock).runtimeCode);
        vm.etch(ENCRYPT, type(EncryptPrecompileMock).runtimeCode);
        vm.etch(DECRYPT, type(DecryptPrecompileMock).runtimeCode);
        store = new OasisPoCStore(SIWE_DOMAIN);
    }

    function test_exposesConfiguredSiweDomain() public view {
        assertEq(store.domain(), SIWE_DOMAIN, "domain should remain discoverable for frontend login");
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

    function test_authenticatedReaderCanReadViaToken() public {
        string memory slotId = "slot-token";
        string memory payload = '{"ok":true,"sealedPoc":{"ciphertextHex":"0x02"}}';
        address reader = vm.addr(READER_PRIVATE_KEY);

        store.write(slotId, payload);
        store.grantReadAccess(slotId, reader);

        bytes memory token = _login(reader, READER_PRIVATE_KEY, DEFAULT_EXPIRATION);

        vm.prank(vm.addr(OTHER_PRIVATE_KEY));
        assertEq(
            store.read(slotId, token),
            payload,
            "token-authenticated reader should receive payload"
        );
    }

    function test_expiredTokenFailsClosed() public {
        string memory slotId = "slot-expired";
        string memory payload = '{"ok":true,"sealedPoc":{"ciphertextHex":"0x03"}}';
        address reader = vm.addr(READER_PRIVATE_KEY);

        vm.warp(1_893_455_900);
        store.write(slotId, payload);
        store.grantReadAccess(slotId, reader);

        bytes memory token = _login(reader, READER_PRIVATE_KEY, DEFAULT_EXPIRATION);

        vm.warp(1_893_456_001);
        vm.expectRevert();
        store.read(slotId, token);
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

    function _login(
        address reader,
        uint256 privateKey,
        string memory expirationTime
    ) internal returns (bytes memory) {
        string memory siweMessage = _buildSiweMessage(reader, expirationTime);
        SignatureRSV memory sig = _signPersonalMessage(siweMessage, privateKey);
        return store.login(siweMessage, sig);
    }

    function _buildSiweMessage(
        address reader,
        string memory expirationTime
    ) internal view returns (string memory) {
        string memory message = string.concat(
            SIWE_DOMAIN,
            " wants you to sign in with your Ethereum account:\n",
            Strings.toChecksumHexString(reader),
            "\n\n",
            "AntiSoon preview access.",
            "\n\n",
            "URI: https://",
            SIWE_DOMAIN,
            "\nVersion: 1\nChain ID: ",
            Strings.toString(block.chainid),
            "\nNonce: 12345678\nIssued At: ",
            DEFAULT_ISSUED_AT
        );

        if (bytes(expirationTime).length == 0) {
            return message;
        }

        return string.concat(message, "\nExpiration Time: ", expirationTime);
    }

    function _signPersonalMessage(
        string memory message,
        uint256 privateKey
    ) internal returns (SignatureRSV memory) {
        bytes memory digestInput = abi.encodePacked(
            "\x19Ethereum Signed Message:\n",
            Strings.toString(bytes(message).length),
            message
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            privateKey,
            keccak256(digestInput)
        );
        return SignatureRSV({r: r, s: s, v: uint256(v)});
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
