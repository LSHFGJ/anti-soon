import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
WRAPPER_PATH = REPO_ROOT / "contracts" / "script" / "deploy_oasis_poc_store.sh"
FOUNDRY_TOML_PATH = REPO_ROOT / "contracts" / "foundry.toml"


class DeployOasisPoCStoreWrapperTest(unittest.TestCase):
    def test_foundry_config_uses_per_file_paris_restrictions(self) -> None:
        foundry_config = FOUNDRY_TOML_PATH.read_text()

        self.assertIn("additional_compiler_profiles", foundry_config)
        self.assertIn("compilation_restrictions", foundry_config)
        self.assertIn('paths = "script/DeployOasisPoCStore.s.sol"', foundry_config)
        self.assertIn('evm_version = "paris"', foundry_config)

    def test_default_profile_is_not_globally_downgraded(self) -> None:
        foundry_config = FOUNDRY_TOML_PATH.read_text()

        self.assertNotIn('[profile.default]\nevm_version = "paris"', foundry_config)

    def test_foundry_config_does_not_use_workspace_wide_sapphire_profile(self) -> None:
        foundry_config = FOUNDRY_TOML_PATH.read_text()

        self.assertNotIn("[profile.sapphire]", foundry_config)

    def test_wrapper_script_is_not_needed_once_sapphire_profile_exists(self) -> None:
        self.assertFalse(
            WRAPPER_PATH.exists(),
            "per-file Foundry restrictions should replace the dedicated deploy wrapper",
        )


if __name__ == "__main__":
    _ = unittest.main()
