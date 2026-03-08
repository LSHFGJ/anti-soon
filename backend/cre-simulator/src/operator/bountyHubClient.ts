export type HexString = `0x${string}`
export type AddressString = `0x${string}`

export const BOUNTY_HUB_SUBMISSION_STATUS = {
  Committed: 0,
  Revealed: 1,
  Verified: 2,
  Disputed: 3,
  Finalized: 4,
  Invalid: 5,
} as const

export const BOUNTY_HUB_EVENT_SIGNATURES = {
  ProjectRegisteredV2:
    "event ProjectRegisteredV2(uint256 indexed projectId, address indexed owner, CompetitionMode mode)",
  PoCCommitted:
    "event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)",
  PoCRevealed: "event PoCRevealed(uint256 indexed submissionId)",
  PoCVerified:
    "event PoCVerified(uint256 indexed submissionId, bool isValid, uint256 drainAmountWei, uint8 severity)",
  BountyPaid:
    "event BountyPaid(uint256 indexed submissionId, address indexed auditor, uint256 amount)",
  BountyFinalized: "event BountyFinalized(uint256 indexed submissionId)",
} as const

export type BountyHubEventName = keyof typeof BOUNTY_HUB_EVENT_SIGNATURES

export type RegisterProjectV2Input = {
  value: bigint
  targetContract: AddressString
  maxPayoutPerBug: bigint
  forkBlock: bigint
  mode: number
  commitDeadline: bigint
  revealDeadline: bigint
  disputeWindow: bigint
  rules: {
    maxAttackerSeedWei: bigint
    maxWarpSeconds: bigint
    allowImpersonation: boolean
    thresholds: {
      criticalDrainWei: bigint
      highDrainWei: bigint
      mediumDrainWei: bigint
      lowDrainWei: bigint
    }
  }
}

export type BountyHubProject = {
  owner: AddressString
  bountyPool: bigint
  maxPayoutPerBug: bigint
  targetContract: AddressString
  forkBlock: bigint
  active: boolean
  mode: number
  commitDeadline: bigint
  revealDeadline: bigint
  disputeWindow: bigint
  rulesHash: HexString
  vnetStatus: number
  vnetRpcUrl: string
  baseSnapshotId: HexString
  vnetCreatedAt: bigint
  repoUrl: string
}

export type BountyHubSubmission = {
  auditor: AddressString
  projectId: bigint
  commitHash: HexString
  cipherURI: string
  salt: HexString
  commitTimestamp: bigint
  revealTimestamp: bigint
  status: number
  drainAmountWei: bigint
  severity: number
  payoutAmount: bigint
  disputeDeadline: bigint
  challenged: boolean
  challenger: AddressString
  challengeBond: bigint
}

export type BountyHubAuditorStats = {
  paidCount: bigint
  totalPaidWei: bigint
}

type BountyHubEventArgsMap = {
  ProjectRegisteredV2: {
    projectId?: bigint
    owner?: AddressString
    mode?: number
  }
  PoCCommitted: {
    submissionId?: bigint
    projectId?: bigint
    auditor?: AddressString
    commitHash?: HexString
  }
  PoCRevealed: {
    submissionId?: bigint
  }
  PoCVerified: {
    submissionId?: bigint
    isValid?: boolean
    drainAmountWei?: bigint
    severity?: number
  }
  BountyPaid: {
    submissionId?: bigint
    auditor?: AddressString
    amount?: bigint
  }
  BountyFinalized: {
    submissionId?: bigint
  }
}

export type BountyHubEventLog<
  TEventName extends BountyHubEventName = BountyHubEventName,
> = {
  eventName: TEventName
  args: BountyHubEventArgsMap[TEventName]
  transactionHash?: HexString
  txHash?: HexString
  blockNumber?: bigint | number | string
  logIndex?: bigint | number | string
}

export type BountyHubReceipt = {
  transactionHash?: HexString
  logs: readonly BountyHubEventLog[]
}

export type BountyHubContractCallDescriptor<
  TFunctionName extends string = string,
> = {
  address: AddressString
  functionName: TFunctionName
  args: readonly unknown[]
  value?: bigint
}

export type BountyHubEventQuery<
  TEventName extends BountyHubEventName = BountyHubEventName,
> = {
  address: AddressString
  eventName: TEventName
  signature: (typeof BOUNTY_HUB_EVENT_SIGNATURES)[TEventName]
  args?: Record<string, bigint | number | string | boolean>
  fromBlock?: bigint
  toBlock?: bigint | "latest"
}

