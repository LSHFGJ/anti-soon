const COMMIT_REVEAL_RECOVERY_KEY = "anti-soon:commit-reveal-recovery:v2";
const COMMIT_REVEAL_FLOW_GUARD_KEY = "anti-soon:commit-reveal-flow-guard:v1";
const RECOVERY_PENDING_TTL_MS = 30 * 60 * 1000;
const RECOVERY_SUBMITTED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;
const HEX_REGEX = /^0x[0-9a-fA-F]+$/;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export const ZERO_HEX_32 =
	"0x0000000000000000000000000000000000000000000000000000000000000000" as const;
export const REVEAL_RECHECK_INTERVAL_MS = 15_000;

type StoredRecoveryContext = {
	version: 1;
	projectId: string;
	auditor?: `0x${string}`;
	chainId?: number;
	salt: `0x${string}`;
	cipherURI: string;
	commitHash: `0x${string}`;
	oasisTxHash: `0x${string}`;
	commitTxHash?: `0x${string}`;
	submissionId?: string;
	expiresAt?: number;
};

export type CommitRevealRecoveryContext = {
	projectId: bigint;
	auditor?: `0x${string}`;
	chainId?: number;
	salt: `0x${string}`;
	cipherURI: string;
	commitHash: `0x${string}`;
	oasisTxHash: `0x${string}`;
	commitTxHash?: `0x${string}`;
	submissionId?: bigint;
	expiresAt?: number;
};

export type RevealRetryState = {
	code: "REVEAL_RECHECK_REQUIRED";
	reason: "TIMING_OR_CANDIDATE_BLOCKED";
	policy: "POLL_CAN_REVEAL";
	submissionId: bigint;
	recheckIntervalMs: number;
};

export type SubmissionOnChainSnapshot = {
	projectId: bigint;
	commitHash: `0x${string}`;
	salt: `0x${string}`;
	revealTimestamp: bigint;
};

function hasWindow(): boolean {
	return (
		typeof window !== "undefined" && typeof window.localStorage !== "undefined"
	);
}

function isHex32(value: unknown): value is `0x${string}` {
	return typeof value === "string" && HEX_32_REGEX.test(value);
}

function normalizeAddress(value: unknown): `0x${string}` | null {
	if (typeof value !== "string" || !ADDRESS_REGEX.test(value)) {
		return null;
	}

	return value.toLowerCase() as `0x${string}`;
}

export function normalizeHex(value: `0x${string}`): `0x${string}` {
	return value.toLowerCase() as `0x${string}`;
}

export function buildRevealRetryState(submissionId: bigint): RevealRetryState {
	return {
		code: "REVEAL_RECHECK_REQUIRED",
		reason: "TIMING_OR_CANDIDATE_BLOCKED",
		policy: "POLL_CAN_REVEAL",
		submissionId,
		recheckIntervalMs: REVEAL_RECHECK_INTERVAL_MS,
	};
}

export function parseSubmissionOnChainSnapshot(
	value: unknown,
): SubmissionOnChainSnapshot | null {
	if (!Array.isArray(value) || value.length < 7) {
		return null;
	}

	const projectId = value[1];
	const commitHash = value[2];
	const salt = value[4];
	const revealTimestamp = value[6];

	if (
		typeof projectId !== "bigint" ||
		typeof revealTimestamp !== "bigint" ||
		typeof commitHash !== "string" ||
		typeof salt !== "string" ||
		!HEX_32_REGEX.test(commitHash) ||
		!HEX_32_REGEX.test(salt)
	) {
		return null;
	}

	return {
		projectId,
		commitHash: commitHash as `0x${string}`,
		salt: salt as `0x${string}`,
		revealTimestamp,
	};
}

function parseStoredContext(raw: string): CommitRevealRecoveryContext | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return null;
	}

	const record = parsed as Partial<StoredRecoveryContext>;

	if (
		record.version !== 1 ||
		typeof record.projectId !== "string" ||
		!isHex32(record.salt) ||
		typeof record.cipherURI !== "string" ||
		!isHex32(record.commitHash) ||
		!isHex32(record.oasisTxHash)
	) {
		return null;
	}

	if (record.commitTxHash !== undefined && !isHex32(record.commitTxHash)) {
		return null;
	}

	if (record.auditor !== undefined && !normalizeAddress(record.auditor)) {
		return null;
	}

	if (
		record.chainId !== undefined &&
		(!Number.isInteger(record.chainId) || record.chainId <= 0)
	) {
		return null;
	}

	if (record.submissionId !== undefined && !/^\d+$/.test(record.submissionId)) {
		return null;
	}

	if (
		record.expiresAt !== undefined &&
		(!Number.isInteger(record.expiresAt) || record.expiresAt <= 0)
	) {
		return null;
	}

	let projectId: bigint;
	try {
		projectId = BigInt(record.projectId);
	} catch {
		return null;
	}

	return {
		projectId,
		auditor: normalizeAddress(record.auditor) ?? undefined,
		chainId: record.chainId,
		salt: record.salt,
		cipherURI: record.cipherURI,
		commitHash: record.commitHash,
		oasisTxHash: record.oasisTxHash,
		commitTxHash: record.commitTxHash,
		submissionId: record.submissionId ? BigInt(record.submissionId) : undefined,
		expiresAt: record.expiresAt,
	};
}

