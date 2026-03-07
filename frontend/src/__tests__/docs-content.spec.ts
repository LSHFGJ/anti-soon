import { describe, expect, it } from "vitest";


function createSection(
	id: string,
	title = "Overview",
	overrides: Partial<{
		summary: string;
		blocks: readonly Record<string, unknown>[];
	}> = {},
) {
	return {
		id,
		anchor: {
			id,
			label: title,
		},
		title,
		summary: `${title} fixture summary`,
		blocks: [
			{
				type: "paragraph",
				text: `${title} fixture content.`,
			},
		],
		...overrides,
	};
}

function createPage(
	overrides: Partial<{
		id: string;
		slug: string;
		href: string;
		locale: "en";
		title: string;
		summary: string;
		sections: readonly Record<string, unknown>[];
	}> = {},
) {
	return {
		id: "overview",
		slug: "overview",
		href: "/docs",
		locale: "en" as const,
		title: "Docs Overview",
		summary: "Valid docs page fixture",
		sections: [createSection("overview")],
		...overrides,
	};
}

async function loadAssertDocsContentCollection() {
	const docsContentModule = (await import("../reference/content")) as {
		assertDocsContentCollection?: (value: unknown) => void;
	};

	expect(typeof docsContentModule.assertDocsContentCollection).toBe("function");
	if (typeof docsContentModule.assertDocsContentCollection !== "function") {
		throw new Error("Missing assertDocsContentCollection export");
	}

	return docsContentModule.assertDocsContentCollection;
}

