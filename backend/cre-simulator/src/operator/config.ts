import { existsSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { type DemoOperatorScenario, loadScenarioFromFile } from "./scenario"

export const DEMO_OPERATOR_SUBCOMMANDS = [
  "register",
  "submit",
  "reveal",
  "verify",
  "run",
  "status",
] as const

export type DemoOperatorCommand = (typeof DEMO_OPERATOR_SUBCOMMANDS)[number]

export type EnvRecord = Record<string, string | undefined>

export type DemoOperatorCliArgs = {
  help: boolean
  command?: DemoOperatorCommand
  scenario?: string
  stateFile?: string
  evidenceDir?: string
}

export type DemoOperatorConfig = {
  command: DemoOperatorCommand
  repoRoot: string
  cwd: string
  scenarioPath: string
  stateFilePath: string
  evidenceDir: string
  scenario: DemoOperatorScenario
}

const HELP_TEXT_LINES = [
  "Usage: bun ./src/operator-cli.ts <command> [options]",
  "",
  "Run-once operator scaffold for the async CRE simulate demo service.",
  "This command is deterministic and fail-closed on missing required flags or corrupted local state.",
  "",
  "Commands:",
  "  register                        Register the demo project and bootstrap VNet",
  "  submit                          Submit and commit the demo PoC",
  "  reveal                          Run the auto-reveal stage scaffold",
  "  verify                          Run the verify stage scaffold",
  "  run                             Execute the full demo operator flow scaffold",
  "  status                          Print the durable operator state",
  "",
  "Options:",
  "  --help                          Show this help message",
  "  --scenario <path>               Required scenario file path",
  "  --state-file <path>             Override durable state file path",
  "  --evidence-dir <path>           Override evidence directory path",
].join("\n")

export const DEMO_OPERATOR_HELP_TEXT = HELP_TEXT_LINES

function readFlagValue(argv: string[], index: number, flagName: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flagName}`)
  }

  return value
}

function parseCommand(value: string): DemoOperatorCommand {
  if ((DEMO_OPERATOR_SUBCOMMANDS as readonly string[]).includes(value)) {
    return value as DemoOperatorCommand
  }

  throw new Error(`Unknown subcommand: ${value}`)
}

function resolveRequiredPath(rawValue: string | undefined, label: string): string {
  if (!rawValue || rawValue.trim().length === 0) {
    throw new Error(`${label} must be a non-empty path`)
  }
  if (rawValue.includes("\0")) {
    throw new Error(`${label} must not contain NUL bytes`)
  }

  return rawValue
}

function findRepoRoot(startPath: string): string {
  let current = resolve(startPath)

  while (true) {
    const projectYamlPath = resolve(current, "project.yaml")
    if (existsSync(projectYamlPath) && statSync(projectYamlPath).isFile()) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) {
      throw new Error("Unable to locate repo root from scenario path")
    }

    current = parent
  }
}

export function parseDemoOperatorCliArgs(argv: string[]): DemoOperatorCliArgs {
  const parsed: DemoOperatorCliArgs = {
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === "--help" || token === "-h") {
      parsed.help = true
      continue
    }

    if (token === "--scenario") {
      parsed.scenario = readFlagValue(argv, index, token)
      index += 1
      continue
    }

    if (token === "--state-file") {
      parsed.stateFile = readFlagValue(argv, index, token)
      index += 1
      continue
    }

    if (token === "--evidence-dir") {
      parsed.evidenceDir = readFlagValue(argv, index, token)
      index += 1
      continue
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`)
    }

    if (parsed.command) {
      throw new Error(`Unexpected argument: ${token}`)
    }

    parsed.command = parseCommand(token)
  }

  return parsed
}

export function getDefaultArgv(): string[] {
  const runtime = globalThis as {
    process?: {
      argv?: string[]
    }
  }

  return runtime.process?.argv?.slice(2) ?? []
}

export function getDefaultCwd(): string {
  const runtime = globalThis as {
    process?: {
      cwd?: () => string
    }
  }

  return runtime.process?.cwd?.() ?? "."
}

export function loadDemoOperatorConfig(
  _env: EnvRecord,
  cliArgs: DemoOperatorCliArgs,
  cwd: string = getDefaultCwd(),
): DemoOperatorConfig {
  if (!cliArgs.command) {
    throw new Error(
      "Missing subcommand; expected one of: register, submit, reveal, verify, run, status",
    )
  }

  const scenarioInput = resolveRequiredPath(cliArgs.scenario, "--scenario")
  const scenarioPath = resolve(cwd, scenarioInput)
  if (!existsSync(scenarioPath) || !statSync(scenarioPath).isFile()) {
    throw new Error(`Scenario file does not exist: ${scenarioPath}`)
  }

  const repoRoot = findRepoRoot(dirname(scenarioPath))
  const scenario = loadScenarioFromFile(scenarioPath, { repoRoot })

  const stateFilePath = cliArgs.stateFile
    ? resolve(cwd, resolveRequiredPath(cliArgs.stateFile, "--state-file"))
    : resolve(repoRoot, scenario.stateFilePath)

  const evidenceDir = cliArgs.evidenceDir
    ? resolve(cwd, resolveRequiredPath(cliArgs.evidenceDir, "--evidence-dir"))
    : resolve(repoRoot, scenario.evidenceDir)

  return {
    command: cliArgs.command,
    repoRoot,
    cwd,
    scenarioPath,
    stateFilePath,
    evidenceDir,
    scenario,
  }
}
