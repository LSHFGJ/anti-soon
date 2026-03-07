// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {
    SignatureRSV,
    A13e
} from "@oasisprotocol/sapphire-contracts/contracts/auth/A13e.sol";
import {
    ParsedSiweMessage,
    SiweParser
} from "@oasisprotocol/sapphire-contracts/contracts/SiweParser.sol";
import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

/// @title AuthToken structure for SIWE-based authentication
struct AuthToken {
    string domain;
    address userAddr;
    uint256 validUntil;
    string statement;
    string[] resources;
}

/// @notice Local SiweAuth compatibility copy without OpenZeppelin Strings.
contract CompatSiweAuth is A13e {
    string internal _domain;
    bytes32 private _authTokenEncKey;
    uint256 private constant DEFAULT_VALIDITY = 24 hours;

    error SiweAuth_ChainIdMismatch();
    error SiweAuth_DomainMismatch();
    error SiweAuth_AddressMismatch();
    error SiweAuth_NotBeforeInFuture();
    error SiweAuth_Expired();

    constructor(string memory inDomain) {
        _authTokenEncKey = bytes32(Sapphire.randomBytes(32, ""));
        _domain = inDomain;
    }

    function login(string calldata siweMsg, SignatureRSV calldata sig)
        external
        view
        override
        returns (bytes memory)
    {
        AuthToken memory b;

        bytes memory eip191msg = abi.encodePacked(
            "\x19Ethereum Signed Message:\n",
            _uintToString(bytes(siweMsg).length),
            siweMsg
        );
        address addr = ecrecover(
            keccak256(eip191msg),
            uint8(sig.v),
            sig.r,
            sig.s
        );
        b.userAddr = addr;

        ParsedSiweMessage memory p = SiweParser.parseSiweMsg(bytes(siweMsg));

        if (p.chainId != block.chainid) {
            revert SiweAuth_ChainIdMismatch();
        }

        if (keccak256(p.schemeDomain) != keccak256(bytes(_domain))) {
            revert SiweAuth_DomainMismatch();
        }
        b.domain = string(p.schemeDomain);

        if (p.addr != addr) {
            revert SiweAuth_AddressMismatch();
        }

        if (
            p.notBefore.length != 0 &&
            block.timestamp <= SiweParser.timestampFromIso(p.notBefore)
        ) {
            revert SiweAuth_NotBeforeInFuture();
        }

        if (p.expirationTime.length != 0) {
            b.validUntil = SiweParser.timestampFromIso(p.expirationTime);
        } else {
            b.validUntil = block.timestamp + DEFAULT_VALIDITY;
        }
        if (block.timestamp >= b.validUntil) {
            revert SiweAuth_Expired();
        }

        b.statement = string(p.statement);

        b.resources = new string[](p.resources.length);
        for (uint256 i = 0; i < p.resources.length; i++) {
            b.resources[i] = string(p.resources[i]);
        }

        return Sapphire.encrypt(_authTokenEncKey, 0, abi.encode(b), "");
    }

    function domain() public view returns (string memory) {
        return _domain;
    }

    function authMsgSender(bytes memory token)
        internal
        view
        override
        checkRevokedAuthToken(token)
        returns (address)
    {
        if (token.length == 0) {
            return address(0);
        }

        AuthToken memory b = decodeAndValidateToken(token);
        return b.userAddr;
    }

    function decodeAndValidateToken(bytes memory token)
        internal
        view
        virtual
        returns (AuthToken memory)
    {
        bytes memory authTokenEncoded = Sapphire.decrypt(
            _authTokenEncKey,
            0,
            token,
            ""
        );
        AuthToken memory b = abi.decode(authTokenEncoded, (AuthToken));

        if (keccak256(bytes(b.domain)) != keccak256(bytes(_domain))) {
            revert SiweAuth_DomainMismatch();
        }

        if (b.validUntil < block.timestamp) {
            revert SiweAuth_Expired();
        }

        return b;
    }

    function _uintToString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
