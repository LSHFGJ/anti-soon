import {
	collectDocsRoutePathViolations,
	DOCS_LANDING_PAGE_HREF,
	DOCS_V1_SCOPE,
} from "../../lib/docsPolicy";

const DOCS_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOCS_LANDING_PAGE_SLUG = "overview";
const DOCS_EXTERNAL_HTTPS_HREF_PATTERN = /^https:\/\/.+/;

export const DOCS_LOCALES = ["en"] as const;
export const DOCS_CALLOUT_TONES = ["info", "success", "warning", "error"] as const;
export const DOCS_LIST_STYLES = ["unordered", "ordered"] as const;
export const DOCS_BLOCK_TYPES = ["paragraph", "list", "callout", "steps", "code", "table", "link-list"] as const;

export type DocsLocale = (typeof DOCS_LOCALES)[number];
export type DocsCalloutTone = (typeof DOCS_CALLOUT_TONES)[number];
export type DocsListStyle = (typeof DOCS_LIST_STYLES)[number];
export type DocsBlockType = (typeof DOCS_BLOCK_TYPES)[number];

export type DocsAnchor = {
	id: string;
	label: string;
};

export type DocsParagraphBlock = {
	type: "paragraph";
	text: string;
};

export type DocsListBlock = {
	type: "list";
	style: DocsListStyle;
	items: readonly string[];
};

export type DocsCalloutBlock = {
	type: "callout";
	tone: DocsCalloutTone;
	title: string;
	body: readonly string[];
};

export type DocsStepItem = {
	title: string;
	body: string;
};

export type DocsStepsBlock = {
	type: "steps";
	items: readonly DocsStepItem[];
};

export type DocsCodeBlock = {
	type: "code";
	language: string;
	code: string;
	caption?: string;
};

export type DocsTableBlock = {
	type: "table";
	columns: readonly string[];
	rows: readonly (readonly string[])[];
	caption?: string;
};

export type DocsLinkListItem = {
	title: string;
	href: string;
	description: string;
};

export type DocsLinkListBlock = {
	type: "link-list";
	items: readonly DocsLinkListItem[];
};

export type DocsContentBlock =
	| DocsParagraphBlock
	| DocsListBlock
	| DocsCalloutBlock
	| DocsStepsBlock
	| DocsCodeBlock
	| DocsTableBlock
	| DocsLinkListBlock;

export type DocsSection = {
	id: string;
	anchor: DocsAnchor;
	title: string;
	summary: string;
	blocks: readonly DocsContentBlock[];
};

export type DocsPage = {
	id: string;
	slug: string;
	href: string;
	locale: DocsLocale;
	title: string;
	summary: string;
	sections: readonly DocsSection[];
};

export type DocsContentCollection = readonly DocsPage[];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushViolation(violations: string[], path: string, message: string): void {
	violations.push(`${path}: ${message}`);
}

function readNonEmptyString(
	value: unknown,
	path: string,
	violations: string[],
): string | null {
	if (typeof value !== "string") {
		pushViolation(violations, path, `expected string, received ${typeof value}`);
		return null;
	}

	const normalizedValue = value.trim();
	if (normalizedValue.length === 0) {
		pushViolation(violations, path, "must be a non-empty string");
		return null;
	}

	return normalizedValue;
}

function readOptionalNonEmptyString(
	value: unknown,
	path: string,
	violations: string[],
): string | undefined {
	if (typeof value === "undefined") {
		return undefined;
	}

	const normalizedValue = readNonEmptyString(value, path, violations);
	return normalizedValue === null ? undefined : normalizedValue;
}

function validateIdentifier(value: string | null, path: string, violations: string[]): void {
	if (value === null) {
		return;
	}

	if (!DOCS_IDENTIFIER_PATTERN.test(value)) {
		pushViolation(
			violations,
			path,
			'must use lowercase kebab-case identifiers (for example, "getting-started")',
		);
	}
}

