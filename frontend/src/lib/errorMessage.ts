const MESSAGE_KEYS = ["shortMessage", "message", "details", "reason"] as const;
const GENERIC_PROVIDER_MESSAGE_PATTERNS = [
	/^internal json-rpc error\.?$/i,
	/^rpc error: internal error\.?$/i,
	/^execution reverted\.?$/i,
	/^call exception\.?$/i,
] as const;

function isGenericProviderMessage(message: string): boolean {
	const normalized = message.trim();
	if (!normalized) return false;

	return GENERIC_PROVIDER_MESSAGE_PATTERNS.some((pattern) =>
		pattern.test(normalized),
	);
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function extractFromMetaMessages(record: Record<string, unknown>): string | undefined {
	const metaMessages = record.metaMessages;
	if (!Array.isArray(metaMessages)) return undefined;

	const lines = metaMessages.filter((entry): entry is string => typeof entry === "string");
	if (lines.length === 0) return undefined;

	const joined = lines.join(" ").trim();
	return joined.length > 0 ? joined : undefined;
}

function extractErrorMessageInternal(
	error: unknown,
	visited: Set<object>,
): string | undefined {
	if (typeof error === "string") {
		const trimmed = error.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	if (typeof error !== "object" || error === null) {
		return undefined;
	}

	if (visited.has(error)) {
		return undefined;
	}
	visited.add(error);

	const record = error as Record<string, unknown>;
	let directMessage: string | undefined;

	for (const key of MESSAGE_KEYS) {
		const message = readStringField(record, key);
		if (message) {
			directMessage = message;
			break;
		}
	}

	const metaMessage = extractFromMetaMessages(record);

	let nestedMessage: string | undefined;
	const nestedCandidates = [
		record.cause,
		record.error,
		record.data,
		record.originalError,
		record.innerError,
		record.info,
	];
	for (const nested of nestedCandidates) {
		const extracted = extractErrorMessageInternal(nested, visited);
		if (extracted) {
			nestedMessage = extracted;
			break;
		}
	}

	if (directMessage && !isGenericProviderMessage(directMessage)) {
		return directMessage;
	}

	if (metaMessage && !isGenericProviderMessage(metaMessage)) {
		return metaMessage;
	}

	if (nestedMessage && !isGenericProviderMessage(nestedMessage)) {
		return nestedMessage;
	}

	return directMessage ?? metaMessage ?? nestedMessage;
}

export function extractErrorMessage(error: unknown, fallback = "unknown error"): string {
	return extractErrorMessageInternal(error, new Set()) ?? fallback;
}
