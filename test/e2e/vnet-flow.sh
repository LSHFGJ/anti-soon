#!/bin/bash
# E2E Test: VNet Flow on Sepolia
# Tests: registerProjectV2 -> setProjectVnet -> verify VNet fields

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

# Encode ProjectRules struct (empty for simplicity)
# ProjectRules: maxAttackerSeedWei, maxWarpSeconds, allowImpersonation, thresholds
RULES_DATA=$(cast abi-encode "ProjectRules(uint256,uint256,bool,(uint256,uint256,uint256,uint256))" \
    1000000000000000000000 \
    31536000 \
    true \
    1000000000000000000000 \
    100000000000000000000 \
    10000000000000000000 \
    1000000000000000000)

# Register project
TX1=$(cast send $BOUNTY_HUB \
    "registerProjectV2(address,uint256,uint256,uint8,uint256,uint256,uint256,(uint256,uint256,bool,(uint256,uint256,uint256,uint256)))" \
    $DEPLOYER \
    1000000000000000000 \
    0 \
    0 \
    0 \
    0 \
    0 \
    1000000000000000000000 \
    31536000 \
    true \
    1000000000000000000000 \
    100000000000000000000 \
    10000000000000000000 \
    1000000000000000000 \
    --rpc-url $RPC_URL \
    --private-key $CRE_ETH_PRIVATE_KEY \
    --value 0.01ether \
    --json | jq -r '.transactionHash')

echo "Register tx: $TX1"

# Get project ID from nextProjectId
PROJECT_ID=$(cast call $BOUNTY_HUB "nextProjectId()" --rpc-url $RPC_URL)
PROJECT_ID=$((PROJECT_ID - 1))
echo "Project ID: $PROJECT_ID"

# Check vnetStatus (should be 1 = Pending)
VNET_STATUS=$(cast call $BOUNTY_HUB "projects(uint256)" $PROJECT_ID --rpc-url $RPC_URL | awk '{print $13}')
echo "VNet Status: $VNET_STATUS (1=Pending)"

if [ "$VNET_STATUS" != "1" ]; then
    echo "FAIL: Expected vnetStatus=1 (Pending), got $VNET_STATUS"
    exit 1
fi

# ═══════════════════ Test 2: Set Project VNet ═══════════════════
echo ""
echo "=== Test 2: Set Project VNet ==="

VNET_RPC="https://virtual.tenderly.co/test-vnet/0x1234"
SNAPSHOT_ID="0x0000000000000000000000000000000000000000000000000000000000000001"

TX2=$(cast send $BOUNTY_HUB \
    "setProjectVnet(uint256,string,bytes32)" \
    $PROJECT_ID \
    "$VNET_RPC" \
    $SNAPSHOT_ID \
    --rpc-url $RPC_URL \
    --private-key $CRE_ETH_PRIVATE_KEY \
    --json | jq -r '.transactionHash')

echo "Set VNet tx: $TX2"

# Verify vnetStatus is now 2 (Active)
VNET_STATUS_AFTER=$(cast call $BOUNTY_HUB "projects(uint256)" $PROJECT_ID --rpc-url $RPC_URL | awk '{print $13}')
echo "VNet Status: $VNET_STATUS_AFTER (2=Active)"

if [ "$VNET_STATUS_AFTER" != "2" ]; then
    echo "FAIL: Expected vnetStatus=2 (Active), got $VNET_STATUS_AFTER"
    exit 1
fi

# ═══════════════════ Test 3: Mark VNet Failed ═══════════════════
echo ""
echo "=== Test 3: Mark VNet Failed (on another project) ===

# Register another project
cast send $BOUNTY_HUB \
    "registerProjectV2(address,uint256,uint256,uint8,uint256,uint256,uint256,(uint256,uint256,bool,(uint256,uint256,uint256,uint256)))" \
    $DEPLOYER \
    1000000000000000000 \
    0 \
    0 \
    0 \
    0 \
    0 \
    1000000000000000000000 \
    31536000 \
    true \
    1000000000000000000000 \
    100000000000000000000 \
    10000000000000000000 \
    1000000000000000000 \
    --rpc-url $RPC_URL \
    --private-key $CRE_ETH_PRIVATE_KEY \
    --value 0.01ether > /dev/null

PROJECT_ID_2=$(cast call $BOUNTY_HUB "nextProjectId()" --rpc-url $RPC_URL)
PROJECT_ID_2=$((PROJECT_ID_2 - 1))
echo "Project ID 2: $PROJECT_ID_2"

# Mark as failed
TX3=$(cast send $BOUNTY_HUB \
    "markVnetFailed(uint256,string)" \
    $PROJECT_ID_2 \
    "Test failure" \
    --rpc-url $RPC_URL \
    --private-key $CRE_ETH_PRIVATE_KEY \
    --json | jq -r '.transactionHash')

echo "Mark failed tx: $TX3"

# Verify vnetStatus is 3 (Failed)
VNET_STATUS_FAILED=$(cast call $BOUNTY_HUB "projects(uint256)" $PROJECT_ID_2 --rpc-url $RPC_URL | awk '{print $13}')
echo "VNet Status: $VNET_STATUS_FAILED (3=Failed)"

if [ "$VNET_STATUS_FAILED" != "3" ]; then
    echo "FAIL: Expected vnetStatus=3 (Failed), got $VNET_STATUS_FAILED"
    exit 1
fi

echo ""
echo "=== All E2E Tests Passed! ==="
