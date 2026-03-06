import type { DocsPage } from "../schema";

export const dataFlowDocsPage = {
	id: "data-flow",
	slug: "data-flow",
	href: "/docs/data-flow",
	locale: "en",
	title: "Data Flow",
	summary: "Data processing and state transitions.",
	sections: [
		{
			id: "submission-lifecycle",
			anchor: { id: "submission-lifecycle", label: "Submission Lifecycle" },
			title: "Submission Lifecycle",
			summary: "Overview of the end-to-end PoC processing flow.",
			blocks: [
				{
					type: "paragraph",
					text: "The submission lifecycle orchestrates the evaluation of a PoC against a specific project. It begins with the auditor discovering a vulnerability and ends with either a successful payout or a finalized rejection. State transitions are strictly enforced by BountyHub.sol.",
				}
			],
		},
		{
			id: "commit-reveal-stages",
			anchor: { id: "commit-reveal-stages", label: "Commit-Reveal Stages" },
			title: "Commit-Reveal Stages",
			summary: "Protecting zero-days via encrypted commits.",
			blocks: [
				{
					type: "paragraph",
					text: "Auditors first encrypt their PoC data and submit a commitment hash using `commitPoC()` or `commitPoCBySig()`. The encrypted payload is uploaded to an Oasis Sapphire confidential storage endpoint (e.g., `oasis://...`). Once the commitment is secured on-chain, the auditor reveals the payload salt via `revealPoC()` or schedules it via `queueRevealBySig()`. The status transitions from `Committed` to `Revealed`.",
				},
				{
					type: "code",
					language: "solidity",
					code: "function commitPoC(uint256 _projectId, bytes32 _commitHash, string calldata _cipherURI) external;\nfunction revealPoC(uint256 _submissionId, bytes32 _salt) external;"
				}
			],
		},
		{
			id: "verification-and-workflow-hand-off",
			anchor: { id: "verification-and-workflow-hand-off", label: "Verification and Workflow Hand-off" },
			title: "Verification and Workflow Hand-off",
			summary: "Triggering off-chain execution.",
			blocks: [
				{
					type: "paragraph",
					text: "The `revealPoC` transaction emits a `PoCRevealed(uint256 submissionId)` event. The Chainlink CRE nodes listen for this event and initiate the `verify-poc` workflow. The workflow fetches the project's VNet configuration, downloads and decrypts the Oasis payload, sets up the initial preconditions on the Tenderly VNet, and executes the transactions. If the target contract balance demonstrates a valid exploit, the workflow generates a verification report transitioning the state to `Verified`.",
				}
			],
		},
		{
			id: "dispute-and-finalization",
			anchor: { id: "dispute-and-finalization", label: "Dispute and Finalization" },
			title: "Dispute and Finalization",
			summary: "Resolving verified outcomes.",
			blocks: [
				{
					type: "paragraph",
					text: "Once a submission is marked as `Verified`, a dispute window opens for a duration configured by the project. During this period, project owners or external actors can challenge the result using the `challenge()` function by posting a challenge bond. If challenged, the project owner decides the outcome via `resolveDispute()`. Otherwise, the submission can be closed by calling `finalize()`, completing the payout distribution.",
				}
			],
		},
		{
			id: "failure-paths",
			anchor: { id: "failure-paths", label: "Failure Paths" },
			title: "Failure Paths",
			summary: "Handling network and execution failures.",
			blocks: [
				{
					type: "paragraph",
					text: "Failures are classified into explicit rejections and retries. If the PoC fails execution or violates project rules (like max warp seconds), the workflow explicitly returns an invalid report. If the system encounters RPC failures or binding mismatches (like missing Tenderly VNets or inaccessible IPFS endpoints), the system treats it as an infrastructure failure, potentially retrying up to the limits defined in the `rpcReadRetry` configuration policy before quarantining the submission.",
				}
			],
		},
	],
} as const satisfies DocsPage;