import { getAddress, isAddress } from "viem";
import { sepolia } from "viem/chains";

const DEFAULT_BOUNTY_HUB_ADDRESS = "0x3fBd5ab0F3FD234A40923ae7986f45acB9d4A3cf";

const ENV =
	(import.meta as ImportMeta & { env?: Record<string, string | undefined> })
		.env ?? {};

function isEnvFlagEnabled(value: string | undefined): boolean {
	const normalizedValue = value?.trim().toLowerCase();
	return normalizedValue === "1" || normalizedValue === "true";
}

export const DOCS_ENABLED = isEnvFlagEnabled(ENV.VITE_ENABLE_DOCS);

export const ACL_ONLY_HARD_CUTOVER_MARKER = "acl-only-v1" as const;
export const LEGACY_KEY_MODE_MARKERS = [
	"legacy-key-v1",
	"legacy-key",
	"dual-path",
] as const;
export const UNSUPPORTED_LEGACY_SUBMISSION_MODE_ERROR =
	`UNSUPPORTED_LEGACY_SUBMISSION_MODE: only ${ACL_ONLY_HARD_CUTOVER_MARKER} is supported after hard cutover`;

function isLegacyKeyModeMarker(
	mode: string,
): mode is (typeof LEGACY_KEY_MODE_MARKERS)[number] {
	return (LEGACY_KEY_MODE_MARKERS as readonly string[]).includes(mode);
}

export function assertAclOnlySubmissionMode(
	mode: string,
): asserts mode is typeof ACL_ONLY_HARD_CUTOVER_MARKER {
	if (mode === ACL_ONLY_HARD_CUTOVER_MARKER) {
		return;
	}

	if (isLegacyKeyModeMarker(mode)) {
		throw new Error(
			`${UNSUPPORTED_LEGACY_SUBMISSION_MODE_ERROR}; received legacy marker "${mode}"`,
		);
	}

	throw new Error(`${UNSUPPORTED_LEGACY_SUBMISSION_MODE_ERROR}; received "${mode}"`);
}

const configuredSubmissionMode =
	ENV.VITE_SUBMISSION_MODE?.trim() ?? ACL_ONLY_HARD_CUTOVER_MARKER;
assertAclOnlySubmissionMode(configuredSubmissionMode);
export const SUBMISSION_MODE = configuredSubmissionMode;

const configuredBountyHubAddress = ENV.VITE_BOUNTY_HUB_ADDRESS?.trim();

export const BOUNTY_HUB_ADDRESS = (() => {
	if (!configuredBountyHubAddress) {
		return getAddress(DEFAULT_BOUNTY_HUB_ADDRESS) as `0x${string}`;
	}

	if (!isAddress(configuredBountyHubAddress)) {
		console.warn(
			"Invalid VITE_BOUNTY_HUB_ADDRESS detected, falling back to default BountyHub address.",
		);
		return getAddress(DEFAULT_BOUNTY_HUB_ADDRESS) as `0x${string}`;
	}

	return getAddress(configuredBountyHubAddress) as `0x${string}`;
})();

export const BOUNTY_HUB_PROJECTS_V4_ABI = [
	{
		name: "projects",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [
			{
				name: "project",
				type: "tuple",
				components: [
					{ name: "owner", type: "address" },
					{ name: "bountyPool", type: "uint256" },
					{ name: "maxPayoutPerBug", type: "uint256" },
					{ name: "targetContract", type: "address" },
					{ name: "forkBlock", type: "uint256" },
					{ name: "active", type: "bool" },
					{ name: "mode", type: "uint8" },
					{ name: "commitDeadline", type: "uint256" },
					{ name: "revealDeadline", type: "uint256" },
					{ name: "disputeWindow", type: "uint256" },
					{ name: "juryWindow", type: "uint256" },
					{ name: "adjudicationWindow", type: "uint256" },
					{ name: "rulesHash", type: "bytes32" },
					{ name: "vnetStatus", type: "uint8" },
					{ name: "vnetRpcUrl", type: "string" },
					{ name: "baseSnapshotId", type: "bytes32" },
					{ name: "vnetCreatedAt", type: "uint256" },
					{ name: "repoUrl", type: "string" },
				],
			},
		],
	},
] as const;