export type BountyHubTransport = {
  readContract<TResult>(
    request: BountyHubContractCallDescriptor,
  ): Promise<TResult>
  writeContract(
    request: BountyHubContractCallDescriptor,
  ): Promise<HexString>
  waitForTransactionReceipt(hash: HexString): Promise<BountyHubReceipt>
  getEvents<TEventName extends BountyHubEventName>(
    query: BountyHubEventQuery<TEventName>,
  ): Promise<readonly BountyHubEventLog<TEventName>[]>
}

export type RegistrationWorkflowTrigger = {
  eventName: "ProjectRegisteredV2"
  projectId: bigint
  txHash: HexString
  eventIndex: number
}

export type RevealWorkflowTrigger = {
  eventName: "PoCRevealed"
  submissionId: bigint
  txHash: HexString
  eventIndex: number
}

export type CommittedSubmissionScanEntry = {
  submissionId: bigint
  projectId: bigint
  auditor: AddressString
  commitHash: HexString
  txHash: HexString
  eventIndex: number
}

export type TerminalPayoutEvidenceInput = {
  submissionId: bigint
  auditor: AddressString
  submission: Pick<BountyHubSubmission, "auditor" | "status" | "payoutAmount">
  payoutEvent?: BountyHubEventLog<"BountyPaid">
  finalizedEvent?: BountyHubEventLog<"BountyFinalized">
  auditorStats?: BountyHubAuditorStats
  localPaidFlag?: boolean
}

export type TerminalPayoutEvidence = {
  submissionId: bigint
  auditor: AddressString
  payoutAmount: bigint
  payoutTxHash: HexString
  payoutEventIndex: number
  finalizedTxHash: HexString
  finalizedEventIndex: number
}

function normalizeAddress(value: string, label: string): AddressString {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} must be a 20-byte hex address`)
  }

  return value.toLowerCase() as AddressString
}

function normalizeHash(value: string, label: string): HexString {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex string`)
  }

  return value.toLowerCase() as HexString
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function toBigInt(value: bigint | number | string | undefined, label: string): bigint {
  if (typeof value === "bigint") {
    return value
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer`)
    }

    return BigInt(value)
  }
  if (typeof value === "string" && value.length > 0) {
    return BigInt(value)
  }

  throw new Error(`${label} is required`)
}

function toEventIndex(value: bigint | number | string | undefined, label: string): number {
  const normalized = toBigInt(value, label)
  if (normalized > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds Number.MAX_SAFE_INTEGER`)
  }

  return Number(normalized)
}

function compareBigInt(left: bigint, right: bigint): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

function compareEventLogs(
  left: BountyHubEventLog,
  right: BountyHubEventLog,
): number {
  const blockComparison = compareBigInt(
    toBigInt(left.blockNumber ?? 0n, "left.blockNumber"),
    toBigInt(right.blockNumber ?? 0n, "right.blockNumber"),
  )
  if (blockComparison !== 0) {
    return blockComparison
  }

  const logIndexComparison = compareBigInt(
    toBigInt(left.logIndex ?? 0n, "left.logIndex"),
    toBigInt(right.logIndex ?? 0n, "right.logIndex"),
  )
  if (logIndexComparison !== 0) {
    return logIndexComparison
  }

  const leftHash =
    typeof left.transactionHash === "string"
      ? left.transactionHash.toLowerCase()
      : typeof left.txHash === "string"
        ? left.txHash.toLowerCase()
        : ""
  const rightHash =
    typeof right.transactionHash === "string"
      ? right.transactionHash.toLowerCase()
      : typeof right.txHash === "string"
        ? right.txHash.toLowerCase()
        : ""

  return leftHash.localeCompare(rightHash)
}

function getEventLogs(
  source: BountyHubReceipt | readonly BountyHubEventLog[],
): readonly BountyHubEventLog[] {
  return Array.isArray(source) ? source : source.logs
}

function getFallbackTransactionHash(
  source: BountyHubReceipt | readonly BountyHubEventLog[],
): HexString | undefined {
  if (Array.isArray(source)) {
    return undefined
  }

  return source.transactionHash
}

