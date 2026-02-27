// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Sapphire-side storage for encrypted PoC envelopes.
/// @dev Payload should already be application-level encrypted.
contract OasisPoCStore {
    struct StoredRecord {
        address writer;
        string payload;
        uint256 storedAt;
    }

    mapping(bytes32 => StoredRecord) private records;

    event PoCStored(
        string slotId,
        bytes32 indexed slotKey,
        address indexed writer,
        string payload
    );

    function write(string calldata slotId, string calldata payload) external {
        require(bytes(slotId).length > 0, "Slot required");
        require(bytes(payload).length > 0, "Payload required");

        bytes32 slotKey = keccak256(bytes(slotId));
        records[slotKey] = StoredRecord({
            writer: msg.sender,
            payload: payload,
            storedAt: block.timestamp
        });

        emit PoCStored(slotId, slotKey, msg.sender, payload);
    }

    function read(string calldata slotId) external view returns (string memory) {
        return records[keccak256(bytes(slotId))].payload;
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