export const BOUNTY_HUB_V2_ABI = [
	{
		name: "submitPoC",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_projectId", type: "uint256" },
			{ name: "_pocHash", type: "bytes32" },
			{ name: "_pocURI", type: "string" },
		],
		outputs: [{ name: "submissionId", type: "uint256" }],
	},
	// V2: Register project with full rules
	{
		name: "registerProjectV2",
		type: "function",
		stateMutability: "payable",
		inputs: [
			{ name: "_targetContract", type: "address" },
			{ name: "_maxPayoutPerBug", type: "uint256" },
			{ name: "_forkBlock", type: "uint256" },
			{ name: "_mode", type: "uint8" },
			{ name: "_commitDeadline", type: "uint256" },
			{ name: "_revealDeadline", type: "uint256" },
			{ name: "_disputeWindow", type: "uint256" },
			{
				name: "_rules",
				type: "tuple",
				components: [
					{ name: "maxAttackerSeedWei", type: "uint256" },
					{ name: "maxWarpSeconds", type: "uint256" },
					{ name: "allowImpersonation", type: "bool" },
					{
						name: "thresholds",
						type: "tuple",
						components: [
							{ name: "criticalDrainWei", type: "uint256" },
							{ name: "highDrainWei", type: "uint256" },
							{ name: "mediumDrainWei", type: "uint256" },
							{ name: "lowDrainWei", type: "uint256" },
						],
					},
				],
			},
		],
		outputs: [{ name: "projectId", type: "uint256" }],
	},
	// V2: Commit encrypted PoC (Phase 1)
	{
		name: "commitPoC",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_projectId", type: "uint256" },
			{ name: "_commitHash", type: "bytes32" },
			{ name: "_cipherURI", type: "string" },
		],
		outputs: [{ name: "submissionId", type: "uint256" }],
	},
	{
		name: "revealPoC",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_submissionId", type: "uint256" },
			{ name: "_salt", type: "bytes32" },
		],
		outputs: [],
	},
	{
		name: "queueRevealBySig",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_auditor", type: "address" },
			{ name: "_submissionId", type: "uint256" },
			{ name: "_salt", type: "bytes32" },
			{ name: "_deadline", type: "uint256" },
			{ name: "_signature", type: "bytes" },
		],
		outputs: [],
	},
	{
		name: "executeQueuedReveal",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [],
	},
	{
		name: "nextProjectId",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		name: "nextSubmissionId",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		name: "getProjectCount",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		name: "getProjectIds",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "cursor", type: "uint256" },
			{ name: "limit", type: "uint256" },
		],
		outputs: [
			{ name: "ids", type: "uint256[]" },
			{ name: "nextCursor", type: "uint256" },
		],
	},
	{
		name: "getProjectSubmissionCount",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "projectId", type: "uint256" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		name: "getAuditorSubmissionCount",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "auditor", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		name: "getProjectSubmissionIds",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "projectId", type: "uint256" },
			{ name: "cursor", type: "uint256" },
			{ name: "limit", type: "uint256" },
		],
		outputs: [
			{ name: "ids", type: "uint256[]" },
			{ name: "nextCursor", type: "uint256" },
		],
	},
	{
		name: "getAuditorSubmissionIds",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "auditor", type: "address" },
			{ name: "cursor", type: "uint256" },
			{ name: "limit", type: "uint256" },
		],
		outputs: [
			{ name: "ids", type: "uint256[]" },
			{ name: "nextCursor", type: "uint256" },
		],
	},
	{
		name: "getAuditorStats",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "auditor", type: "address" }],
		outputs: [
			{ name: "totalSubmissions", type: "uint256" },
			{ name: "activeValidCount", type: "uint256" },
			{ name: "pendingCount", type: "uint256" },
			{ name: "paidCount", type: "uint256" },
			{ name: "highPaidCount", type: "uint256" },
			{ name: "criticalPaidCount", type: "uint256" },
			{ name: "totalEarnedWei", type: "uint256" },
			{ name: "leaderboardIndex", type: "uint256" },
		],
	},
	{
		name: "getLeaderboardAuditorCount",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		name: "getLeaderboardAuditors",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "cursor", type: "uint256" },
			{ name: "limit", type: "uint256" },
		],
		outputs: [
			{ name: "auditors", type: "address[]" },
			{ name: "nextCursor", type: "uint256" },
		],
	},
	// Dispute functions
	{
		name: "challenge",
		type: "function",
		stateMutability: "payable",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [],
	},
	{
		name: "resolveDispute",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_submissionId", type: "uint256" },
			{ name: "_overturn", type: "bool" },
		],
		outputs: [],
	},
	{
		name: "finalize",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [],
	},
	// View functions
	{
		name: "sigNonces",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		name: "projectRules",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [
			{ name: "maxAttackerSeedWei", type: "uint256" },
			{ name: "maxWarpSeconds", type: "uint256" },
			{ name: "allowImpersonation", type: "bool" },
			{
				name: "thresholds",
				type: "tuple",
				components: [
					{ name: "criticalDrainWei", type: "uint256" },
					{ name: "highDrainWei", type: "uint256" },
					{ name: "mediumDrainWei", type: "uint256" },
					{ name: "lowDrainWei", type: "uint256" },
				],
			},
		],
	},
	// Events
	{
		name: "DisputeResolved",
		type: "event",
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
			{ name: "overturned", type: "bool", indexed: false },
		],
	},
	{
		name: "queuedReveals",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [
			{ name: "auditor", type: "address" },
			{ name: "salt", type: "bytes32" },
			{ name: "deadline", type: "uint256" },
			{ name: "queued", type: "bool" },
		],
	},
	{
		name: "projects",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [
			{ name: "owner", type: "address" },
			{ name: "bountyPool", type: "uint256" },
			{ name: "maxPayoutPerBug", type: "uint256" },
			{ name: "targetContract", type: "address" },
			{ name: "forkBlock", type: "uint256" },
			{ name: "active", type: "bool" },
			{ name: "mode", type: "uint8" },
			{ name: "commitDeadline", type: "uint256" },
			{ name: "revealDeadline", type: "uint256" },
			{ name: "disputeWindow", type: "uint256" },
			{ name: "rulesHash", type: "bytes32" },
			{ name: "vnetStatus", type: "uint8" },
			{ name: "vnetRpcUrl", type: "string" },
			{ name: "baseSnapshotId", type: "bytes32" },
			{ name: "vnetCreatedAt", type: "uint256" },
			{ name: "repoUrl", type: "string" },
		],
	},
	{
		name: "submissions",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [
			{ name: "auditor", type: "address" },
			{ name: "projectId", type: "uint256" },
			{ name: "commitHash", type: "bytes32" },
			{ name: "cipherURI", type: "string" },
			{ name: "salt", type: "bytes32" },
			{ name: "commitTimestamp", type: "uint256" },
			{ name: "revealTimestamp", type: "uint256" },
			{ name: "status", type: "uint8" },
			{ name: "drainAmountWei", type: "uint256" },
			{ name: "severity", type: "uint8" },
			{ name: "payoutAmount", type: "uint256" },
			{ name: "disputeDeadline", type: "uint256" },
			{ name: "challenged", type: "bool" },
			{ name: "challenger", type: "address" },
			{ name: "challengeBond", type: "uint256" },
		],
	},
	{
		name: "submissionMetadataHash",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [{ name: "", type: "bytes32" }],
	},
	{
		name: "getSubmissionJuryMetadata",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [
			{ name: "hasJury", type: "bool" },
			{ name: "action", type: "string" },
			{ name: "rationale", type: "string" },
		],
	},
	{
		name: "getSubmissionLifecycle",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [
			{ name: "status", type: "uint8" },
			{ name: "juryDeadline", type: "uint256" },
			{ name: "adjudicationDeadline", type: "uint256" },
			{ name: "verdictSource", type: "uint8" },
			{ name: "finalValidity", type: "uint8" },
			{ name: "juryLedgerDigest", type: "bytes32" },
			{ name: "ownerTestimonyDigest", type: "bytes32" },
		],
	},
	{
		name: "getSubmissionGroupingMetadata",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [
			{ name: "hasGrouping", type: "bool" },
			{ name: "cohort", type: "string" },
			{ name: "groupId", type: "string" },
			{ name: "groupRank", type: "uint256" },
			{ name: "groupSize", type: "uint256" },
		],
	},
	{
		name: "uniqueRevealStateByProject",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [
			{ name: "hasCandidate", type: "bool" },
			{ name: "candidateSubmissionId", type: "uint256" },
			{ name: "winnerLocked", type: "bool" },
			{ name: "winnerSubmissionId", type: "uint256" },
		],
	},
	{
		name: "canReveal",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [{ name: "", type: "bool" }],
	},
	// Events
	{
		name: "ProjectRegisteredV2",
		type: "event",
		inputs: [
			{ name: "projectId", type: "uint256", indexed: true },
			{ name: "owner", type: "address", indexed: true },
			{ name: "mode", type: "uint8", indexed: false },
		],
	},
	{
		name: "PoCCommitted",
		type: "event",
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
			{ name: "projectId", type: "uint256", indexed: true },
			{ name: "auditor", type: "address", indexed: true },
			{ name: "commitHash", type: "bytes32", indexed: false },
		],
	},
	{
		name: "PoCCommitMetadata",
		type: "event",
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
			{ name: "metadataHash", type: "bytes32", indexed: false },
		],
	},
	{
		name: "PoCRevealed",
		type: "event",
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
		],
	},
	{
		name: "PoCVerified",
		type: "event",
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
			{ name: "isValid", type: "bool", indexed: false },
			{ name: "drainAmountWei", type: "uint256", indexed: false },
			{ name: "severity", type: "uint8", indexed: false },
		],
	},
	{
		name: "BountyPaid",
		type: "event",
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
			{ name: "auditor", type: "address", indexed: true },
			{ name: "amount", type: "uint256", indexed: false },
		],
	},
	{
		name: "DisputeRaised",
		type: "event",
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
			{ name: "challenger", type: "address", indexed: true },
			{ name: "bond", type: "uint256", indexed: false },
		],
	},
	{
		name: "BountyFinalized",
		type: "event",
		inputs: [{ name: "submissionId", type: "uint256", indexed: true }],
	},
	{
		name: "UniqueRevealCandidateSet",
		type: "event",
		inputs: [
			{ name: "projectId", type: "uint256", indexed: true },
			{ name: "submissionId", type: "uint256", indexed: true },
		],
	},
	{
		name: "UniqueRevealCandidateCleared",
		type: "event",
		inputs: [
			{ name: "projectId", type: "uint256", indexed: true },
			{ name: "submissionId", type: "uint256", indexed: true },
		],
	},
	{
		name: "UniqueWinnerLocked",
		type: "event",
		inputs: [
			{ name: "projectId", type: "uint256", indexed: true },
			{ name: "submissionId", type: "uint256", indexed: true },
		],
	},
] as const;

