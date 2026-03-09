const MANUAL_JURY_TRIGGER_PATH = "/api/cre-simulator/triggers/manual-jury";

type RuntimeEnv = Record<string, string | undefined>;

export interface ManualJuryTriggerInputPayload {
	verifiedReport: unknown;
	humanOpinions: unknown[];
	juryRoundId?: number;
}

export interface ManualJuryTriggerResponse {
	ok: true;
	triggerName: string;
	executionKey?: string;
	result?: {
		result?: {
			finalReportType?: string;
		};
	};
}

function getManualJuryApiBaseUrl(env?: RuntimeEnv): string | undefined {
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

export function resolveManualJuryTriggerUrl(env?: RuntimeEnv): string {
	const baseUrl = getManualJuryApiBaseUrl(env);
	return baseUrl
		? `${baseUrl}${MANUAL_JURY_TRIGGER_PATH}`
		: MANUAL_JURY_TRIGGER_PATH;
}

function isManualJuryTriggerResponse(
	value: unknown,
): value is ManualJuryTriggerResponse {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	return candidate.ok === true && typeof candidate.triggerName === "string";
}

export async function submitManualJuryTrigger(
	inputPayload: ManualJuryTriggerInputPayload,
	fetchImpl: typeof globalThis.fetch = globalThis.fetch,
	env?: RuntimeEnv,
): Promise<ManualJuryTriggerResponse> {
	const response = await fetchImpl(resolveManualJuryTriggerUrl(env), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ inputPayload }),
	});

	const parsed = (await response.json().catch(async () => ({
		ok: false,
		error: await response.text().catch(() => "Unknown manual-jury response"),
	}))) as unknown;

	if (!response.ok) {
		const message =
			typeof parsed === "object" &&
			parsed !== null &&
			"error" in parsed &&
			typeof parsed.error === "string"
				? parsed.error
				: `Manual jury trigger failed with status ${response.status}`;
		throw new Error(message);
	}

	if (!isManualJuryTriggerResponse(parsed)) {
		throw new Error(
			"Manual jury trigger returned an unexpected response shape",
		);
	}

	return parsed;
}
