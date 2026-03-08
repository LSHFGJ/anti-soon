import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(currentDirectory, "../..");

describe("vercel instrumentation contract", () => {
	it("declares the official Vercel analytics packages", () => {
		const packageJsonPath = path.join(frontendRoot, "package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			dependencies?: Record<string, string>;
		};

		expect(packageJson.dependencies).toMatchObject({
			"@vercel/analytics": expect.any(String),
			"@vercel/speed-insights": expect.any(String),
		});
	});

	it("mounts analytics and speed insights once at the app root", () => {
		const appPath = path.join(frontendRoot, "src", "App.tsx");
		const appSource = readFileSync(appPath, "utf8");

		expect(appSource).toContain("@vercel/analytics/react");
		expect(appSource).toContain("@vercel/speed-insights/react");
		expect(appSource).toContain("<Analytics />");
		expect(appSource).toContain("<SpeedInsights />");
	});
});