function validateHref(value: string | null, path: string, violations: string[]): void {
	if (value === null) {
		return;
	}

	for (const violation of collectDocsRoutePathViolations(value, DOCS_V1_SCOPE)) {
		pushViolation(violations, path, violation);
	}
}

function validateDocsLinkHref(value: string | null, path: string, violations: string[]): void {
	if (value === null) {
		return;
	}

	if (value.startsWith(DOCS_V1_SCOPE.routeBasePath)) {
		validateHref(value, path, violations);
		return;
	}

	if (DOCS_EXTERNAL_HTTPS_HREF_PATTERN.test(value)) {
		return;
	}

	pushViolation(violations, path, 'must be "/docs", "/docs/<slug>", or "https://..."');
}

function getExpectedHrefForSlug(slug: string): string {
	if (slug === DOCS_LANDING_PAGE_SLUG) {
		return DOCS_LANDING_PAGE_HREF;
	}

	return `${DOCS_V1_SCOPE.routeBasePath}/${slug}`;
}

function validateStringList(
	value: unknown,
	path: string,
	violations: string[],
): string[] {
	if (!Array.isArray(value)) {
		pushViolation(violations, path, `expected array, received ${typeof value}`);
		return [];
	}

	if (value.length === 0) {
		pushViolation(violations, path, "must contain at least one item");
	}

	return value.flatMap((item, index) => {
		const text = readNonEmptyString(item, `${path}[${index}]`, violations);
		return text === null ? [] : [text];
	});
}

function validateTableRows(
	value: unknown,
	path: string,
	columnCount: number,
	violations: string[],
): void {
	if (!Array.isArray(value)) {
		pushViolation(violations, path, `expected array, received ${typeof value}`);
		return;
	}

	for (const [index, row] of value.entries()) {
		const rowPath = `${path}[${index}]`;
		if (!Array.isArray(row)) {
			pushViolation(
				violations,
				rowPath,
				`expected array, received ${Array.isArray(row) ? "array" : typeof row}`,
			);
			continue;
		}

		if (row.length !== columnCount) {
			pushViolation(
				violations,
				rowPath,
				`must contain exactly ${columnCount} cells to match columns length`,
			);
		}

		for (const [cellIndex, cell] of row.entries()) {
			if (typeof cell !== "string") {
				pushViolation(violations, `${rowPath}[${cellIndex}]`, `expected string, received ${typeof cell}`);
			}
		}
	}
}

function validateLinkListItems(value: unknown, path: string, violations: string[]): void {
	if (!Array.isArray(value)) {
		pushViolation(violations, path, `expected array, received ${typeof value}`);
		return;
	}

	if (value.length === 0) {
		pushViolation(violations, path, "must contain at least one item");
	}

	for (const [index, item] of value.entries()) {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) {
			pushViolation(
				violations,
				itemPath,
				`expected object, received ${Array.isArray(item) ? "array" : typeof item}`,
			);
			continue;
		}

		readNonEmptyString(item.title, `${itemPath}.title`, violations);
		const href = readNonEmptyString(item.href, `${itemPath}.href`, violations);
		validateDocsLinkHref(href, `${itemPath}.href`, violations);
		readNonEmptyString(item.description, `${itemPath}.description`, violations);
	}
}

function validateAnchor(
	value: unknown,
	path: string,
	sectionId: string | null,
	violations: string[],
): void {
	if (!isRecord(value)) {
		pushViolation(violations, path, `expected object, received ${Array.isArray(value) ? "array" : typeof value}`);
		return;
	}

	const anchorId = readNonEmptyString(value.id, `${path}.id`, violations);
	validateIdentifier(anchorId, `${path}.id`, violations);
	readNonEmptyString(value.label, `${path}.label`, violations);

	if (anchorId !== null && sectionId !== null && anchorId !== sectionId) {
		pushViolation(violations, `${path}.id`, `must match section id "${sectionId}"`);
	}
}

