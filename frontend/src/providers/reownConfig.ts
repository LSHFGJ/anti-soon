type RuntimeConfig = {
	__ANTI_SOON_REOWN_PROJECT_ID__?: string;
	__ANTI_SOON_PUBLIC_APP_URL__?: string;
};

type EnvConfig = Record<string, string | undefined>;

type OriginSource = {
	location?: { origin?: string };
	window?: { location?: { origin?: string } };
};

type WarnLogger = Pick<Console, "warn">;

const ENV =
	(import.meta as ImportMeta & { env?: Record<string, string | undefined> })
		.env ?? {};

const RUNTIME_CONFIG = globalThis as typeof globalThis & RuntimeConfig;

export const DEFAULT_REOWN_PROJECT_ID = "9bfcfddfcd5c1c5381b624d26565cfcf";
export const DEFAULT_APP_URL = "https://www.antisoon.com";

export function resolveReownProjectId(
	env: EnvConfig = ENV,
	runtimeConfig: RuntimeConfig = RUNTIME_CONFIG,
): string {
	const runtimeProjectId = runtimeConfig.__ANTI_SOON_REOWN_PROJECT_ID__?.trim();
	if (runtimeProjectId) {
		return runtimeProjectId;
	}

	const configuredProjectId = env.VITE_REOWN_PROJECT_ID?.trim();
	return configuredProjectId || DEFAULT_REOWN_PROJECT_ID;
}

export function resolveBrowserOrigin(
	originSource: OriginSource = globalThis as OriginSource,
): string | undefined {
	if (
		typeof originSource.location?.origin === "string" &&
		originSource.location.origin
	) {
		return originSource.location.origin;
	}

	const windowOrigin = originSource.window?.location?.origin;
	return typeof windowOrigin === "string" && windowOrigin
		? windowOrigin
		: undefined;
}

export function resolveConfiguredAppUrl(
	configuredAppUrl: string,
	browserOrigin: string | undefined,
	logger: WarnLogger = console,
): string {
	let configuredOrigin: string;

	try {
		configuredOrigin = new URL(configuredAppUrl).origin;
	} catch {
		if (browserOrigin) {
			logger.warn(
				`Invalid public app URL "${configuredAppUrl}" detected; using current browser origin ${browserOrigin} instead.`,
			);
			return browserOrigin;
		}

		return configuredAppUrl;
	}

	if (browserOrigin && configuredOrigin !== browserOrigin) {
		logger.warn(
			`VITE_PUBLIC_APP_URL origin does not match current browser origin; using ${browserOrigin} instead of ${configuredOrigin}.`,
		);
		return browserOrigin;
	}

	return configuredAppUrl;
}

export function resolveAppUrl(options?: {
	env?: EnvConfig;
	runtimeConfig?: RuntimeConfig;
	originSource?: OriginSource;
	logger?: WarnLogger;
}): string {
	const env = options?.env ?? ENV;
	const runtimeConfig = options?.runtimeConfig ?? RUNTIME_CONFIG;
	const originSource = options?.originSource ?? (globalThis as OriginSource);
	const logger = options?.logger ?? console;
	const browserOrigin = resolveBrowserOrigin(originSource);
	const runtimeAppUrl = runtimeConfig.__ANTI_SOON_PUBLIC_APP_URL__?.trim();
	if (runtimeAppUrl) {
		return resolveConfiguredAppUrl(runtimeAppUrl, browserOrigin, logger);
	}

	const configuredAppUrl = env.VITE_PUBLIC_APP_URL?.trim();
	if (configuredAppUrl) {
		return resolveConfiguredAppUrl(configuredAppUrl, browserOrigin, logger);
	}

	if (browserOrigin) {
		return browserOrigin;
	}

	return DEFAULT_APP_URL;
}
