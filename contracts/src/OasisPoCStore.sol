// SPDX-License-Identifier: MIT
// ANTISOON
pragma solidity ^0.8.30;

import {CompatSiweAuth} from "./CompatSiweAuth.sol";

/// @notice Sapphire-side storage for encrypted PoC envelopes.
/// @dev Payload should already be application-level encrypted.
contract OasisPoCStore is CompatSiweAuth {
    struct StoredRecord {
        address writer;
        string payload;
        uint256 storedAt;
        uint256 version;
    }

    mapping(bytes32 => StoredRecord) private records;
    mapping(bytes32 => uint256) private slotVersions;
    mapping(bytes32 => mapping(uint256 => mapping(address => bool))) private canRead;

    event PoCStored(
        bytes32 indexed slotKey,
        address indexed writer,
        uint256 storedAt,
        bytes32 payloadHash
    );

    event ReadAccessGranted(
        bytes32 indexed slotKey,
        uint256 indexed version,
        address indexed principal
    );

    constructor(string memory domain) CompatSiweAuth(domain) {}

    function write(string calldata slotId, string calldata payload) external {
        require(bytes(slotId).length > 0, "Slot required");
        require(bytes(payload).length > 0, "Payload required");

        bytes32 slotKey = keccak256(bytes(slotId));
        StoredRecord storage currentRecord = records[slotKey];
        if (currentRecord.writer != address(0)) {
            require(currentRecord.writer == msg.sender, "Not authorized");
        }

        uint256 nextVersion = slotVersions[slotKey] + 1;
        slotVersions[slotKey] = nextVersion;

        records[slotKey] = StoredRecord({
            writer: msg.sender,
            payload: payload,
            storedAt: block.timestamp,
            version: nextVersion
        });

        canRead[slotKey][nextVersion][msg.sender] = true;

        emit PoCStored(slotKey, msg.sender, block.timestamp, keccak256(bytes(payload)));
    }

    function grantReadAccess(string calldata slotId, address principal) external {
        bytes32 slotKey = keccak256(bytes(slotId));
        StoredRecord storage record = records[slotKey];

        require(record.writer == msg.sender, "Not authorized");

        canRead[slotKey][record.version][principal] = true;
        emit ReadAccessGranted(slotKey, record.version, principal);
    }

    function read(string calldata slotId) external view returns (string memory) {
        return _read(slotId, bytes(""));
    }

    function read(string calldata slotId, bytes calldata token)
        external
        view
        returns (string memory)
    {
        return _read(slotId, token);
    }

    function _read(string calldata slotId, bytes memory token)
        internal
        view
        returns (string memory)
    {
        bytes32 slotKey = keccak256(bytes(slotId));
        StoredRecord storage record = records[slotKey];

        address tokenReader = authMsgSender(token);

        require(
            canRead[slotKey][record.version][msg.sender] ||
                canRead[slotKey][record.version][tokenReader],
            "Not authorized"
        );

        return record.payload;
    }

    function readMeta(string calldata slotId)
        external
        view
        returns (address writer, uint256 storedAt)
    {
        StoredRecord storage record = records[keccak256(bytes(slotId))];
        return (record.writer, record.storedAt);
    }
}
