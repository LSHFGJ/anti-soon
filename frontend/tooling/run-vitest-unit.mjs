import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const vitestBinary = resolve(frontendRoot, "node_modules", ".bin", "vitest");

function normalizeForwardedArgs(args) {
	const normalizedArgs = [];

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];

		if (argument === "--runInBand") {
			continue;
		}

		if (argument === "--grep") {
			const pattern = args[index + 1];
			if (pattern) {
				normalizedArgs.push("-t", pattern);
				index += 1;
			}
			continue;
		}

		if (argument.startsWith("--grep=")) {
			normalizedArgs.push("-t", argument.slice("--grep=".length));
			continue;
		}

		normalizedArgs.push(argument);
	}

	return normalizedArgs;
}

const forwardedArgs = normalizeForwardedArgs(process.argv.slice(2));
const vitestArgs = forwardedArgs.includes("--run")
	? forwardedArgs
	: ["--run", ...forwardedArgs];

const result = spawnSync(vitestBinary, vitestArgs, {
	cwd: frontendRoot,
	stdio: "inherit",
	env: process.env,
});

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 1);
