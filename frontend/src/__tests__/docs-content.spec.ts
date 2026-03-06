import { describe, expect, it } from "vitest";

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

	it("rejects malformed docs content pages", async () => {
		const docsContentModule = (await import("../reference/content")) as {
			assertDocsContentCollection?: (value: unknown) => void;
		};

		expect(typeof docsContentModule.assertDocsContentCollection).toBe("function");
		if (typeof docsContentModule.assertDocsContentCollection !== "function") {
			throw new Error("Missing assertDocsContentCollection export");
		}

		const assertDocsContentCollection = docsContentModule.assertDocsContentCollection;

			expect(() =>
				assertDocsContentCollection([
					{
						id: "broken-page",
						slug: "",
						href: "/docs",
					locale: "en",
					title: "Broken page",
					navigationLabel: "Broken page",
					summary: "Invalid docs content fixture",
					sections: [
						{
							id: "overview",
							title: "Overview",
							summary: "Valid section wrapper for slug validation",
							blocks: [
								{
									type: "paragraph",
									text: "This fixture keeps every other field valid.",
								},
							],
						},
					],
				},
			]),
		).toThrow(/slug/i);
	});

	it("rejects malformed docs callout and block shapes", async () => {
		const docsContentModule = (await import("../reference/content")) as {
			assertDocsContentCollection?: (value: unknown) => void;
		};

		expect(typeof docsContentModule.assertDocsContentCollection).toBe("function");
		if (typeof docsContentModule.assertDocsContentCollection !== "function") {
			throw new Error("Missing assertDocsContentCollection export");
		}

		const assertDocsContentCollection = docsContentModule.assertDocsContentCollection;

			expect(() =>
				assertDocsContentCollection([
					{
						id: "broken-callout",
						slug: "broken-callout",
						href: "/docs",
					locale: "en",
					title: "Broken callout",
					navigationLabel: "Broken callout",
					summary: "Invalid docs content fixture",
					sections: [
						{
							id: "overview",
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
				},
			]),
		).toThrow(/callout|tone|body/i);
	});
});
