import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadScenarioFromFile, SCENARIO_SCHEMA_VERSION } from "./scenario"

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url))
const checkedInScenarioPath = resolve(
  repoRoot,
  "backend/cre-simulator/default-scenario.json",
)

function buildValidScenarioRecord(): Record<string, unknown> {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    scenarioId: "multi-fast-happy-path",
    description:
      "Deterministic MULTI operator demo that reaches Finalized with payout evidence.",
    project: {
      repoUrl: "demo-projects/dummy-vault",
      targetContract: "0x3333333333333333333333333333333333333333",
      bountyPoolWei: "10000000000000000000",
      maxPayoutPerBugWei: "1000000000000000000",
      forkBlock: 6500000,
      mode: "MULTI",
      timing: {
        commitDeadlineSeconds: 300,
        revealDeadlineSeconds: 900,
        disputeWindowSeconds: 0,
      },
      rules: {
        maxAttackerSeedWei: "100000000000000000000",
        maxWarpSeconds: 3600,
        allowImpersonation: true,
        severityThresholds: {
          criticalDrainWei: "10000000000000000000",
          highDrainWei: "5000000000000000000",
          mediumDrainWei: "1000000000000000000",
          lowDrainWei: "100000000000000000",
        },
      },
    },
    pocFixture: {
      sourcePath: "frontend/src/config.ts",
      exportName: "DUMMYVAULT_POC_TEMPLATES",
      templateKey: "reentrancy",
      normalizer: "frontend-dummyvault-template-to-verify-poc-v1",
    },
    identities: {
      projectOwner: {
        kind: "env",
        addressEnvVar: "DEMO_PROJECT_OWNER_ADDRESS",
        privateKeyEnvVar: "DEMO_PROJECT_OWNER_PRIVATE_KEY",
      },
      auditor: {
        kind: "env",
        addressEnvVar: "DEMO_AUDITOR_ADDRESS",
        privateKeyEnvVar: "DEMO_AUDITOR_PRIVATE_KEY",
      },
      operator: {
        kind: "env",
        addressEnvVar: "DEMO_OPERATOR_ADDRESS",
        privateKeyEnvVar: "DEMO_OPERATOR_PRIVATE_KEY",
      },
    },
    commandDefaults: {
      creTarget: "staging-settings",
      nonInteractive: true,
      broadcast: true,
      register: {
        workflowPath: "workflow/vnet-init",
      },
      reveal: {
        cursorFilePath: "workflow/auto-reveal-relayer/.auto-reveal-cursor.json",
        lookbackBlocks: 5000,
        replayOverlapBlocks: 12,
        logChunkBlocks: 5000,
        maxExecutionBatchSize: 25,
      },
      verify: {
        workflowPath: "workflow/verify-poc",
        triggerEvent: "PoCRevealed",
        triggerIndex: 0,
      },
    },
    stateFilePath: "backend/cre-simulator/.demo-operator-state.json",
    evidenceDir: ".sisyphus/evidence/demo-run",
    terminalAssertions: {
      submissionStatus: "Finalized",
      payoutEvent: "BountyPaid",
      finalizedEvent: "BountyFinalized",
      auditorStatsPaidCountDeltaAtLeast: 1,
      auditorStatsTotalPaidWeiGreaterThan: "0",
    },
  }
}

function withTempScenarioFile(
  payload: Record<string, unknown>,
  run: (scenarioPath: string) => void,
): void {
  const tempDir = mkdtempSync(join(tmpdir(), "demo-operator-scenario-"))

  try {
    const scenarioPath = join(tempDir, "scenario.json")
    writeFileSync(scenarioPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
    run(scenarioPath)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

describe("demo operator scenario contract", () => {
  it("loads multi-fast happy path", () => {
    const scenario = loadScenarioFromFile(checkedInScenarioPath, { repoRoot })

    expect(scenario.schemaVersion).toBe(SCENARIO_SCHEMA_VERSION)
    expect(scenario.scenarioId).toBe("multi-fast-happy-path")
    expect(scenario.project.mode).toBe("MULTI")
    expect(scenario.project.timing.disputeWindowSeconds).toBe(0)
    expect(scenario.pocFixture.sourcePath).toBe("frontend/src/config.ts")
    expect(scenario.pocFixture.exportName).toBe("DUMMYVAULT_POC_TEMPLATES")
    expect(scenario.pocFixture.templateKey).toBe("reentrancy")
    expect(scenario.commandDefaults.verify.triggerEvent).toBe("PoCRevealed")
    expect(scenario.stateFilePath).toBe(
      "backend/cre-simulator/.demo-operator-state.json",
    )
    expect(scenario.evidenceDir).toBe(".sisyphus/evidence/demo-run")
    expect(scenario.terminalAssertions.submissionStatus).toBe("Finalized")
    expect(scenario.terminalAssertions.payoutEvent).toBe("BountyPaid")
    expect(scenario.terminalAssertions.finalizedEvent).toBe("BountyFinalized")
  })

  it("rejects missing fixture path or nonzero dispute window", () => {
    withTempScenarioFile(
      {
        ...buildValidScenarioRecord(),
        project: {
          ...(buildValidScenarioRecord().project as Record<string, unknown>),
          timing: {
            ...((buildValidScenarioRecord().project as Record<string, unknown>)
              .timing as Record<string, unknown>),
            disputeWindowSeconds: 60,
          },
        },
      },
      (scenarioPath) => {
        expect(() => loadScenarioFromFile(scenarioPath, { repoRoot })).toThrow(
          "project.timing.disputeWindowSeconds must be 0",
        )
      },
    )

    withTempScenarioFile(
      {
        ...buildValidScenarioRecord(),
        pocFixture: {
          ...((buildValidScenarioRecord().pocFixture as Record<string, unknown>)),
				sourcePath: "backend/missing-poc.json",
        },
      },
      (scenarioPath) => {
        expect(() => loadScenarioFromFile(scenarioPath, { repoRoot })).toThrow(
          "pocFixture.sourcePath must reference an existing checked-in file",
        )
      },
    )
  })

  it("rejects non-MULTI mode", () => {
    withTempScenarioFile(
      {
        ...buildValidScenarioRecord(),
        project: {
          ...(buildValidScenarioRecord().project as Record<string, unknown>),
          mode: "UNIQUE",
        },
      },
      (scenarioPath) => {
        expect(() => loadScenarioFromFile(scenarioPath, { repoRoot })).toThrow(
          "project.mode must be MULTI",
        )
      },
    )
  })

  it("rejects unsafe fixture references outside the repo", () => {
    withTempScenarioFile(
      {
        ...buildValidScenarioRecord(),
        pocFixture: {
          ...((buildValidScenarioRecord().pocFixture as Record<string, unknown>)),
          sourcePath: "../frontend/src/config.ts",
        },
      },
      (scenarioPath) => {
        expect(() => loadScenarioFromFile(scenarioPath, { repoRoot })).toThrow(
          "pocFixture.sourcePath must be a safe repo-relative path",
        )
      },
    )
  })
})
