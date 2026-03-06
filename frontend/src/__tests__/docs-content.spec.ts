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

	it("accepts code, table, and link-list docs blocks", async () => {
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
});
