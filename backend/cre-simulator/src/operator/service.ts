import type { DemoOperatorConfig, DemoOperatorCommand, EnvRecord } from "./config"
import { loadDemoOperatorConfig } from "./config"
import {
	assertDemoOperatorStateBindingStable,
	assertDemoOperatorStateStoreHealthy,
	listDemoOperatorStageStates,
	loadDemoOperatorStateStore,
} from "./stateStore"
import {
	registerAndBootstrap,
	type RegisterAndBootstrapDependencies,
} from "./stages/registerAndBootstrap"
import { runRevealStage, type RevealStageDependencies } from "./stages/reveal"
import {
	submitAndCommit,
	type SubmitAndCommitDependencies,
} from "./stages/submitAndCommit"
import { runVerifyStage, type VerifyStageDependencies } from "./stages/verify"

export type DemoOperatorServiceRequest = {
	command: DemoOperatorCommand
	scenario: string
	stateFile?: string
	evidenceDir?: string
}

export type DemoOperatorStatusPayload = {
	command: "status"
	healthy: boolean
	scenarioId: string
	scenarioPath: string
	stateFilePath: string
	evidenceDir: string
	recoveredProcessingCount: number
	quarantinedStageCount: number
	stageStates: ReturnType<typeof listDemoOperatorStageStates>
}

export type DemoOperatorRunPayload = {
	command: "run"
	stages: {
		register: unknown
		submit: unknown
		reveal: unknown
		verify: unknown
	}
	finalStatus: DemoOperatorStatusPayload
}

export type DemoOperatorServiceDependencies = {
	register?: {
		runRegister?: (args: {
			config: DemoOperatorConfig
			env: EnvRecord
			deps?: RegisterAndBootstrapDependencies
		}) => Promise<unknown>
		deps?: RegisterAndBootstrapDependencies
	}
	submit?: {
		runSubmit?: (args: {
			config: DemoOperatorConfig
			env: EnvRecord
			deps?: SubmitAndCommitDependencies
		}) => Promise<unknown>
		deps?: SubmitAndCommitDependencies
	}
	reveal?: {
		runReveal?: (args: {
			config: DemoOperatorConfig
			env: EnvRecord
			deps?: RevealStageDependencies
		}) => Promise<unknown>
		deps?: RevealStageDependencies
	}
	verify?: {
		runVerify?: (args: {
			config: DemoOperatorConfig
			env: EnvRecord
			deps?: VerifyStageDependencies
		}) => Promise<unknown>
		deps?: VerifyStageDependencies
	}
}

function buildStateBinding(config: DemoOperatorConfig) {
	return {
		scenarioId: config.scenario.scenarioId,
		scenarioPath: config.scenarioPath,
		evidenceDir: config.evidenceDir,
	}
}

export function loadDemoOperatorServiceConfig(
	request: DemoOperatorServiceRequest,
	env: EnvRecord,
	cwd: string,
): DemoOperatorConfig {
	return loadDemoOperatorConfig(
		env,
		{
			help: false,
			command: request.command,
			scenario: request.scenario,
			stateFile: request.stateFile,
			evidenceDir: request.evidenceDir,
		},
		cwd,
	)
}

export function buildDemoOperatorStatusPayload(
	config: DemoOperatorConfig,
): DemoOperatorStatusPayload {
	const store = loadDemoOperatorStateStore(config.stateFilePath)
	assertDemoOperatorStateBindingStable(store, buildStateBinding(config))

	return {
		command: "status",
		healthy: store.recoveredProcessingCount === 0 && store.quarantinedStageCount === 0,
		scenarioId: config.scenario.scenarioId,
		scenarioPath: config.scenarioPath,
		stateFilePath: config.stateFilePath,
		evidenceDir: config.evidenceDir,
		recoveredProcessingCount: store.recoveredProcessingCount,
		quarantinedStageCount: store.quarantinedStageCount,
		stageStates: listDemoOperatorStageStates(store),
	}
}

function assertHealthyBoundStore(config: DemoOperatorConfig): void {
	const store = loadDemoOperatorStateStore(config.stateFilePath)
	assertDemoOperatorStateBindingStable(store, buildStateBinding(config))
	assertDemoOperatorStateStoreHealthy(store)
}

async function runRegisterStage(args: {
	config: DemoOperatorConfig
	env: EnvRecord
	deps?: DemoOperatorServiceDependencies
}): Promise<unknown> {
	const runRegister = args.deps?.register?.runRegister ?? registerAndBootstrap
	return await runRegister({
		config: args.config,
		env: args.env,
		deps: args.deps?.register?.deps,
	})
}

async function runSubmitStage(args: {
	config: DemoOperatorConfig
	env: EnvRecord
	deps?: DemoOperatorServiceDependencies
}): Promise<unknown> {
	const runSubmit = args.deps?.submit?.runSubmit ?? submitAndCommit
	return await runSubmit({
		config: args.config,
		env: args.env,
		deps: args.deps?.submit?.deps,
	})
}

async function runRevealStageFromService(args: {
	config: DemoOperatorConfig
	env: EnvRecord
	deps?: DemoOperatorServiceDependencies
}): Promise<unknown> {
	const runReveal = args.deps?.reveal?.runReveal ?? runRevealStage
	return await runReveal({
		config: args.config,
		env: args.env,
		deps: args.deps?.reveal?.deps,
	})
}

async function runVerifyStageFromService(args: {
	config: DemoOperatorConfig
	env: EnvRecord
	deps?: DemoOperatorServiceDependencies
}): Promise<unknown> {
	const runVerify = args.deps?.verify?.runVerify ?? runVerifyStage
	return await runVerify({
		config: args.config,
		env: args.env,
		deps: args.deps?.verify?.deps,
	})
}

export async function executeDemoOperatorService(args: {
	config: DemoOperatorConfig
	env: EnvRecord
	deps?: DemoOperatorServiceDependencies
}): Promise<unknown> {
	if (args.config.command === "status") {
		return buildDemoOperatorStatusPayload(args.config)
	}

	if (args.config.command === "register") {
		return await runRegisterStage(args)
	}

	if (args.config.command === "submit") {
		return await runSubmitStage(args)
	}

	if (args.config.command === "reveal") {
		return await runRevealStageFromService(args)
	}

	if (args.config.command === "verify") {
		return await runVerifyStageFromService(args)
	}

	if (args.config.command === "run") {
		const register = await runRegisterStage(args)
		const submit = await runSubmitStage(args)
		const reveal = await runRevealStageFromService(args)
		const verify = await runVerifyStageFromService(args)

		return {
			command: "run",
			stages: {
				register,
				submit,
				reveal,
				verify,
			},
			finalStatus: buildDemoOperatorStatusPayload(args.config),
		} satisfies DemoOperatorRunPayload
	}

	assertHealthyBoundStore(args.config)
	throw new Error(
		`Subcommand ${args.config.command} is scaffolded but not implemented yet`,
	)
}
