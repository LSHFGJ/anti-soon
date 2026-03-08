import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(currentDirectory, "../..");

describe("vercel deploy contract", () => {
	it("keeps frontend prebuild self-contained inside the frontend workspace", () => {
		expect(packageJson.scripts.prebuild).not.toBe("bun run contracts:check");
		expect(packageJson.scripts.prebuild).toBe("node ./tooling/vercel-prebuild.mjs");
	});

	it("declares an SPA rewrite for browser-router deep links", () => {
		const vercelConfigPath = path.join(frontendRoot, "vercel.json");
		const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf8")) as {
			rewrites?: Array<{ source?: string; destination?: string }>;
		};

		expect(vercelConfig.rewrites).toContainEqual({
			source: "/(.*)",
			destination: "/index.html",
		});
	});
});