export const CHAIN = sepolia;

export const DEMO_PROJECTS = [
	{
		id: "dummy-vault-001",
		name: "DummyVault",
		description:
			"Vulnerable vault contract for AntiSoon demo - contains reentrancy, access control, and price manipulation vulnerabilities",
		prizePool: "10,000 USDC",
		targetContract: "0xDummyVault",
		chain: "Anvil Local",
		forkBlock: "0",
		logo: "DV",
		auditUrl: "",
		repoUrl: "demo-projects/dummy-vault",
		nSLOC: 150,
		highFindings: 4,
		status: "active",
	},
	{
		id: "panoptic-next-core-001",
		name: "Panoptic Next Core",
		description:
			"DeFi options protocol - transforms Uniswap LP positions into onchain options",
		prizePool: "56,000 USDC",
		targetContract: "0xPanopticPool",
		chain: "Mainnet",
		forkBlock: "18963715",
		logo: "P",
		auditUrl: "https://code4rena.com/audits/2025-12-panoptic-next-core",
		repoUrl: "https://github.com/code-423n4/2025-12-panoptic",
		nSLOC: 6356,
		highFindings: 5,
		status: "report_in_progress",
	},
];

export const H01_POC_TEMPLATE = {
	target: "0x1111111111111111111111111111111111111111",
	chain: "Sepolia",
	forkBlock: 6500000,
	conditions: [
		{
			id: "cond-1",
			type: "setTimestamp",
			value: "1730000000",
		},
		{
			id: "cond-2",
			type: "setBalance",
			target: "0x2222222222222222222222222222222222222222",
			value: "1000000000000000000",
		},
	],
	transactions: [
		{
			id: "tx-1",
			to: "0x1111111111111111111111111111111111111111",
			value: "0",
			data: "0x",
		},
	],
	impact: {
		type: "stateCorruption",
		estimatedLoss: "1000000000000000000",
		description:
			"Example exploit flow for builder smoke testing with valid schema fields.",
	},
};

