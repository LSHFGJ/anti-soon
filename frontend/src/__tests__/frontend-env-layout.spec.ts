import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(currentDirectory, "../..");
const repoRoot = path.resolve(frontendRoot, "..");

describe("frontend env layout", () => {
	it("keeps frontend Vite env examples inside the frontend workspace", () => {
		const frontendEnvExamplePath = path.join(frontendRoot, ".env.example");
		const repoEnvExamplePath = path.join(repoRoot, ".env.example");

		expect(existsSync(frontendEnvExamplePath)).toBe(true);

		const frontendEnvExample = readFileSync(frontendEnvExamplePath, "utf8");
		expect(frontendEnvExample).toContain("VITE_BOUNTY_HUB_ADDRESS=");
		expect(frontendEnvExample).toContain("VITE_RPC_URL=");
		expect(frontendEnvExample).toContain("VITE_REOWN_PROJECT_ID=");
		expect(frontendEnvExample).toContain("VITE_PUBLIC_APP_URL=");
		expect(frontendEnvExample).toContain("VITE_OASIS_STORAGE_CONTRACT=");
		expect(frontendEnvExample).toContain("VITE_CRE_SIM_API_URL=");
		expect(frontendEnvExample).not.toContain(
			"VITE_CRE_SIM_OASIS_STORAGE_CONTRACT=",
		);
		expect(frontendEnvExample).not.toContain("VITE_CRE_SIM_SEPOLIA_RPC_URL=");

		const repoEnvExample = readFileSync(repoEnvExamplePath, "utf8");
		expect(repoEnvExample).not.toContain("VITE_OASIS_STORAGE_CONTRACT=");
		expect(repoEnvExample).not.toContain("VITE_RPC_URL=");
		expect(repoEnvExample).not.toContain(
			"VITE_CRE_SIM_OASIS_STORAGE_CONTRACT=",
		);
		expect(repoEnvExample).not.toContain("VITE_CRE_SIM_SEPOLIA_RPC_URL=");
	});

	it("uses the frontend directory as the Vite env root", async () => {
		const viteConfigPath = path.join(frontendRoot, "vite.config.ts");
		const viteConfigSource = readFileSync(viteConfigPath, "utf8");

		expect(viteConfigSource).not.toContain("envDir:");
	});
});