function getLatestEvent<TEventName extends BountyHubEventName>(
  source: BountyHubReceipt | readonly BountyHubEventLog[],
  eventName: TEventName,
): BountyHubEventLog<TEventName> {
  const matching = getEventLogs(source)
    .filter(
      (event): event is BountyHubEventLog<TEventName> => event.eventName === eventName,
    )
    .slice()
    .sort(compareEventLogs)

  const event = matching.at(-1)
  if (!event) {
    throw new Error(`Missing ${eventName} event`)
  }

  return event
}

function getEventTransactionHash(
  event: BountyHubEventLog,
  fallbackTransactionHash: HexString | undefined,
  label: string,
): HexString {
  const rawHash = event.transactionHash ?? event.txHash ?? fallbackTransactionHash
  if (!rawHash) {
    throw new Error(`${label} transaction hash is required`)
  }

  return normalizeHash(rawHash, `${label} transaction hash`)
}

function getCommittedSubmissionEntry(
  event: BountyHubEventLog<"PoCCommitted">,
): CommittedSubmissionScanEntry {
  const submissionId = toBigInt(
    event.args.submissionId,
    "PoCCommitted.submissionId",
  )
  const projectId = toBigInt(event.args.projectId, "PoCCommitted.projectId")
  const auditor = normalizeAddress(
    String(event.args.auditor),
    "PoCCommitted.auditor",
  )
  const commitHash = normalizeHash(
    String(event.args.commitHash),
    "PoCCommitted.commitHash",
  )

  return {
    submissionId,
    projectId,
    auditor,
    commitHash,
    txHash: getEventTransactionHash(event, undefined, "PoCCommitted"),
    eventIndex: toEventIndex(event.logIndex, "PoCCommitted.logIndex"),
  }
}

export function buildRegisterProjectV2Request(
  address: AddressString,
  input: RegisterProjectV2Input,
): BountyHubContractCallDescriptor<"registerProjectV2"> {
  return {
    address,
    functionName: "registerProjectV2",
    value: input.value,
    args: [
      input.targetContract,
      input.maxPayoutPerBug,
      input.forkBlock,
      input.mode,
      input.commitDeadline,
      input.revealDeadline,
      input.disputeWindow,
      input.rules,
    ],
  }
}

export function buildReadProjectRequest(
  address: AddressString,
  projectId: bigint,
): BountyHubContractCallDescriptor<"projects"> {
  return {
    address,
    functionName: "projects",
    args: [projectId],
  }
}

export function buildReadSubmissionRequest(
  address: AddressString,
  submissionId: bigint,
): BountyHubContractCallDescriptor<"submissions"> {
  return {
    address,
    functionName: "submissions",
    args: [submissionId],
  }
}

export function buildCommittedSubmissionScanByProjectQuery(
  address: AddressString,
  projectId: bigint,
): BountyHubEventQuery<"PoCCommitted"> {
  return {
    address,
    eventName: "PoCCommitted",
    signature: BOUNTY_HUB_EVENT_SIGNATURES.PoCCommitted,
    args: { projectId },
  }
}

export function buildCommittedSubmissionScanByAuditorQuery(
  address: AddressString,
  auditor: AddressString,
): BountyHubEventQuery<"PoCCommitted"> {
  return {
    address,
    eventName: "PoCCommitted",
    signature: BOUNTY_HUB_EVENT_SIGNATURES.PoCCommitted,
    args: { auditor },
  }
}

export function buildRevealTriggerQuery(
  address: AddressString,
  submissionId: bigint,
): BountyHubEventQuery<"PoCRevealed"> {
  return {
    address,
    eventName: "PoCRevealed",
    signature: BOUNTY_HUB_EVENT_SIGNATURES.PoCRevealed,
    args: { submissionId },
  }
}

export function buildVerifiedEventQuery(
  address: AddressString,
  submissionId: bigint,
): BountyHubEventQuery<"PoCVerified"> {
  return {
    address,
    eventName: "PoCVerified",
    signature: BOUNTY_HUB_EVENT_SIGNATURES.PoCVerified,
    args: { submissionId },
  }
}

export function buildPayoutEventQuery(
  address: AddressString,
  submissionId: bigint,
): BountyHubEventQuery<"BountyPaid"> {
  return {
    address,
    eventName: "BountyPaid",
    signature: BOUNTY_HUB_EVENT_SIGNATURES.BountyPaid,
    args: { submissionId },
  }
}

export function buildFinalizedEventQuery(
  address: AddressString,
  submissionId: bigint,
): BountyHubEventQuery<"BountyFinalized"> {
  return {
    address,
    eventName: "BountyFinalized",
    signature: BOUNTY_HUB_EVENT_SIGNATURES.BountyFinalized,
    args: { submissionId },
  }
}