export function clearCommitRevealRecoveryContext(): void {
	if (!hasWindow()) return;
	window.localStorage.removeItem(COMMIT_REVEAL_RECOVERY_KEY);
}

export function setCommitRevealFlowGuardActive(active: boolean): void {
	if (!hasWindow()) return;

	if (active) {
		window.sessionStorage.setItem(COMMIT_REVEAL_FLOW_GUARD_KEY, "1");
		return;
	}

	window.sessionStorage.removeItem(COMMIT_REVEAL_FLOW_GUARD_KEY);
}

export function isCommitRevealFlowGuardActive(): boolean {
	if (!hasWindow()) return false;
	return window.sessionStorage.getItem(COMMIT_REVEAL_FLOW_GUARD_KEY) === "1";
}

export function loadCommitRevealRecoveryContext(
	projectId: bigint | null,
	auditor?: `0x${string}` | null,
	expectedChainId?: number | null,
): CommitRevealRecoveryContext | null {
	if (!hasWindow()) return null;

	const raw = window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY);
	if (!raw) return null;

	const parsed = parseStoredContext(raw);
	if (!parsed) {
		clearCommitRevealRecoveryContext();
		return null;
	}

	if (projectId !== null && parsed.projectId !== projectId) {
		clearCommitRevealRecoveryContext();
		return null;
	}

	if (auditor) {
		const expectedAuditor = normalizeAddress(auditor);
		if (!expectedAuditor) {
			clearCommitRevealRecoveryContext();
			return null;
		}

		if (
			!parsed.auditor ||
			normalizeAddress(parsed.auditor) !== expectedAuditor
		) {
			clearCommitRevealRecoveryContext();
			return null;
		}
	}

	if (
		expectedChainId !== undefined &&
		expectedChainId !== null &&
		parsed.chainId !== undefined &&
		parsed.chainId !== expectedChainId
	) {
		clearCommitRevealRecoveryContext();
		return null;
	}

	if (
		parsed.expiresAt !== undefined &&
		Number.isFinite(parsed.expiresAt) &&
		Date.now() > parsed.expiresAt
	) {
		clearCommitRevealRecoveryContext();
		return null;
	}

	return parsed;
}

export function persistCommitRevealRecoveryContext(
	context: CommitRevealRecoveryContext,
): void {
	if (!hasWindow()) return;

	if (
		!isHex32(context.salt) ||
		!isHex32(context.commitHash) ||
		!isHex32(context.oasisTxHash) ||
		(context.chainId !== undefined &&
			(!Number.isInteger(context.chainId) || context.chainId <= 0)) ||
		(context.expiresAt !== undefined &&
			(!Number.isInteger(context.expiresAt) || context.expiresAt <= 0)) ||
		(context.commitTxHash !== undefined &&
			(typeof context.commitTxHash !== "string" ||
				!HEX_REGEX.test(context.commitTxHash)))
	) {
		return;
	}

	const now = Date.now();
	const ttlMs = context.submissionId
		? RECOVERY_SUBMITTED_TTL_MS
		: RECOVERY_PENDING_TTL_MS;
	const expiresAt =
		context.expiresAt !== undefined ? context.expiresAt : now + ttlMs;

	const record: StoredRecoveryContext = {
		version: 1,
		projectId: context.projectId.toString(),
		auditor: context.auditor,
		chainId: context.chainId,
		salt: context.salt,
		cipherURI: context.cipherURI,
		commitHash: context.commitHash,
		oasisTxHash: context.oasisTxHash,
		commitTxHash: context.commitTxHash,
		submissionId: context.submissionId?.toString(),
		expiresAt,
	};

	window.localStorage.setItem(
		COMMIT_REVEAL_RECOVERY_KEY,
		JSON.stringify(record),
	);
}