function validateBlock(value: unknown, path: string, violations: string[]): void {
	if (!isRecord(value)) {
		pushViolation(violations, path, `expected object, received ${Array.isArray(value) ? "array" : typeof value}`);
		return;
	}

	const type = readNonEmptyString(value.type, `${path}.type`, violations);
	if (type === null) {
		return;
	}

	if (!(DOCS_BLOCK_TYPES as readonly string[]).includes(type)) {
		pushViolation(
			violations,
			`${path}.type`,
			`must be one of: ${DOCS_BLOCK_TYPES.join(", ")}`,
		);
		return;
	}

	switch (type) {
		case "paragraph":
			readNonEmptyString(value.text, `${path}.text`, violations);
			return;
		case "list": {
			const style = readNonEmptyString(value.style, `${path}.style`, violations);
			if (style !== null && !(DOCS_LIST_STYLES as readonly string[]).includes(style)) {
				pushViolation(
					violations,
					`${path}.style`,
					`must be one of: ${DOCS_LIST_STYLES.join(", ")}`,
				);
			}
			validateStringList(value.items, `${path}.items`, violations);
			return;
		}
		case "callout": {
			const tone = readNonEmptyString(value.tone, `${path}.tone`, violations);
			if (tone !== null && !(DOCS_CALLOUT_TONES as readonly string[]).includes(tone)) {
				pushViolation(
					violations,
					`${path}.tone`,
					`must be one of: ${DOCS_CALLOUT_TONES.join(", ")}`,
				);
			}
			readNonEmptyString(value.title, `${path}.title`, violations);
			validateStringList(value.body, `${path}.body`, violations);
			return;
		}
		case "steps": {
			if (!Array.isArray(value.items)) {
				pushViolation(violations, `${path}.items`, `expected array, received ${typeof value.items}`);
				return;
			}

			if (value.items.length === 0) {
				pushViolation(violations, `${path}.items`, "must contain at least one step");
			}

			for (const [index, item] of value.items.entries()) {
				const itemPath = `${path}.items[${index}]`;
				if (!isRecord(item)) {
					pushViolation(
						violations,
						itemPath,
						`expected object, received ${Array.isArray(item) ? "array" : typeof item}`,
					);
					continue;
				}

				readNonEmptyString(item.title, `${itemPath}.title`, violations);
				readNonEmptyString(item.body, `${itemPath}.body`, violations);
			}
			return;
		}
		case "code":
			readNonEmptyString(value.language, `${path}.language`, violations);
			readNonEmptyString(value.code, `${path}.code`, violations);
			readOptionalNonEmptyString(value.caption, `${path}.caption`, violations);
			return;
		case "table": {
			const columns = validateStringList(value.columns, `${path}.columns`, violations);
			validateTableRows(value.rows, `${path}.rows`, columns.length, violations);
			readOptionalNonEmptyString(value.caption, `${path}.caption`, violations);
			return;
		}
		case "link-list":
			validateLinkListItems(value.items, `${path}.items`, violations);
			return;
	}
}

function validateSection(value: unknown, path: string, violations: string[]): void {
	if (!isRecord(value)) {
		pushViolation(violations, path, `expected object, received ${Array.isArray(value) ? "array" : typeof value}`);
		return;
	}

	const sectionId = readNonEmptyString(value.id, `${path}.id`, violations);
	validateIdentifier(sectionId, `${path}.id`, violations);
	readNonEmptyString(value.title, `${path}.title`, violations);
	readNonEmptyString(value.summary, `${path}.summary`, violations);
	validateAnchor(value.anchor, `${path}.anchor`, sectionId, violations);

	if (!Array.isArray(value.blocks)) {
		pushViolation(violations, `${path}.blocks`, `expected array, received ${typeof value.blocks}`);
		return;
	}

	if (value.blocks.length === 0) {
		pushViolation(violations, `${path}.blocks`, "must contain at least one content block");
	}

	for (const [index, block] of value.blocks.entries()) {
		validateBlock(block, `${path}.blocks[${index}]`, violations);
	}
}

