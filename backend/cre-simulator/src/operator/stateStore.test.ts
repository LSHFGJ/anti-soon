import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION,
  assertDemoOperatorStateBindingStable,
  assertDemoOperatorStateStoreHealthy,
  claimDurableDemoOperatorStage,
  loadDemoOperatorStateStore,
  markDurableDemoOperatorStageCompleted,
  readDemoOperatorStateStoreFile,
} from "./stateStore"

function withTempStateFile(run: (stateFilePath: string) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "demo-operator-state-store-"))

  try {
    run(join(tempDir, "state.json"))
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

describe("demo operator state store", () => {
  it("persists durable stage progress and stable scenario binding", () => {
    withTempStateFile((stateFilePath) => {
      const store = loadDemoOperatorStateStore(stateFilePath, 100)

      assertDemoOperatorStateBindingStable(
        store,
        {
          scenarioId: "multi-fast-happy-path",
					scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
          evidenceDir: "/repo/.sisyphus/evidence/demo-run",
        },
        101,
      )

      const decision = claimDurableDemoOperatorStage(store, "register", 102)
      expect(decision).toEqual({ shouldProcess: true, reason: "claimed" })

      markDurableDemoOperatorStageCompleted(store, "register", 103)

      const reloadedStore = loadDemoOperatorStateStore(stateFilePath, 200)
      assertDemoOperatorStateStoreHealthy(reloadedStore)

      const persisted = readDemoOperatorStateStoreFile(stateFilePath)
      expect(persisted.schemaVersion).toBe(DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION)
      expect(persisted.binding).toEqual({
        scenarioId: "multi-fast-happy-path",
				scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
        evidenceDir: "/repo/.sisyphus/evidence/demo-run",
      })
      expect(persisted.stageStateByName.register.status).toBe("completed")
      expect(persisted.stageStateByName.submit.status).toBe("pending")
      expect(reloadedStore.stageStateByName.get("register")?.status).toBe("completed")
      expect(reloadedStore.recoveredProcessingCount).toBe(0)
      expect(reloadedStore.quarantinedStageCount).toBe(0)
    })
  })

  it("recovers in-flight stage state to quarantined and fails closed", () => {
    withTempStateFile((stateFilePath) => {
      const store = loadDemoOperatorStateStore(stateFilePath, 300)

      assertDemoOperatorStateBindingStable(
        store,
        {
          scenarioId: "multi-fast-happy-path",
					scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
          evidenceDir: "/repo/.sisyphus/evidence/demo-run",
        },
        301,
      )

      expect(claimDurableDemoOperatorStage(store, "submit", 302)).toEqual({
        shouldProcess: true,
        reason: "claimed",
      })

      const recoveredStore = loadDemoOperatorStateStore(stateFilePath, 400)
      const recoveredStage = recoveredStore.stageStateByName.get("submit")

      expect(recoveredStore.recoveredProcessingCount).toBe(1)
      expect(recoveredStore.quarantinedStageCount).toBe(1)
      expect(recoveredStage?.status).toBe("quarantined")
      expect(recoveredStage?.lastError).toContain("Recovered in-flight stage")
      expect(() => assertDemoOperatorStateStoreHealthy(recoveredStore)).toThrow(
        "Recovered 1 in-flight stage(s) to quarantined state; fail closed until operator intervention",
      )
    })
  })

  it("rejects corrupted state schema", () => {
    withTempStateFile((stateFilePath) => {
      writeFileSync(
        stateFilePath,
        `${JSON.stringify(
          {
            schemaVersion: "anti-soon.demo-operator.state-store.v0",
            binding: null,
            stageStateByName: {},
          },
          null,
          2,
        )}\n`,
        "utf8",
      )

      expect(() => loadDemoOperatorStateStore(stateFilePath, 500)).toThrow(
        "Unsupported demo-operator state store schema: anti-soon.demo-operator.state-store.v0",
      )
    })
  })
})
