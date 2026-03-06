import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const repoRoot = resolve(frontendRoot, "..");
const readmePath = resolve(repoRoot, "README.md");

const requiredMarkers = ["bun install", "bun run"];
const requiredRolloutCommands = [
  "cd frontend && bun run contracts:sync",
  "bun run contracts:check",
];
const forbiddenPatterns = [
  { label: "npm install", regex: /npm install/g },
  { label: "npm run", regex: /npm run/g },
  { label: "AGENTS.md", regex: /AGENTS\.md/g },
  { label: "local-only", regex: /local-only/gi },
  { label: "OMO_INTERNAL", regex: /OMO_INTERNAL/g },
];

async function main() {
  const readmeContent = await readFile(readmePath, "utf8");
  const violations = [];

  for (const marker of requiredMarkers) {
    if (!readmeContent.includes(marker)) {
      violations.push(`README missing bun-first marker: "${marker}"`);
    }
  }

  for (const command of requiredRolloutCommands) {
    if (!readmeContent.includes(command)) {
      violations.push(`README missing docs rollout command: "${command}"`);
    }
  }

  for (const { label, regex } of forbiddenPatterns) {
    const matches = readmeContent.match(regex) ?? [];
    for (const _match of matches) {
      violations.push(`README contains forbidden drift marker: "${label}"`);
    }
  }

  if (violations.length > 0) {
    throw new Error(violations.join("\n"));
  }

  console.log(
    `docs:readme-drift OK - README stays bun-first, preserves docs rollout commands, and excludes ${forbiddenPatterns
      .map(({ label }) => label)
      .join(", ")}.`,
  );
}

await main();