export const DUMMYVAULT_POC_TEMPLATES = {
	reentrancy: {
		name: "Reentrancy Attack",
		severity: "HIGH" as const,
		description:
			"Withdraw function updates state after transfer, allowing reentrancy",
		template: {
			target: "0x3333333333333333333333333333333333333333",
			chain: "Sepolia",
			forkBlock: 6500000,
			conditions: [
				{
					type: "setBalance",
					target: "0x4444444444444444444444444444444444444444",
					value: "1000000000000000000",
				},
			],
			transactions: [
				{
					to: "0x3333333333333333333333333333333333333333",
					data: "0x",
					value: "0",
				},
				{
					to: "0x3333333333333333333333333333333333333333",
					data: "0x",
					value: "0",
				},
			],
			impact: {
				type: "fundsDrained",
				estimatedLoss: "1000000000000000000",
				description: "Reentrancy path example using builder-compatible fields.",
			},
		},
	},
	accessControl: {
		name: "Access Control Bypass",
		severity: "HIGH" as const,
		description:
			"updatePrice() has no access control, anyone can manipulate oracle",
		template: {
			target: "0x3333333333333333333333333333333333333333",
			chain: "Sepolia",
			forkBlock: 6500000,
			conditions: [
				{
					type: "setStorage",
					target: "0x3333333333333333333333333333333333333333",
					slot: "0x0",
					value: "0x01",
				},
			],
			transactions: [{ to: "0x3333333333333333333333333333333333333333", data: "0x", value: "0" }],
			impact: {
				type: "stateCorruption",
				estimatedLoss: "500000000000000000",
				description:
					"Access-control bypass example represented in current builder schema.",
			},
		},
	},
	emergencyWithdraw: {
		name: "Emergency Withdraw Theft",
		severity: "HIGH" as const,
		description:
			"emergencyWithdraw() has no access control, anyone can drain all funds",
		template: {
			target: "0x3333333333333333333333333333333333333333",
			chain: "Sepolia",
			forkBlock: 6500000,
			conditions: [
				{
					type: "setBalance",
					target: "0x5555555555555555555555555555555555555555",
					value: "3000000000000000000",
				},
			],
			transactions: [
				{ to: "0x3333333333333333333333333333333333333333", data: "0x", value: "0" },
			],
			impact: {
				type: "fundsDrained",
				estimatedLoss: "3000000000000000000",
				description: "Emergency-withdraw abuse example with valid builder fields.",
			},
		},
	},
	priceManipulation: {
		name: "Oracle Price Manipulation",
		severity: "HIGH" as const,
		description:
			"Attacker can inflate price to drain more funds than deposited",
		template: {
			target: "0x3333333333333333333333333333333333333333",
			chain: "Sepolia",
			forkBlock: 6500000,
			conditions: [
				{
					type: "setStorage",
					target: "0x3333333333333333333333333333333333333333",
					slot: "0x1",
					value: "0x02",
				},
			],
			transactions: [
				{
					to: "0x3333333333333333333333333333333333333333",
					data: "0x",
					value: "0",
				},
				{ to: "0x3333333333333333333333333333333333333333", data: "0x", value: "0" },
			],
			impact: {
				type: "stateCorruption",
				estimatedLoss: "2000000000000000000",
				description: "Oracle-manipulation example compatible with current builder flow.",
			},
		},
	},
};
