export type DocsV1Scope = {
	routeBasePath: string;
	routePrefixes: readonly string[];
	searchEnabled: boolean;
	versioningEnabled: boolean;
	locales: readonly string[];
	generationMode: "offline";
};

export type DocsSourceContract = {
	canonicalSourceRoot: string;
	canonicalManifestPath: string;
	allowedSourceExtensions: readonly string[];
	forbiddenMarkdownExtensions: readonly string[];
	searchArtifactNames: readonly string[];
	locales: readonly string[];
	readmeException: "README.md";
	generationMode: "offline";
};

export type DocsReadmeContract = {
	requiredHeading: string;
	requiredRouteBasePath: string;
	requiredGenerationPhrase: string;
	requiredReviewPhrase: string;
	requiredRolloutCommands: readonly string[];
	generationMode: "offline";
};

export const DOCS_V1_SCOPE = {
	routeBasePath: "/docs",
	routePrefixes: ["/docs"],
	searchEnabled: false,
	versioningEnabled: false,
	locales: ["en"],
	generationMode: "offline",
} as const satisfies DocsV1Scope;

export const DOCS_LANDING_PAGE_HREF = "/docs";

export const DOCS_SOURCE_CONTRACT = {
	canonicalSourceRoot: "src/reference/content",
	canonicalManifestPath: "src/reference/content/index.ts",
	allowedSourceExtensions: [".ts", ".json"],
	forbiddenMarkdownExtensions: [".md", ".mdx"],
	searchArtifactNames: ["search-index.json"],
	locales: ["en"],
	readmeException: "README.md",
	generationMode: "offline",
} as const satisfies DocsSourceContract;

export const DOCS_README_CONTRACT = {
	requiredHeading: "## Documentation",
	requiredRouteBasePath: "/docs",
	requiredGenerationPhrase: "offline writing model",
	requiredReviewPhrase: "human review",
	requiredRolloutCommands: [
		"cd frontend && bun run contracts:sync",
		"bun run contracts:check",
	],
	generationMode: "offline",
} as const satisfies DocsReadmeContract;

