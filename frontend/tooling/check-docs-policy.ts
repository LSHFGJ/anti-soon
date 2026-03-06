import { access, readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertDocsReadmeContract,
	assertDocsSourceContract,
	assertDocsV1Scope,
	DOCS_SOURCE_CONTRACT,
	DOCS_V1_SCOPE,
} from "../src/lib/docsPolicy";

const REQUIRED_GITIGNORE_LINES = ["*.md", "!README.md", "docs/"] as const;
const REQUIRED_AGENTS_RULE =
	"Do NOT commit any `.md` files except `README.md`.";

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function collectFiles(rootPath: string): Promise<string[]> {
	const entries = await readdir(rootPath, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const entryPath = resolve(rootPath, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await collectFiles(entryPath)));
			continue;
		}

		if (entry.isFile()) {
			files.push(entryPath);
		}
	}

	return files;
}

async function resolveAgentsPolicyFile(repoRoot: string): Promise<string | null> {
	const candidates = [
		resolve(repoRoot, "AGENTS.md"),
		resolve(repoRoot, "..", "anti-soon", "AGENTS.md"),
	];

	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	return null;
}

async function run(): Promise<void> {
	const scriptDirectory = dirname(fileURLToPath(import.meta.url));
	const frontendRoot = resolve(scriptDirectory, "..");
	const repoRoot = resolve(frontendRoot, "..");
	const gitignorePath = resolve(repoRoot, ".gitignore");
	const readmePath = resolve(repoRoot, "README.md");
	const docsSourceRoot = resolve(frontendRoot, DOCS_SOURCE_CONTRACT.canonicalSourceRoot);
	const agentsPath = await resolveAgentsPolicyFile(repoRoot);
	const violations: string[] = [];

	assertDocsV1Scope(DOCS_V1_SCOPE);

	const gitignoreContent = await readFile(gitignorePath, "utf8");
	const readmeContent = await readFile(readmePath, "utf8");
	const gitignoreLines = new Set(gitignoreContent.split(/\r?\n/));

	for (const requiredLine of REQUIRED_GITIGNORE_LINES) {
		if (!gitignoreLines.has(requiredLine)) {
			violations.push(
				`Missing required markdown policy line in .gitignore: "${requiredLine}"`,
			);
		}
	}

	if (agentsPath) {
		const agentsContent = await readFile(agentsPath, "utf8");

		if (!agentsContent.includes(REQUIRED_AGENTS_RULE)) {
			violations.push(
				`AGENTS policy file does not preserve the markdown commit rule: "${agentsPath}"`,
			);
		}
	}

	const sourcePaths = (await pathExists(docsSourceRoot))
		? (await collectFiles(docsSourceRoot)).map((path) => relative(frontendRoot, path))
		: [];

	try {
		assertDocsReadmeContract(readmeContent);
	} catch (error) {
		violations.push(
			...(error instanceof Error ? error.message.split("\n") : [String(error)]),
		);
	}

	try {
		assertDocsSourceContract(sourcePaths);
	} catch (error) {
		violations.push(
			...(error instanceof Error ? error.message.split("\n") : [String(error)]),
		);
	}

	if (violations.length > 0) {
		throw new Error(violations.join("\n"));
	}

	console.log(
		`docs:policy OK - locked ${DOCS_V1_SCOPE.routeBasePath} to offline English-only docs and validated ${DOCS_SOURCE_CONTRACT.canonicalSourceRoot}`,
	);
	if (agentsPath) {
		console.log(`docs:policy AGENTS source: ${relative(repoRoot, agentsPath)}`);
	} else {
		console.log("docs:policy AGENTS source: skipped (local-only file absent in this checkout)");
	}
	console.log(`docs:policy .gitignore source: ${relative(repoRoot, gitignorePath)}`);
}

void run();