export function collectDocsContentCollectionViolations(value: unknown): string[] {
	const violations: string[] = [];

	if (!Array.isArray(value)) {
		pushViolation(violations, "docsContent", `expected array, received ${typeof value}`);
		return violations;
	}

	if (value.length === 0) {
		pushViolation(violations, "docsContent", "must contain at least one page");
	}

	const pageIds = new Set<string>();
	const pageSlugs = new Set<string>();
	const pageHrefs = new Set<string>();

	for (const [pageIndex, page] of value.entries()) {
		const pagePath = `docsContent[${pageIndex}]`;
		if (!isRecord(page)) {
			pushViolation(violations, pagePath, `expected object, received ${Array.isArray(page) ? "array" : typeof page}`);
			continue;
		}

		const pageId = readNonEmptyString(page.id, `${pagePath}.id`, violations);
		validateIdentifier(pageId, `${pagePath}.id`, violations);

		const slug = readNonEmptyString(page.slug, `${pagePath}.slug`, violations);
		validateIdentifier(slug, `${pagePath}.slug`, violations);

		const href = readNonEmptyString(page.href, `${pagePath}.href`, violations);
		validateHref(href, `${pagePath}.href`, violations);

		const locale = readNonEmptyString(page.locale, `${pagePath}.locale`, violations);
		if (locale !== null && !(DOCS_LOCALES as readonly string[]).includes(locale)) {
			pushViolation(violations, `${pagePath}.locale`, `must be one of: ${DOCS_LOCALES.join(", ")}`);
		}

		readNonEmptyString(page.title, `${pagePath}.title`, violations);
		readNonEmptyString(page.summary, `${pagePath}.summary`, violations);

		if (pageId !== null) {
			if (pageIds.has(pageId)) {
				pushViolation(violations, `${pagePath}.id`, `duplicates page id "${pageId}"`);
			} else {
				pageIds.add(pageId);
			}
		}

		if (slug !== null) {
			if (pageSlugs.has(slug)) {
				pushViolation(violations, `${pagePath}.slug`, `duplicates page slug "${slug}"`);
			} else {
				pageSlugs.add(slug);
			}
		}

		if (href !== null) {
			if (pageHrefs.has(href)) {
				pushViolation(violations, `${pagePath}.href`, `duplicates page href "${href}"`);
			} else {
				pageHrefs.add(href);
			}

			if (slug !== null) {
				const expectedHref = getExpectedHrefForSlug(slug);
				if (href !== expectedHref) {
					pushViolation(
						violations,
						`${pagePath}.href`,
						`must match slug-derived href "${expectedHref}"`,
					);
				}
			}
		}

		if (!Array.isArray(page.sections)) {
			pushViolation(violations, `${pagePath}.sections`, `expected array, received ${typeof page.sections}`);
			continue;
		}

		if (page.sections.length === 0) {
			pushViolation(violations, `${pagePath}.sections`, "must contain at least one section");
		}

		const sectionIds = new Set<string>();
		for (const [sectionIndex, section] of page.sections.entries()) {
			const sectionPath = `${pagePath}.sections[${sectionIndex}]`;
			validateSection(section, sectionPath, violations);

			if (!isRecord(section)) {
				continue;
			}

			const sectionId =
				typeof section.id === "string" && section.id.trim().length > 0
					? section.id.trim()
					: null;

			if (sectionId !== null) {
				if (sectionIds.has(sectionId)) {
					pushViolation(violations, `${sectionPath}.id`, `duplicates section id "${sectionId}"`);
				} else {
					sectionIds.add(sectionId);
				}
			}
		}
	}

	return violations;
}

export function assertDocsContentCollection(value: unknown): asserts value is DocsContentCollection {
	const violations = collectDocsContentCollectionViolations(value);

	if (violations.length > 0) {
		throw new Error(violations.join("\n"));
	}
}

export function defineDocsContentCollection<const T extends DocsContentCollection>(value: T): T {
	assertDocsContentCollection(value);
	return value;
}
