import json
import os
import pathlib
import subprocess
import unittest
from typing import TypedDict, cast


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACTS_DIR = REPO_ROOT / "contracts"
BROADCAST_PATH = (
    CONTRACTS_DIR
    / "broadcast"
    / "DeployBountyHubV4.s.sol"
    / "11155111"
    / "run-latest.json"
)
EXPECTED_AUTHOR = "0xC1A97C6a4030a2089e1D9dA771De552bd67234a3"


class BroadcastTransaction(TypedDict):
    contractName: str
    contractAddress: str


class BroadcastArtifact(TypedDict):
    transactions: list[BroadcastTransaction]


class BountyHubSizeRegressionTest(unittest.TestCase):
    def test_bountyhub_deploy_script_runs_without_size_limit_failure(self) -> None:
        result = subprocess.run(
            [
                "forge",
                "script",
                "script/DeployBountyHubV4.s.sol:DeployBountyHubV4",
            ],
            cwd=CONTRACTS_DIR,
            env={
                **os.environ,
                "PRIVATE_KEY": "1",
                "CRE_WORKFLOW_OWNER": EXPECTED_AUTHOR,
            },
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        self.assertNotIn("contract size limit", result.stderr + result.stdout)

    def test_latest_broadcast_tracks_compact_bountyhub_address(self) -> None:
        artifact = cast(BroadcastArtifact, json.loads(BROADCAST_PATH.read_text()))
        self.assertEqual(
            artifact["transactions"][0]["contractName"], "BountyHub.bountyhub-compact"
        )
        self.assertTrue(artifact["transactions"][0]["contractAddress"].startswith("0x"))


if __name__ == "__main__":
    _ = unittest.main()