describe("docs content schema", () => {
	it("exports a canonical v1 docs manifest with stable page, section, and block metadata", async () => {
		const docsContentModule = (await import("../reference/content")) as {
			docsSourceManifest?: unknown;
			DOCS_CONTENT?: unknown;
		};

		expect(Array.isArray(docsContentModule.docsSourceManifest)).toBe(true);
		expect(docsContentModule.docsSourceManifest).not.toHaveLength(0);
		expect(docsContentModule.DOCS_CONTENT).toBe(docsContentModule.docsSourceManifest);

		const [firstPage] = docsContentModule.docsSourceManifest as Array<Record<string, unknown>>;
		expect(firstPage).toMatchObject({
			id: expect.any(String),
			slug: expect.any(String),
			href: "/docs",
			locale: "en",
			title: expect.any(String),
			summary: expect.any(String),
			sections: expect.any(Array),
		});

		const [firstSection] = firstPage.sections as Array<Record<string, unknown>>;
		expect(firstSection).toMatchObject({
			id: expect.any(String),
			title: expect.any(String),
			summary: expect.any(String),
			blocks: expect.any(Array),
		});
	});

	it("keeps the docs manifest aligned with the canonical docs policy contract", async () => {
		const [{ docsSourceManifest }, { DOCS_SOURCE_CONTRACT }] = await Promise.all([
			import("../reference/content"),
			import("../lib/docsPolicy"),
		]);

		expect(DOCS_SOURCE_CONTRACT.canonicalManifestPath).toBe("src/reference/content/index.ts");
		expect(docsSourceManifest).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					locale: "en",
					href: "/docs",
				}),
			]),
		);
	});

	it("does not expose the removed docs contract section on the overview page", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const overviewPage = docsSourceManifest.find((page) => page.slug === "overview");

		expect(overviewPage).toBeDefined();
		expect(overviewPage?.sections.map((section) => section.id)).not.toContain("docs-contract");
	});

	it("does not render a flowchart on the docs overview landing section", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const overviewPage = docsSourceManifest.find((page) => page.slug === "overview");
		const overviewSection = overviewPage?.sections.find((section) => section.id === "overview");

		expect(overviewSection).toBeDefined();
		expect(overviewSection?.blocks.map((block) => block.type)).not.toContain("mermaid");
	});

	it("realigns the core protocol docs around the lifecycle design vocabulary", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const getSectionIds = (slug: string) =>
			docsSourceManifest.find((page) => page.slug === slug)?.sections.map((section) => section.id) ?? [];

		expect(getSectionIds("data-flow")).toEqual(
			expect.arrayContaining([
				"protocol-pipeline",
				"mode-dependent-reveal-orchestration",
				"verdict-and-settlement-paths",
			]),
		);
		expect(getSectionIds("submit-poc")).toEqual(
			expect.arrayContaining([
				"submission-readiness",
				"commit-path",
				"post-commit-lifecycle",
			]),
		);
		expect(getSectionIds("create-project")).toEqual(
			expect.arrayContaining([
				"project-bootstrap",
				"mode-and-deadline-design",
				"registration-and-activation",
			]),
		);
		expect(getSectionIds("explore-projects")).toEqual(
			expect.arrayContaining([
				"project-discovery",
				"timeline-and-visibility",
				"submission-signal-reading",
			]),
		);
		expect(getSectionIds("dashboard-and-leaderboard")).toEqual(
			expect.arrayContaining([
				"visibility-model",
				"verdict-and-payout-signals",
				"grouping-and-ranking",
			]),
		);
		expect(getSectionIds("operations")).toEqual(
			expect.arrayContaining([
				"runtime-topology",
				"orchestration-checkpoints",
				"release-and-docs-gates",
			]),
		);
		expect(getSectionIds("security")).toEqual(
			expect.arrayContaining([
				"security-goals",
				"confidentiality-and-provenance",
				"verification-and-adjudication-trust",
			]),
		);
		expect(getSectionIds("getting-started")).toEqual(
			expect.arrayContaining([
				"protocol-orientation",
				"researcher-and-owner-entry-points",
				"onboarding-prerequisites",
			]),
		);
		expect(getSectionIds("troubleshooting")).toEqual(
			expect.arrayContaining([
				"lifecycle-debugging-lens",
				"commit-and-visibility-issues",
				"read-model-and-routing-issues",
			]),
		);
	});

	it("removes the API & Contracts page from the docs manifest and overview quick paths", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const overviewPage = docsSourceManifest.find((page) => page.slug === "overview");
		const docsText = JSON.stringify(docsSourceManifest);
		const overviewText = JSON.stringify(overviewPage);

		expect(docsSourceManifest.map((page) => page.slug)).not.toContain("api-and-contracts");
		expect(docsText).not.toContain('/docs/api-and-contracts');
		expect(overviewText).not.toContain('API & Contracts');
	});

	it("documents the detailed jury orchestration design from the original protocol source", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const getPage = (slug: string) => docsSourceManifest.find((page) => page.slug === slug);

		const architecture = getPage("architecture");
		const dataFlow = getPage("data-flow");
		const security = getPage("security");

		expect(architecture?.sections.map((section) => section.id)).toEqual(
			expect.arrayContaining(["jury-orchestration-design"]),
		);
		expect(dataFlow?.sections.map((section) => section.id)).toEqual(
			expect.arrayContaining(["confidential-jury-flow"]),
		);
		expect(security?.sections.map((section) => section.id)).toEqual(
			expect.arrayContaining(["jury-selection-and-confidentiality"]),
		);

		const architectureText = JSON.stringify(architecture);
		const dataFlowText = JSON.stringify(dataFlow);
		const securityText = JSON.stringify(security);

		expect(architectureText).toContain("5 LLM");
		expect(architectureText).toContain("5 human");
		expect(architectureText).toContain("verification window");
		expect(dataFlowText).toContain("solo");
		expect(dataFlowText).toContain("duplicate");
		expect(dataFlowText).toContain("owner testimony");
		expect(securityText).toContain("VRF randomness");
		expect(securityText).toContain("zk");
	});

	it("publishes a minimal addresses page with real on-chain contract addresses and one repo link", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const lastPage = docsSourceManifest.at(-1);
		const addressesPage = docsSourceManifest.find(
			(page) => page.slug === "deployments-and-repositories",
		);

		expect(lastPage?.slug).toBe("deployments-and-repositories");
		expect(addressesPage?.title).toBe("Addresses");
		expect(addressesPage?.sections.map((section) => section.id)).toEqual(
			expect.arrayContaining([
				"contracts",
				"repository",
			]),
		);

		const addressesText = JSON.stringify(addressesPage);
		expect(addressesText).toContain("0x17797b473864806072186f6997801D4473AAF6e8");
		expect(addressesText).toContain("0x15fC6ae953E024d975e77382eEeC56A9101f9F88");
		expect(addressesText).toContain("https://github.com/LSHFGJ/anti-soon");
		expect(addressesText).not.toContain("Evidence");
		expect(addressesText).not.toContain("VITE_OASIS_STORAGE_CONTRACT");
	});

	it("models confidential storage as a workflow-connected surface in the system diagram", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const architecture = docsSourceManifest.find((page) => page.slug === "architecture");
		const systemModel = architecture?.sections.find((section) => section.id === "system-model");
		const mermaidBlock = systemModel?.blocks.find((block) => block.type === "mermaid");

		expect(mermaidBlock).toBeDefined();
		const diagram = mermaidBlock && mermaidBlock.type === "mermaid" ? mermaidBlock.diagram : "";
		expect(diagram).toContain("OasisPOCStore");
		expect(diagram).toContain("CRE Workflow DON");
		expect(diagram).toContain("confidential store / retrieve");
		expect(diagram).toContain("Auditor");
		expect(diagram).toContain("payout");
	expect(diagram).toContain("jury verification");
	expect(diagram).not.toContain("Explorer and Dashboard reads");
	});

	it("keeps the System Model section focused on prose plus the flowchart", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const architecture = docsSourceManifest.find((page) => page.slug === "architecture");
		const systemModel = architecture?.sections.find((section) => section.id === "system-model");
		expect(
			systemModel?.blocks.some((block) => JSON.stringify(block).includes('"type":"table"')),
		).toBe(false);
	});

	it("does not duplicate step numbering inside step titles", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const numberedTitles = docsSourceManifest.flatMap((page) =>
			page.sections.flatMap((section) =>
				section.blocks.flatMap((block) =>
					block.type === "steps"
						? block.items
								.filter((item) => /^\d+\.\s/.test(item.title))
								.map((item) => `${page.slug}:${section.id}:${item.title}`)
						: [],
				),
			),
		);

		expect(numberedTitles).toEqual([]);
	});

	it("uses steps blocks instead of ordered list blocks for numbered walkthroughs", async () => {
		const { docsSourceManifest } = await import("../reference/content");
		const orderedLists = docsSourceManifest.flatMap((page) =>
			page.sections.flatMap((section) =>
				section.blocks.flatMap((block) =>
					block.type === "list" && JSON.stringify(block).includes('"style":"ordered"')
						? [`${page.slug}:${section.id}`]
						: [],
				),
			),
		);

		expect(orderedLists).toEqual([]);
	});

	it("allows the /docs landing page plus flat /docs/<slug> child pages", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage(),
				createPage({
					id: "architecture",
					slug: "architecture",
					href: "/docs/architecture",
					title: "Architecture",
					summary: "Flat child docs page fixture",
					sections: [createSection("architecture", "Architecture")],
				}),
			]),
		).not.toThrow();
	});

	it("rejects nested docs child paths", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage(),
				createPage({
					id: "contracts",
					slug: "contracts",
					href: "/docs/reference/contracts",
					title: "Contracts",
					summary: "Nested child docs page fixture",
					sections: [createSection("contracts", "Contracts")],
				}),
			]),
		).toThrow(/\/docs\/<slug>|reference\/contracts/i);
	});

	it("rejects slash-containing docs slugs", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage(),
				createPage({
					id: "contracts",
					slug: "reference/contracts",
					href: "/docs/reference/contracts",
					title: "Contracts",
					summary: "Slash-containing slug fixture",
					sections: [createSection("contracts", "Contracts")],
				}),
			]),
		).toThrow(/slug|kebab-case/i);
	});

	it("rejects malformed docs content pages", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "broken-page",
					slug: "",
					title: "Broken page",
					summary: "Invalid docs content fixture",
				}),
			]),
		).toThrow(/slug/i);
	});

	it("rejects malformed docs callout and block shapes", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "broken-callout",
					slug: "broken-callout",
					href: "/docs/broken-callout",
					title: "Broken callout",
					summary: "Invalid docs content fixture",
					sections: [
						{
							id: "overview",
							anchor: {
								id: "overview",
								label: "Overview",
							},
							title: "Overview",
							summary: "Invalid callout fixture",
							blocks: [
								{
									type: "callout",
									tone: "panic",
									title: "Broken tone",
									body: [],
								},
							],
						},
					],
				}),
			]),
		).toThrow(/callout|tone|body/i);
	});

	it("accepts code, table, mermaid, and link-list docs blocks", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "technical-blocks",
					slug: "technical-blocks",
					href: "/docs/technical-blocks",
					title: "Technical blocks",
					summary: "Structured technical content fixture",
					sections: [
						createSection("technical-blocks", "Technical blocks", {
							blocks: [
								{
									type: "code",
									language: "ts",
									code: "export const retries = 3;",
									caption: "Retry configuration",
								},
								{
									type: "table",
									columns: ["Setting", "Value"],
									rows: [
										["mode", "strict"],
										["retries", "3"],
									],
									caption: "Runtime defaults",
								},
								{
									type: "mermaid",
									diagram: "flowchart TD\nA[Commit] --> B[Reveal]",
									caption: "Lifecycle overview",
								},
								{
									type: "link-list",
									items: [
										{
											title: "Overview",
											href: "/docs",
											description: "Return to the docs landing page.",
										},
										{
											title: "Architecture",
											href: "/docs/architecture",
											description: "Open a flat child docs page.",
										},
										{
											title: "Protocol reference",
											href: "https://example.com/reference",
											description: "Read the external technical reference.",
										},
									],
								},
							],
						}),
					],
				}),
			]),
		).not.toThrow();
	});

	it("rejects code blocks without a language or code sample", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "broken-code",
					slug: "broken-code",
					href: "/docs/broken-code",
					title: "Broken code",
					summary: "Invalid code block fixture",
					sections: [
						createSection("broken-code", "Broken code", {
							blocks: [
								{
									type: "code",
									language: "",
									code: "",
								},
							],
						}),
					],
				}),
			]),
		).toThrow(/language|code/i);
	});

	it("rejects tables with empty columns", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "broken-table-columns",
					slug: "broken-table-columns",
					href: "/docs/broken-table-columns",
					title: "Broken table columns",
					summary: "Invalid table column fixture",
					sections: [
						createSection("broken-table-columns", "Broken table columns", {
							blocks: [
								{
									type: "table",
									columns: [],
									rows: [],
								},
							],
						}),
					],
				}),
			]),
		).toThrow(/columns/i);
	});

	it("rejects tables whose rows do not match the column count", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "broken-table-rows",
					slug: "broken-table-rows",
					href: "/docs/broken-table-rows",
					title: "Broken table rows",
					summary: "Invalid table row fixture",
					sections: [
						createSection("broken-table-rows", "Broken table rows", {
							blocks: [
								{
									type: "table",
									columns: ["Setting", "Value"],
									rows: [["mode"]],
								},
							],
						}),
					],
				}),
			]),
		).toThrow(/rows|columns/i);
	});

	it("rejects link-list items with invalid hrefs", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "broken-link-list-href",
					slug: "broken-link-list-href",
					href: "/docs/broken-link-list-href",
					title: "Broken link list href",
					summary: "Invalid link-list href fixture",
					sections: [
						createSection("broken-link-list-href", "Broken link list href", {
							blocks: [
								{
									type: "link-list",
									items: [
										{
											title: "Nested docs path",
											href: "/docs/reference/contracts",
											description: "This href should be rejected.",
										},
									],
								},
							],
						}),
					],
				}),
			]),
		).toThrow(/href|\/docs\/<slug>|nested/i);
	});

	it("rejects link-list items without a title or description", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "broken-link-list-text",
					slug: "broken-link-list-text",
					href: "/docs/broken-link-list-text",
					title: "Broken link list text",
					summary: "Invalid link-list text fixture",
					sections: [
						createSection("broken-link-list-text", "Broken link list text", {
							blocks: [
								{
									type: "link-list",
									items: [
										{
											title: "",
											href: "/docs",
											description: "",
										},
									],
								},
							],
						}),
					],
				}),
			]),
		).toThrow(/title|description/i);
	});

	it("rejects mermaid blocks without a diagram", async () => {
		const assertDocsContentCollection = await loadAssertDocsContentCollection();

		expect(() =>
			assertDocsContentCollection([
				createPage({
					id: "broken-mermaid",
					slug: "broken-mermaid",
					href: "/docs/broken-mermaid",
					title: "Broken mermaid",
					summary: "Invalid mermaid fixture",
					sections: [
						createSection("broken-mermaid", "Broken mermaid", {
							blocks: [
								{
									type: "mermaid",
									diagram: "",
								},
							],
						}),
					],
				}),
			]),
		).toThrow(/diagram/i);
	});
});
