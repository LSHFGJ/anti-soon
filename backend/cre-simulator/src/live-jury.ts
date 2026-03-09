import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type {
	JuryOrchestratorRunOnceAdapterConfig,
	JuryOrchestratorRunOnceInputPayload,
} from "./adapter-types";
import type { EnvRecord } from "./env";

const DEFAULT_JURY_EVIDENCE_DIR =
	".sisyphus/evidence/jury-orchestrator-run-once";

type JuryCommandSpec = {
	command: string;
	args: string[];
	cwd: string;
	env: Record<string, string | undefined>;
};

type JuryCommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type JuryOrchestratorRunOnceSummary = {
	caseReportType: string;
	aggregationReportType: string;
	finalReportType: string;
	encodedContractReport?: `0x${string}`;
	submissionTxHash?: `0x${string}`;
};

export type JuryOrchestratorRunOnceResult = {
	mode: "jury-orchestrator-run-once";
	configPath: string;
	outputPath: string;
	resultPath: string;
	verifiedReportPath: string;
	humanOpinionsPath: string;
	simulateCommand: string[];
	summary: JuryOrchestratorRunOnceSummary;
};

type ExecuteJuryOrchestratorRunOnceArgs = {
	repoRoot: string;
	env: EnvRecord;
	adapterConfig: JuryOrchestratorRunOnceAdapterConfig;
	inputPayload?: JuryOrchestratorRunOnceInputPayload;
	evidenceDir?: string;
	runCommand?: (spec: JuryCommandSpec) => Promise<JuryCommandResult>;
};

function ensureParentDirectory(filePath: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
}

function normalizeRelativePath(value: string, label: string): string {
	if (!value.trim()) {
		throw new Error(`${label} is required`);
	}
	if (value.startsWith("/") || value.includes("..")) {
		throw new Error(`${label} must stay within repoRoot`);
	}
	return value;
}

function normalizeInputPayload(
	value: JuryOrchestratorRunOnceInputPayload | undefined,
): JuryOrchestratorRunOnceInputPayload {
	if (!value || typeof value !== "object") {
		throw new Error("jury-orchestrator-run-once requires inputPayload");
	}
	if (!("verifiedReport" in value)) {
		throw new Error(
			"jury-orchestrator-run-once requires inputPayload.verifiedReport",
		);
	}
	if (!("humanOpinions" in value) || !Array.isArray(value.humanOpinions)) {
		throw new Error(
			"jury-orchestrator-run-once requires inputPayload.humanOpinions array",
		);
	}
	return value;
}

function buildRunId(inputPayload: JuryOrchestratorRunOnceInputPayload): string {
	const verifiedReport =
		typeof inputPayload.verifiedReport === "object" &&
		inputPayload.verifiedReport !== null
			? (inputPayload.verifiedReport as Record<string, unknown>)
			: undefined;
	const payload =
		verifiedReport &&
		typeof verifiedReport.payload === "object" &&
		verifiedReport.payload !== null
			? (verifiedReport.payload as Record<string, unknown>)
			: undefined;
	const submissionId =
		typeof payload?.submissionId === "string"
			? payload.submissionId
			: "submission";
	const juryRoundId =
		inputPayload.juryRoundId === undefined
			? "1"
			: String(inputPayload.juryRoundId);
	return `submission-${submissionId}-jury-${juryRoundId}`.replace(
		/[^a-zA-Z0-9_-]+/g,
		"-",
	);
}

function buildJuryCommand(args: {
	repoRoot: string;
	configPath: string;
	verifiedReportPath: string;
	humanOpinionsPath: string;
	juryRoundId: string;
	env: EnvRecord;
}): JuryCommandSpec {
	return {
		command: "bun",
		args: [
			"workflow/jury-orchestrator/run-once.ts",
			"--config",
			args.configPath,
			"--verified-report",
			args.verifiedReportPath,
			"--human-opinions",
			args.humanOpinionsPath,
			"--jury-round-id",
			args.juryRoundId,
		],
		cwd: args.repoRoot,
		env: {
			...args.env,
		},
	};
}

async function runLocalCommand(
	spec: JuryCommandSpec,
): Promise<JuryCommandResult> {
	return await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(spec.command, spec.args, {
			cwd: spec.cwd,
			env: {
				...(process.env as Record<string, string | undefined>),
				...spec.env,
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (error) => {
			rejectPromise(
				new Error(`Failed to execute ${spec.command}: ${error.message}`),
			);
		});
		child.on("close", (code) => {
			resolvePromise({ exitCode: code ?? 1, stdout, stderr });
		});
	});
}

function parseSummary(stdout: string): JuryOrchestratorRunOnceSummary {
	const trimmed = stdout.trim();
	if (!trimmed) {
		throw new Error("jury-orchestrator-run-once produced no stdout summary");
	}
	return JSON.parse(trimmed) as JuryOrchestratorRunOnceSummary;
}

export async function executeJuryOrchestratorRunOnceAdapter(
	args: ExecuteJuryOrchestratorRunOnceArgs,
): Promise<JuryOrchestratorRunOnceResult> {
	const configPath = normalizeRelativePath(
		args.adapterConfig.configPath,
		"configPath",
	);
	const inputPayload = normalizeInputPayload(args.inputPayload);
	const juryRoundId =
		inputPayload.juryRoundId === undefined
			? "1"
			: String(inputPayload.juryRoundId);
	const evidenceDir = resolve(
		args.repoRoot,
		args.evidenceDir ?? DEFAULT_JURY_EVIDENCE_DIR,
	);
	const artifactDir = join(evidenceDir, buildRunId(inputPayload));
	const verifiedReportPath = join(artifactDir, "verified-report.json");
	const humanOpinionsPath = join(artifactDir, "human-opinions.json");
	const outputPath = join(artifactDir, "output.txt");
	const resultPath = join(artifactDir, "adapter-result.json");

	ensureParentDirectory(verifiedReportPath);
	writeFileSync(
		verifiedReportPath,
		`${JSON.stringify(inputPayload.verifiedReport, null, 2)}\n`,
		"utf8",
	);
	ensureParentDirectory(humanOpinionsPath);
	writeFileSync(
		humanOpinionsPath,
		`${JSON.stringify(inputPayload.humanOpinions, null, 2)}\n`,
		"utf8",
	);

	const commandSpec = buildJuryCommand({
		repoRoot: args.repoRoot,
		configPath,
		verifiedReportPath,
		humanOpinionsPath,
		juryRoundId,
		env: args.env,
	});
	const commandResult = await (args.runCommand ?? runLocalCommand)(commandSpec);
	if (commandResult.exitCode !== 0) {
		throw new Error(
			`jury-orchestrator run-once failed with exitCode=${commandResult.exitCode}: ${commandResult.stderr.trim() || commandResult.stdout.trim() || "no output"}`,
		);
	}
	const summary = parseSummary(commandResult.stdout);
	const result: JuryOrchestratorRunOnceResult = {
		mode: "jury-orchestrator-run-once",
		configPath,
		outputPath,
		resultPath,
		verifiedReportPath,
		humanOpinionsPath,
		simulateCommand: [commandSpec.command, ...commandSpec.args],
		summary,
	};

	ensureParentDirectory(outputPath);
	writeFileSync(
		outputPath,
		[
			`$ ${commandSpec.command} ${commandSpec.args.join(" ")}`,
			"",
			"STDOUT:",
			commandResult.stdout,
			"",
			"STDERR:",
			commandResult.stderr,
		].join("\n"),
		"utf8",
	);
	ensureParentDirectory(resultPath);
	writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
	return result;
}
