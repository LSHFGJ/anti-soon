import { describe, expect, it } from "bun:test"

import { getCreSimulatorModeRequiredEnv } from "./deploy-preflight"
import { parseCreSimulatorArgs } from "./index"

describe("cre-simulator index", () => {
	it("uses HOST and PORT env defaults when CLI flags are absent", () => {
		expect(
			parseCreSimulatorArgs([], { HOST: "0.0.0.0", PORT: "4321" }),
		).toEqual({ help: false, host: "0.0.0.0", port: 4321 })
	})

	it("prefers explicit CLI flags over environment defaults", () => {
		expect(
			parseCreSimulatorArgs(["--host", "127.0.0.2", "--port", "8788"], {
				HOST: "0.0.0.0",
				PORT: "4321",
			}),
		).toEqual({ help: false, host: "127.0.0.2", port: 8788 })
	})

	it("shares the base deployment env contract with other non-listener modes", () => {
		expect(getCreSimulatorModeRequiredEnv("http")).toEqual(
			getCreSimulatorModeRequiredEnv("cron"),
		)
	})
})
