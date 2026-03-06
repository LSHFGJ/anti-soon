import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

describe("docs policy contract", () => {
	it("exports the v1 docs scope lock and source contract", async () => {
		const policyModule = await import("../lib/docsPolicy");

		expect(policyModule.DOCS_V1_SCOPE).toEqual({
			routeBasePath: "/docs",
			routePrefixes: ["/docs"],
			searchEnabled: false,
			versioningEnabled: false,
			locales: ["en"],
			generationMode: "offline",
		});

		expect(policyModule.DOCS_LANDING_PAGE_HREF).toBe("/docs");
		expect(typeof policyModule.collectDocsRoutePathViolations).toBe("function");
		if (typeof policyModule.collectDocsRoutePathViolations === "function") {
			expect(policyModule.collectDocsRoutePathViolations("/docs")).toEqual([]);
			expect(policyModule.collectDocsRoutePathViolations("/docs/architecture")).toEqual([]);
		}

		expect(
			policyModule.collectDocsSourceContractViolations([
				"src/reference/content/getting-started.ts",
				"src/reference/content/introduction.json",
			]),
		).toEqual([]);

		expect(policyModule.DOCS_SOURCE_CONTRACT).toMatchObject({
			canonicalSourceRoot: "src/reference/content",
			canonicalManifestPath: "src/reference/content/index.ts",
		});

		expect(
			policyModule.collectDocsSourceContractViolations([
				"src/reference/content/getting-started.md",
				"src/reference/content/search-index.json",
				"src/reference/content/v2/overview.ts",
				"src/reference/content/fr/overview.ts",
			]),
		).toEqual([
			'Canonical docs content must not use markdown sources: "src/reference/content/getting-started.md"',
			'Docs v1 forbids search artifacts in committed source: "src/reference/content/search-index.json"',
			'Docs v1 forbids versioned source trees: "src/reference/content/v2/overview.ts"',
			'Docs v1 is English-only; found localized source path: "src/reference/content/fr/overview.ts"',
		]);
	});

	it("rejects docs routes outside the flat /docs contract", async () => {
		const policyModule = await import("../lib/docsPolicy");

		expect(
			policyModule.collectDocsV1ScopeViolations({
				...policyModule.DOCS_V1_SCOPE,
				routeBasePath: "/guides",
				routePrefixes: ["/guides"],
			}),
		).toEqual([
			'Docs v1 must use a single "/docs" route base; received "/guides"',
			"Docs v1 must expose exactly one route prefix: /docs",
		]);

		expect(typeof policyModule.collectDocsRoutePathViolations).toBe("function");
		if (typeof policyModule.collectDocsRoutePathViolations !== "function") {
			return;
		}

		expect(policyModule.collectDocsRoutePathViolations("/docs/reference/contracts")).toEqual([
			'Docs v1 routes must be "/docs" or a flat child route like "/docs/<slug>"; received "/docs/reference/contracts"',
		]);

		expect(policyModule.collectDocsRoutePathViolations("/guides/architecture")).toEqual([
			'Docs v1 routes must stay rooted at "/docs"; received "/guides/architecture"',
		]);
	});

	it("requires README.md to advertise the docs route and offline review workflow", async () => {
		const policyModule = await import("../lib/docsPolicy");

		expect(policyModule.DOCS_README_CONTRACT).toMatchObject({
			requiredHeading: "## Documentation",
			requiredRouteBasePath: "/docs",
			requiredRolloutCommands: [
				"cd frontend && bun run contracts:sync",
				"bun run contracts:check",
			],
			generationMode: "offline",
		});

		expect(
			policyModule.collectDocsReadmeContractViolations(`
# AntiSoon

## Documentation

Visit /docs to explore the public docs portal.
The docs follow an offline writing model and require human review before publication.
Run cd frontend && bun run contracts:sync before rollout.
Run cd frontend && bun run contracts:check before rollout.
`),
		).toEqual([]);

		expect(
			policyModule.collectDocsReadmeContractViolations(`# AntiSoon\n## Usage\nRead the guide online.`),
		).toEqual([
			'Readme docs contract requires the heading "## Documentation".',
			'Readme docs contract must mention the docs route base "/docs".',
			'Readme docs contract must mention the offline writing model.',
			'Readme docs contract must mention human review before publication.',
			'Readme docs contract must include the rollout command "cd frontend && bun run contracts:sync".',
			'Readme docs contract must include the rollout command "bun run contracts:check".',
		]);
	});

	it("registers an executable docs:policy guard command", () => {
		expect(packageJson.scripts["docs:policy"]).toBe(
			"bun run ./tooling/check-docs-policy.ts",
		);
		expect(packageJson.scripts["test:unit"]).toBe(
			"node ./tooling/run-vitest-unit.mjs",
		);
	});
});
