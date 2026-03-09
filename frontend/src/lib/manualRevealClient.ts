const MANUAL_REVEAL_TRIGGER_PATH = "/api/cre-simulator/triggers/manual-reveal";

type RuntimeEnv = Record<string, string | undefined>;

export interface ManualRevealTriggerResponse {
	ok: true;
	triggerName: string;
	executionKey?: string;
	result?: {
		result?: {
			executedCount?: number;
		};
	};
}

function getManualRevealApiBaseUrl(env?: RuntimeEnv): string | undefined {
	const globalRuntimeUrl = (
		globalThis as { __ANTI_SOON_CRE_SIM_API_URL__?: string }
	).__ANTI_SOON_CRE_SIM_API_URL__;
	if (
		typeof globalRuntimeUrl === "string" &&
		globalRuntimeUrl.trim().length > 0
	) {
		return globalRuntimeUrl.trim().replace(/\/$/, "");
	}

	const runtimeEnv =
		env ??
		(import.meta as ImportMeta & { env?: RuntimeEnv }).env ??
		(import.meta.env as RuntimeEnv);
	const processEnv =
		typeof process !== "undefined"
			? (process.env as RuntimeEnv | undefined)
			: undefined;
	const configuredUrl = runtimeEnv.VITE_CRE_SIM_API_URL?.trim();
	const fallbackProcessUrl = processEnv?.VITE_CRE_SIM_API_URL?.trim();
	if (!configuredUrl && !fallbackProcessUrl) {
		return undefined;
	}

	return (configuredUrl ?? fallbackProcessUrl ?? "").replace(/\/$/, "");
}

export function resolveManualRevealTriggerUrl(env?: RuntimeEnv): string {
	const baseUrl = getManualRevealApiBaseUrl(env);
	return baseUrl
		? `${baseUrl}${MANUAL_REVEAL_TRIGGER_PATH}`
		: MANUAL_REVEAL_TRIGGER_PATH;
}

function isManualRevealTriggerResponse(
	value: unknown,
): value is ManualRevealTriggerResponse {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	return candidate.ok === true && typeof candidate.triggerName === "string";
}

export async function submitManualRevealTrigger(
	fetchImpl: typeof globalThis.fetch = globalThis.fetch,
	env?: RuntimeEnv,
): Promise<ManualRevealTriggerResponse> {
	const response = await fetchImpl(resolveManualRevealTriggerUrl(env), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});

	const parsed = (await response.json().catch(async () => ({
		ok: false,
		error: await response.text().catch(() => "Unknown manual-reveal response"),
	}))) as unknown;

	if (!response.ok) {
		const message =
			typeof parsed === "object" &&
			parsed !== null &&
			"error" in parsed &&
			typeof parsed.error === "string"
				? parsed.error
				: `Manual reveal trigger failed with status ${response.status}`;
		throw new Error(message);
	}

	if (!isManualRevealTriggerResponse(parsed)) {
		throw new Error(
			"Manual reveal trigger returned an unexpected response shape",
		);
	}

	return parsed;
}