const VERSION_SEGMENT_PATTERN = /^v\d+$/i;
const LOCALE_SEGMENT_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const DOCS_CHILD_ROUTE_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizePath(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function includesCaseInsensitive(haystack: string, needle: string): boolean {
	return haystack.toLowerCase().includes(needle.toLowerCase());
}

function toSourceRelativePath(
	path: string,
	contract: DocsSourceContract,
): string | null {
	const normalizedPath = normalizePath(path);
	const normalizedRoot = normalizePath(contract.canonicalSourceRoot);

	if (normalizedPath === normalizedRoot) {
		return "";
	}

	if (!normalizedPath.startsWith(ensureTrailingSlash(normalizedRoot))) {
		return null;
	}

	return normalizedPath.slice(normalizedRoot.length + 1);
}

function hasAllowedSourceExtension(path: string, contract: DocsSourceContract): boolean {
	return contract.allowedSourceExtensions.some((extension) => path.endsWith(extension));
}

function hasForbiddenMarkdownExtension(
	path: string,
	contract: DocsSourceContract,
): boolean {
	return contract.forbiddenMarkdownExtensions.some((extension) => path.endsWith(extension));
}

export function collectDocsV1ScopeViolations(
	scope: DocsV1Scope,
): string[] {
	const violations: string[] = [];

	if (scope.routeBasePath !== "/docs") {
		violations.push(
			`Docs v1 must use a single "/docs" route base; received "${scope.routeBasePath}"`,
		);
	}

	if (scope.routePrefixes.length !== 1 || scope.routePrefixes[0] !== "/docs") {
		violations.push(
			"Docs v1 must expose exactly one route prefix: /docs",
		);
	}

	if (scope.searchEnabled) {
		violations.push("Docs v1 forbids search");
	}

	if (scope.versioningEnabled) {
		violations.push("Docs v1 forbids versioning");
	}

	if (scope.locales.length !== 1 || scope.locales[0] !== "en") {
		violations.push("Docs v1 is English-only and must declare exactly one locale: en");
	}

	if (scope.generationMode !== "offline") {
		violations.push("Docs v1 must use offline generation only");
	}

	return violations;
}

export function assertDocsV1Scope(scope: DocsV1Scope): void {
	const violations = collectDocsV1ScopeViolations(scope);

	if (violations.length > 0) {
		throw new Error(violations.join("\n"));
	}
}

export function collectDocsRoutePathViolations(
	path: string,
	scope: DocsV1Scope = DOCS_V1_SCOPE,
): string[] {
	if (path === DOCS_LANDING_PAGE_HREF) {
		return [];
	}

	if (!path.startsWith(`${scope.routeBasePath}/`)) {
		return [
			`Docs v1 routes must stay rooted at "${scope.routeBasePath}"; received "${path}"`,
		];
	}

	const childPath = path.slice(scope.routeBasePath.length + 1);
	if (!DOCS_CHILD_ROUTE_SEGMENT_PATTERN.test(childPath)) {
		return [
			`Docs v1 routes must be "${DOCS_LANDING_PAGE_HREF}" or a flat child route like "${scope.routeBasePath}/<slug>"; received "${path}"`,
		];
	}

	return [];
}

export function assertDocsRoutePath(
	path: string,
	scope: DocsV1Scope = DOCS_V1_SCOPE,
): void {
	const violations = collectDocsRoutePathViolations(path, scope);

	if (violations.length > 0) {
		throw new Error(violations.join("\n"));
	}
}

export function collectDocsSourceContractViolations(
	paths: readonly string[],
	contract: DocsSourceContract = DOCS_SOURCE_CONTRACT,
): string[] {
	const violations: string[] = [];

	for (const path of paths) {
		const sourceRelativePath = toSourceRelativePath(path, contract);

		if (sourceRelativePath === null || sourceRelativePath.length === 0) {
			continue;
		}

		const normalizedPath = normalizePath(path);
		const pathSegments = sourceRelativePath.split("/").filter(Boolean);
		const [firstSegment] = pathSegments;

		if (hasForbiddenMarkdownExtension(sourceRelativePath, contract)) {
			violations.push(
				`Canonical docs content must not use markdown sources: "${normalizedPath}"`,
			);
			continue;
		}

		if (!hasAllowedSourceExtension(sourceRelativePath, contract)) {
			violations.push(
				`Docs v1 only allows ${contract.allowedSourceExtensions.join(
					", ",
				)} source files: "${normalizedPath}"`,
			);
			continue;
		}

		if (
			contract.searchArtifactNames.some((artifactName) =>
				sourceRelativePath.endsWith(artifactName),
			)
		) {
			violations.push(
				`Docs v1 forbids search artifacts in committed source: "${normalizedPath}"`,
			);
		}

		if (pathSegments.some((segment) => VERSION_SEGMENT_PATTERN.test(segment))) {
			violations.push(
				`Docs v1 forbids versioned source trees: "${normalizedPath}"`,
			);
		}

		if (
			firstSegment &&
			LOCALE_SEGMENT_PATTERN.test(firstSegment) &&
			!contract.locales.includes(firstSegment)
		) {
			violations.push(
				`Docs v1 is English-only; found localized source path: "${normalizedPath}"`,
			);
		}
	}

	return violations;
}

export function assertDocsSourceContract(
	paths: readonly string[],
	contract: DocsSourceContract = DOCS_SOURCE_CONTRACT,
): void {
	const violations = collectDocsSourceContractViolations(paths, contract);

	if (violations.length > 0) {
		throw new Error(violations.join("\n"));
	}
}

export function collectDocsReadmeContractViolations(
	readmeContent: string,
	contract: DocsReadmeContract = DOCS_README_CONTRACT,
): string[] {
	const violations: string[] = [];

	if (!includesCaseInsensitive(readmeContent, contract.requiredHeading)) {
		violations.push(
			`Readme docs contract requires the heading "${contract.requiredHeading}".`,
		);
	}

	if (!readmeContent.includes(contract.requiredRouteBasePath)) {
		violations.push(
			`Readme docs contract must mention the docs route base "${contract.requiredRouteBasePath}".`,
		);
	}

	if (!includesCaseInsensitive(readmeContent, contract.requiredGenerationPhrase)) {
		violations.push(
			`Readme docs contract must mention the ${contract.requiredGenerationPhrase}.`,
		);
	}

	if (!includesCaseInsensitive(readmeContent, contract.requiredReviewPhrase)) {
		violations.push(
			"Readme docs contract must mention human review before publication.",
		);
	}

	for (const command of contract.requiredRolloutCommands) {
		if (!readmeContent.includes(command)) {
			violations.push(
				`Readme docs contract must include the rollout command "${command}".`,
			);
		}
	}

	return violations;
}

export function assertDocsReadmeContract(
	readmeContent: string,
	contract: DocsReadmeContract = DOCS_README_CONTRACT,
): void {
	const violations = collectDocsReadmeContractViolations(readmeContent, contract);

	if (violations.length > 0) {
		throw new Error(violations.join("\n"));
	}
}
