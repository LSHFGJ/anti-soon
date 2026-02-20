#!/bin/bash
# E2E Test: VNet Flow on Sepolia
# Tests: registerProjectV2 -> verify vnetStatus=Pending (forwarder-only tests skipped)

set -e

# Configuration
RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
BOUNTY_HUB="0x8b12D6F28453be1eEf2D5ff151df3a2eE68d7f97"
FORWARDER="0x15fC6ae953E024d975e77382eEeC56A9101f9F88"

# Load private key from .env
source .env
: "${CRE_ETH_PRIVATE_KEY:?CRE_ETH_PRIVATE_KEY not set in .env}"

# Get deployer address
DEPLOYER=$(cast wallet address --private-key $CRE_ETH_PRIVATE_KEY)
echo "Deployer: $DEPLOYER"

# Check deployer balance
BALANCE=$(cast balance $DEPLOYER --rpc-url $RPC_URL)
echo "Balance: $(cast to-unit $BALANCE ether) ETH"

# ═══════════════════ Test 1: Register Project V2 ═══════════════════
echo ""
echo "=== Test 1: Register Project V2 ==="

# Register project with simple parameters
TX1=$(cast send $BOUNTY_HUB \
    "registerProjectV2(address,uint256,uint256,uint8,uint256,uint256,uint256,(uint256,uint256,bool,(uint256,uint256,uint256,uint256)))" \
    $DEPLOYER 1000000000000000000 0 0 0 0 0 \
    "(1000000000000000000000,31536000,true,(1000000000000000000000,100000000000000000000,10000000000000000000,1000000000000000000))" \
    --rpc-url $RPC_URL \
    --private-key $CRE_ETH_PRIVATE_KEY \
    --value 0.01ether)

echo "Register tx: $TX1"

# Get project ID from nextProjectId
PROJECT_ID=$(cast call $BOUNTY_HUB "nextProjectId()" --rpc-url $RPC_URL)
PROJECT_ID=$((PROJECT_ID - 1))
echo "Project ID: $PROJECT_ID"

# Check vnetStatus (should be 1 = Pending)
PROJECT_DATA=$(cast call $BOUNTY_HUB "projects(uint256)" $PROJECT_ID --rpc-url $RPC_URL)

# vnetStatus is at hex string positions 833-834 (including 0x prefix)
VNET_STATUS_HEX=$(echo "$PROJECT_DATA" | cut -c 833-834)
VNET_STATUS=$((16#$VNET_STATUS_HEX))
echo "VNet Status: $VNET_STATUS (1=Pending)"

if [ "$VNET_STATUS" != "1" ]; then
    echo "FAIL: Expected vnetStatus=1 (Pending), got $VNET_STATUS"
    exit 1
fi

# ═══════════════════ Test 2: Forwarder-Only Functions (Skipped) ═══════════════════
echo ""
echo "=== Test 2: Forwarder-Only Functions (Skipped) ==="
echo "Note: setProjectVnet() and markVnetFailed() are forwarder-only functions."
echo "These are tested in Foundry integration tests:"
echo "  - contracts/test/BountyHubVNet.t.sol (8 VNet tests)"
echo "  - contracts/test/integration/VNetFlow.t.sol (5 integration tests)"
echo ""
echo "On live Sepolia, only the CRE Forwarder ($FORWARDER) can call these functions."
echo "Direct calls from other addresses will revert with 'OnlyForwarder' error."

echo ""
echo "=== All E2E Tests Passed! ==="