export function extractRegistrationWorkflowTrigger(
  source: BountyHubReceipt | readonly BountyHubEventLog[],
): RegistrationWorkflowTrigger {
  const event = getLatestEvent(source, "ProjectRegisteredV2")
  return {
    eventName: "ProjectRegisteredV2",
    projectId: toBigInt(
      event.args.projectId,
      "ProjectRegisteredV2.projectId",
    ),
    txHash: getEventTransactionHash(
      event,
      getFallbackTransactionHash(source),
      "ProjectRegisteredV2",
    ),
    eventIndex: toEventIndex(
      event.logIndex,
      "ProjectRegisteredV2.logIndex",
    ),
  }
}

export function extractRevealWorkflowTrigger(
  source: BountyHubReceipt | readonly BountyHubEventLog[],
): RevealWorkflowTrigger {
  const event = getLatestEvent(source, "PoCRevealed")
  return {
    eventName: "PoCRevealed",
    submissionId: toBigInt(event.args.submissionId, "PoCRevealed.submissionId"),
    txHash: getEventTransactionHash(
      event,
      getFallbackTransactionHash(source),
      "PoCRevealed",
    ),
    eventIndex: toEventIndex(event.logIndex, "PoCRevealed.logIndex"),
  }
}

export function normalizeCommittedSubmissionScan(
  logs: readonly BountyHubEventLog<"PoCCommitted">[],
): CommittedSubmissionScanEntry[] {
  const deduped = new Map<string, CommittedSubmissionScanEntry>()

  for (const log of logs.slice().sort(compareEventLogs)) {
    const entry = getCommittedSubmissionEntry(log)
    const key = entry.submissionId.toString()
    if (!deduped.has(key)) {
      deduped.set(key, entry)
    }
  }

  return Array.from(deduped.values())
}

export function assertTerminalPayoutEvidence(
  input: TerminalPayoutEvidenceInput,
): TerminalPayoutEvidence {
  if (input.localPaidFlag === true) {
    throw new Error(
      "Terminal payout checks require contract-observable evidence, not a local paid flag",
    )
  }

  if (input.submission.status !== BOUNTY_HUB_SUBMISSION_STATUS.Finalized) {
    throw new Error(
      `Submission ${input.submissionId.toString()} is not finalized on-chain`,
    )
  }
  if (!sameAddress(input.submission.auditor, input.auditor)) {
    throw new Error(
      `Submission ${input.submissionId.toString()} auditor does not match requested auditor`,
    )
  }

  const payoutEvent = input.payoutEvent
  if (!payoutEvent) {
    throw new Error(
      `Missing BountyPaid event for submission ${input.submissionId.toString()}`,
    )
  }

  const finalizedEvent = input.finalizedEvent
  if (!finalizedEvent) {
    throw new Error(
      `Missing BountyFinalized event for submission ${input.submissionId.toString()}`,
    )
  }

  const payoutSubmissionId = toBigInt(
    payoutEvent.args.submissionId,
    "BountyPaid.submissionId",
  )
  if (payoutSubmissionId !== input.submissionId) {
    throw new Error(
      `BountyPaid submission mismatch: expected ${input.submissionId.toString()} received ${payoutSubmissionId.toString()}`,
    )
  }

  const payoutAuditor = normalizeAddress(
    String(payoutEvent.args.auditor),
    "BountyPaid.auditor",
  )
  if (!sameAddress(payoutAuditor, input.auditor)) {
    throw new Error(
      `BountyPaid auditor mismatch for submission ${input.submissionId.toString()}`,
    )
  }

  const payoutAmount = toBigInt(payoutEvent.args.amount, "BountyPaid.amount")
  if (payoutAmount <= 0n) {
    throw new Error(
      `BountyPaid amount must be positive for submission ${input.submissionId.toString()}`,
    )
  }
  if (input.submission.payoutAmount !== payoutAmount) {
    throw new Error(
      `Submission payoutAmount mismatch for submission ${input.submissionId.toString()}`,
    )
  }

  const finalizedSubmissionId = toBigInt(
    finalizedEvent.args.submissionId,
    "BountyFinalized.submissionId",
  )
  if (finalizedSubmissionId !== input.submissionId) {
    throw new Error(
      `BountyFinalized submission mismatch: expected ${input.submissionId.toString()} received ${finalizedSubmissionId.toString()}`,
    )
  }

  if (input.auditorStats) {
    if (input.auditorStats.paidCount < 1n) {
      throw new Error(
        `Auditor stats paidCount must be positive for submission ${input.submissionId.toString()}`,
      )
    }
    if (input.auditorStats.totalPaidWei < payoutAmount) {
      throw new Error(
        `Auditor stats totalPaidWei must cover payout amount for submission ${input.submissionId.toString()}`,
      )
    }
  }

  return {
    submissionId: input.submissionId,
    auditor: normalizeAddress(input.auditor, "auditor"),
    payoutAmount,
    payoutTxHash: getEventTransactionHash(payoutEvent, undefined, "BountyPaid"),
    payoutEventIndex: toEventIndex(payoutEvent.logIndex, "BountyPaid.logIndex"),
    finalizedTxHash: getEventTransactionHash(
      finalizedEvent,
      undefined,
      "BountyFinalized",
    ),
    finalizedEventIndex: toEventIndex(
      finalizedEvent.logIndex,
      "BountyFinalized.logIndex",
    ),
  }
}

