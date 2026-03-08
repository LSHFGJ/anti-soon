import { describe, expect, it } from "bun:test"

import { createCreSimulatorCronWorkerRunner } from "./cron-worker"

describe("cre-simulator cron worker", () => {
	it("skips overlapping ticks while a previous tick is still running", async () => {
		let started = 0
		let release: (() => void) | undefined
		const runner = createCreSimulatorCronWorkerRunner(async () => {
			started += 1
			await new Promise<void>((resolve) => {
				release = resolve
			})
		})

		const firstRun = runner.runTick()
		const secondRun = runner.runTick()

		expect(await secondRun).toBe("skipped")
		expect(started).toBe(1)

		release?.()
		expect(await firstRun).toBe("completed")
	})
})
