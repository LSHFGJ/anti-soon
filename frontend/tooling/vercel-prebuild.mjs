import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const frontendDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(frontendDir, "..");
const tsBuildInfoPaths = [
	path.join(frontendDir, "node_modules/.tmp/tsconfig.app.tsbuildinfo"),
	path.join(frontendDir, "node_modules/.tmp/tsconfig.node.tsbuildinfo"),
];
const canonicalConfigPath = path.join(
	repoRoot,
	"workflow/verify-poc/config.staging.json",
);

for (const tsBuildInfoPath of tsBuildInfoPaths) {
	if (fs.existsSync(tsBuildInfoPath)) {
		fs.rmSync(tsBuildInfoPath, { force: true });
		console.log(
			`Cleared TypeScript incremental cache: ${path.relative(frontendDir, tsBuildInfoPath)}`,
		);
	}
}

if (!fs.existsSync(canonicalConfigPath)) {
	console.log(
		`Skipping contracts:check because ${path.relative(frontendDir, canonicalConfigPath)} is unavailable from this build root.`,
	);
	process.exit(0);
}

const result = spawnSync(
	process.execPath,
	["./tooling/sync-bountyhub-address.mjs", "--check"],
	{
		cwd: frontendDir,
		stdio: "inherit",
		env: process.env,
	},
);

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}
