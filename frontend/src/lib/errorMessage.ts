const MESSAGE_KEYS = ["shortMessage", "message", "details", "reason"] as const;

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

	for (const key of MESSAGE_KEYS) {
		const message = readStringField(record, key);
		if (message) return message;
	}

	const metaMessage = extractFromMetaMessages(record);
	if (metaMessage) return metaMessage;

	const nestedCandidates = [record.cause, record.error, record.data];
	for (const nested of nestedCandidates) {
		const nestedMessage = extractErrorMessageInternal(nested, visited);
		if (nestedMessage) return nestedMessage;
	}

	return undefined;
}

export function extractErrorMessage(error: unknown, fallback = "unknown error"): string {
	return extractErrorMessageInternal(error, new Set()) ?? fallback;
}