export function createBountyHubClient(params: {
  address: AddressString
  transport: BountyHubTransport
}) {
  const { address, transport } = params

  return {
    registerProjectV2(input: RegisterProjectV2Input): Promise<RegistrationWorkflowTrigger> {
      return transport
        .writeContract(buildRegisterProjectV2Request(address, input))
        .then((hash) => transport.waitForTransactionReceipt(hash))
        .then((receipt) => extractRegistrationWorkflowTrigger(receipt))
    },

    readProject(projectId: bigint): Promise<BountyHubProject> {
      return transport.readContract<BountyHubProject>(
        buildReadProjectRequest(address, projectId),
      )
    },

    readSubmission(submissionId: bigint): Promise<BountyHubSubmission> {
      return transport.readContract<BountyHubSubmission>(
        buildReadSubmissionRequest(address, submissionId),
      )
    },

    async scanCommittedSubmissionsByProject(
      projectId: bigint,
    ): Promise<CommittedSubmissionScanEntry[]> {
      const logs = await transport.getEvents(
        buildCommittedSubmissionScanByProjectQuery(address, projectId),
      )
      return normalizeCommittedSubmissionScan(logs)
    },

    async scanCommittedSubmissionsByAuditor(
      auditor: AddressString,
    ): Promise<CommittedSubmissionScanEntry[]> {
      const logs = await transport.getEvents(
        buildCommittedSubmissionScanByAuditorQuery(address, auditor),
      )
      return normalizeCommittedSubmissionScan(logs)
    },

    async findRevealWorkflowTrigger(
      submissionId: bigint,
    ): Promise<RevealWorkflowTrigger> {
      const logs = await transport.getEvents(
        buildRevealTriggerQuery(address, submissionId),
      )
      return extractRevealWorkflowTrigger(logs)
    },

    async findVerificationEvent(
      submissionId: bigint,
    ): Promise<BountyHubEventLog<"PoCVerified">> {
      const logs = await transport.getEvents(
        buildVerifiedEventQuery(address, submissionId),
      )
      return getLatestEvent(logs, "PoCVerified")
    },

    async readTerminalPayoutEvidence(input: {
      submissionId: bigint
      auditor: AddressString
      localPaidFlag?: boolean
      auditorStats?: BountyHubAuditorStats
    }): Promise<TerminalPayoutEvidence> {
      const [submission, payoutLogs, finalizedLogs] = await Promise.all([
        transport.readContract<BountyHubSubmission>(
          buildReadSubmissionRequest(address, input.submissionId),
        ),
        transport.getEvents(buildPayoutEventQuery(address, input.submissionId)),
        transport.getEvents(buildFinalizedEventQuery(address, input.submissionId)),
      ])

      const payoutEvent = payoutLogs.length > 0
        ? getLatestEvent(payoutLogs, "BountyPaid")
        : undefined
      const finalizedEvent = finalizedLogs.length > 0
        ? getLatestEvent(finalizedLogs, "BountyFinalized")
        : undefined

      return assertTerminalPayoutEvidence({
        submissionId: input.submissionId,
        auditor: input.auditor,
        submission,
        payoutEvent,
        finalizedEvent,
        auditorStats: input.auditorStats,
        localPaidFlag: input.localPaidFlag,
      })
    },
  }
}
