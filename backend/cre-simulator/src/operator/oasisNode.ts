import { randomBytes } from "node:crypto"

export type HexString = `0x${string}`
export type AddressString = `0x${string}`

const HASH_REGEX = /^0x[a-f0-9]{64}$/
const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/
const OASIS_ENVELOPE_VERSION = "anti-soon.oasis-envelope.v1" as const
const OASIS_TX_PAYLOAD_VERSION = "anti-soon.oasis-tx.v2" as const
const DEFAULT_SAPPHIRE_RPC_URL = "https://testnet.sapphire.oasis.io"
const DEFAULT_OASIS_CHAIN = "oasis-sapphire-testnet"
const OASIS_STORAGE_ABI_HR = [
  "function write(string slotId, string payload)",
] as const
const ENVELOPE_HASH_PARAMS_HR =
  "string version, string chain, address contractAddr, string slotId, bytes32 ciphertextHash, bytes32 ivHash"

type EnvRecord = Record<string, string | undefined>

type OasisSignerAccount = {
  address: AddressString
} & Record<string, unknown>

type OasisPointer = {
  chain: string
  contract: AddressString
  slotId: string
}

type OasisPublicClient = {
  waitForTransactionReceipt: (args: {
    hash: HexString
  }) => Promise<{ status?: string }>
}

type OasisWalletClient = {
  writeContract: (args: {
    address: AddressString
    abi: readonly unknown[]
    functionName: "write"
    args: [string, string]
  }) => Promise<HexString>
}

type OasisHashRuntime = {
  encodePacked: (
    types: readonly string[],
    values: readonly unknown[],
  ) => HexString
  keccak256: (value: Uint8Array | HexString) => HexString
  toBytes: (value: string) => Uint8Array
}

type OasisDirectWriteRuntime = OasisHashRuntime & {
  accountFromPrivateKey: (privateKey: HexString) => OasisSignerAccount
  createPublicClient: (args: { transport: unknown }) => OasisPublicClient
  createWalletClient: (args: {
    account: OasisSignerAccount
    transport: unknown
  }) => OasisWalletClient
  encodeAbiParameters: (params: unknown, values: readonly unknown[]) => HexString
  http: (url: string) => unknown
  parseAbi: (items: readonly string[]) => readonly unknown[]
  parseAbiParameters: (params: string) => unknown
}

export type OasisUploadDependencies = {
  fetchFn?: typeof fetch
  accountFromPrivateKey?: (privateKey: HexString) => OasisSignerAccount
  createPublicClient?: (rpcUrl: string) => OasisPublicClient
  createWalletClient?: (args: {
    rpcUrl: string
    account: OasisSignerAccount
  }) => OasisWalletClient
  encodeAbiParameters?: (params: unknown, values: readonly unknown[]) => HexString
  encodePacked?: (
    types: readonly string[],
    values: readonly unknown[],
  ) => HexString
  keccak256?: (value: Uint8Array | HexString) => HexString
  parseAbi?: (items: readonly string[]) => readonly unknown[]
  parseAbiParameters?: (params: string) => unknown
  toBytes?: (value: string) => Uint8Array
}

export type OasisUploadInput = {
  pocJson: string
  projectId: bigint
  auditor: AddressString
  env: EnvRecord
}

export type OasisUploadResult = {
  cipherURI: string
  oasisTxHash: HexString
}

function normalizeHash(value: string, label: string): HexString {
  const normalized = value.toLowerCase()
  if (!HASH_REGEX.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex string`)
  }

  return normalized as HexString
}

function normalizeAddress(value: string, label: string): AddressString {
  const normalized = value.trim().toLowerCase()
  if (!ADDRESS_REGEX.test(normalized)) {
    throw new Error(`${label} must be a valid Ethereum address`)
  }

  return normalized as AddressString
}

function requiredEnv(env: EnvRecord, key: string): string {
  const value = env[key]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value
}

function resolveStorageContract(env: EnvRecord): AddressString {
  const raw = env.VITE_OASIS_STORAGE_CONTRACT?.trim() ?? ""
  if (!raw) {
    throw new Error(
      "VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.",
    )
  }

  try {
    return normalizeAddress(raw, "VITE_OASIS_STORAGE_CONTRACT")
  } catch {
    throw new Error(
      "VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.",
    )
  }
}

function resolveOasisChain(env: EnvRecord): string {
  return env.VITE_OASIS_CHAIN?.trim() || DEFAULT_OASIS_CHAIN
}

function resolveSapphireRpcUrl(env: EnvRecord): string {
  return env.DEMO_OPERATOR_OASIS_RPC_URL?.trim() || DEFAULT_SAPPHIRE_RPC_URL
}

function parsePoCJson(pocJson: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(pocJson) as unknown
  } catch {
    throw new Error("PoC JSON must be valid JSON object")
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("PoC JSON must be valid JSON object")
  }

  return parsed as Record<string, unknown>
}

async function loadOasisHashRuntime(): Promise<OasisHashRuntime> {
  const viem = (await import("viem")) as {
    encodePacked: OasisHashRuntime["encodePacked"]
    keccak256: OasisHashRuntime["keccak256"]
    toBytes: OasisHashRuntime["toBytes"]
  }

  return {
    encodePacked: viem.encodePacked,
    keccak256: viem.keccak256,
    toBytes: viem.toBytes,
  }
}

async function resolveHashRuntime(
  deps: Pick<OasisUploadDependencies, "encodePacked" | "keccak256" | "toBytes"> = {},
): Promise<OasisHashRuntime> {
  if (deps.encodePacked && deps.keccak256 && deps.toBytes) {
    return {
      encodePacked: deps.encodePacked,
      keccak256: deps.keccak256,
      toBytes: deps.toBytes,
    }
  }

  const runtime = await loadOasisHashRuntime()
  return {
    encodePacked: deps.encodePacked ?? runtime.encodePacked,
    keccak256: deps.keccak256 ?? runtime.keccak256,
    toBytes: deps.toBytes ?? runtime.toBytes,
  }
}

async function loadOasisDirectWriteRuntime(): Promise<OasisDirectWriteRuntime> {
  const viem = (await import("viem")) as {
    createPublicClient: OasisDirectWriteRuntime["createPublicClient"]
    createWalletClient: OasisDirectWriteRuntime["createWalletClient"]
    encodeAbiParameters: OasisDirectWriteRuntime["encodeAbiParameters"]
    encodePacked: OasisDirectWriteRuntime["encodePacked"]
    http: OasisDirectWriteRuntime["http"]
    keccak256: OasisDirectWriteRuntime["keccak256"]
    parseAbi: OasisDirectWriteRuntime["parseAbi"]
    parseAbiParameters: OasisDirectWriteRuntime["parseAbiParameters"]
    toBytes: OasisDirectWriteRuntime["toBytes"]
  }
  const accounts = (await import("viem/accounts")) as {
    privateKeyToAccount: OasisDirectWriteRuntime["accountFromPrivateKey"]
  }

  return {
    accountFromPrivateKey: accounts.privateKeyToAccount,
    createPublicClient: viem.createPublicClient,
    createWalletClient: viem.createWalletClient,
    encodeAbiParameters: viem.encodeAbiParameters,
    encodePacked: viem.encodePacked,
    http: viem.http,
    keccak256: viem.keccak256,
    parseAbi: viem.parseAbi,
    parseAbiParameters: viem.parseAbiParameters,
    toBytes: viem.toBytes,
  }
}

async function resolveDirectWriteRuntime(
  deps: OasisUploadDependencies,
): Promise<{
  accountFromPrivateKey: (privateKey: HexString) => OasisSignerAccount
  createPublicClient: (rpcUrl: string) => OasisPublicClient
  createWalletClient: (args: {
    rpcUrl: string
    account: OasisSignerAccount
  }) => OasisWalletClient
  encodeAbiParameters: (params: unknown, values: readonly unknown[]) => HexString
  keccak256: (value: Uint8Array | HexString) => HexString
  parseAbi: (items: readonly string[]) => readonly unknown[]
  parseAbiParameters: (params: string) => unknown
  toBytes: (value: string) => Uint8Array
}> {
  const hasFullInjection = Boolean(
    deps.accountFromPrivateKey
      && deps.createPublicClient
      && deps.createWalletClient
      && deps.encodeAbiParameters
      && deps.keccak256
      && deps.parseAbi
      && deps.parseAbiParameters
      && deps.toBytes,
  )

  if (hasFullInjection) {
    return {
      accountFromPrivateKey: deps.accountFromPrivateKey,
      createPublicClient: deps.createPublicClient,
      createWalletClient: deps.createWalletClient,
      encodeAbiParameters: deps.encodeAbiParameters,
      keccak256: deps.keccak256,
      parseAbi: deps.parseAbi,
      parseAbiParameters: deps.parseAbiParameters,
      toBytes: deps.toBytes,
    }
  }

  const runtime = await loadOasisDirectWriteRuntime()

  return {
    accountFromPrivateKey: deps.accountFromPrivateKey ?? runtime.accountFromPrivateKey,
    createPublicClient:
      deps.createPublicClient
      ?? ((rpcUrl) => runtime.createPublicClient({ transport: runtime.http(rpcUrl) })),
    createWalletClient:
      deps.createWalletClient
      ?? ((args) =>
        runtime.createWalletClient({
          account: args.account,
          transport: runtime.http(args.rpcUrl),
        })),
    encodeAbiParameters: deps.encodeAbiParameters ?? runtime.encodeAbiParameters,
    keccak256: deps.keccak256 ?? runtime.keccak256,
    parseAbi: deps.parseAbi ?? runtime.parseAbi,
    parseAbiParameters: deps.parseAbiParameters ?? runtime.parseAbiParameters,
    toBytes: deps.toBytes ?? runtime.toBytes,
  }
}

function buildPointer(
  input: OasisUploadInput,
  storageContract: AddressString,
  runtime: Pick<OasisDirectWriteRuntime, "keccak256" | "toBytes">,
): OasisPointer {
  const seed = `${input.projectId.toString()}:${input.auditor}:${input.pocJson}`
  const slotId = `slot-${runtime.keccak256(runtime.toBytes(seed)).slice(2, 18)}`

  return {
    chain: resolveOasisChain(input.env),
    contract: storageContract,
    slotId,
  }
}

function computeEnvelopeHash(args: {
  pointer: OasisPointer
  pocHash: HexString
  runtime: Pick<
    OasisDirectWriteRuntime,
    "encodeAbiParameters" | "keccak256" | "parseAbiParameters"
  >
}): HexString {
  const encoded = args.runtime.encodeAbiParameters(
    args.runtime.parseAbiParameters(ENVELOPE_HASH_PARAMS_HR),
    [
      OASIS_ENVELOPE_VERSION,
      args.pointer.chain,
      args.pointer.contract,
      args.pointer.slotId,
      args.pocHash,
      args.pocHash,
    ],
  )

  return normalizeHash(args.runtime.keccak256(encoded), "envelopeHash")
}

function buildDirectWritePayload(args: {
  input: OasisUploadInput
  pointer: OasisPointer
  envelopeHash: HexString
  pocHash: HexString
  parsedPoC: Record<string, unknown>
  writer: AddressString
}): string {
  return JSON.stringify({
    ok: true,
    version: OASIS_TX_PAYLOAD_VERSION,
    projectId: args.input.projectId.toString(),
    auditor: args.writer,
    pointer: args.pointer,
    envelope: {
      version: OASIS_ENVELOPE_VERSION,
      pointer: args.pointer,
      ciphertext: {
        ciphertextHash: args.pocHash,
        ivHash: args.pocHash,
      },
    },
    envelopeHash: args.envelopeHash,
    poc: args.parsedPoC,
  })
}

async function uploadViaDirectSapphireWrite(
  input: OasisUploadInput,
  deps: OasisUploadDependencies,
): Promise<OasisUploadResult> {
  const storageContract = resolveStorageContract(input.env)
  const runtime = await resolveDirectWriteRuntime(deps)
  const privateKey = normalizeHash(
    requiredEnv(input.env, "DEMO_AUDITOR_PRIVATE_KEY"),
    "DEMO_AUDITOR_PRIVATE_KEY",
  )
  const account = runtime.accountFromPrivateKey(privateKey)
  const accountAddress = normalizeAddress(account.address, "DEMO_AUDITOR_PRIVATE_KEY")
  if (accountAddress !== input.auditor) {
    throw new Error("DEMO_AUDITOR_PRIVATE_KEY does not match the configured auditor address")
  }

  const rpcUrl = resolveSapphireRpcUrl(input.env)
  const publicClient = runtime.createPublicClient(rpcUrl)
  const walletClient = runtime.createWalletClient({
    rpcUrl,
    account,
  })

  const parsedPoC = parsePoCJson(input.pocJson)
  const canonicalPoCJson = JSON.stringify(parsedPoC)
  const pocHash = normalizeHash(
    runtime.keccak256(runtime.toBytes(canonicalPoCJson)),
    "pocHash",
  )
  const pointer = buildPointer(input, storageContract, runtime)
  const envelopeHash = computeEnvelopeHash({
    pointer,
    pocHash,
    runtime,
  })
  const payloadJson = buildDirectWritePayload({
    input,
    pointer,
    envelopeHash,
    pocHash,
    parsedPoC,
    writer: accountAddress,
  })
  const oasisTxHash = normalizeHash(
    await walletClient.writeContract({
      address: storageContract,
      abi: runtime.parseAbi(OASIS_STORAGE_ABI_HR),
      functionName: "write",
      args: [pointer.slotId, payloadJson],
    }),
    "oasisTxHash",
  )
  const receipt = await publicClient.waitForTransactionReceipt({ hash: oasisTxHash })
  if (receipt.status && receipt.status !== "success") {
    throw new Error(`Sapphire write transaction failed with status ${receipt.status}`)
  }

  return {
    cipherURI: `oasis://${pointer.chain}/${pointer.contract}/${encodeURIComponent(pointer.slotId)}#${envelopeHash}`,
    oasisTxHash,
  }
}

function resolveUploadApiUrl(env: EnvRecord): string | null {
  const candidates = [
    env.DEMO_OPERATOR_OASIS_UPLOAD_API_URL,
    env.VITE_OASIS_UPLOAD_API_URL,
  ]

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return null
}

export function generateRandomSalt(): HexString {
  return `0x${randomBytes(32).toString("hex")}` as HexString
}

export async function computeCommitHashFromCipherUri(
  cipherURI: string,
  auditor: AddressString,
  salt: HexString,
  deps: Pick<OasisUploadDependencies, "encodePacked" | "keccak256" | "toBytes"> = {},
): Promise<HexString> {
  const runtime = await resolveHashRuntime(deps)
  const cipherHash = runtime.keccak256(runtime.toBytes(cipherURI))
  const packed = runtime.encodePacked(
    ["bytes32", "address", "bytes32"],
    [cipherHash, auditor, salt],
  )

  return normalizeHash(runtime.keccak256(packed), "commitHash")
}

export async function uploadPoCToOasis(
  input: OasisUploadInput,
  deps: OasisUploadDependencies = {},
): Promise<OasisUploadResult> {
  const apiUrl = resolveUploadApiUrl(input.env)
  if (!apiUrl) {
    return uploadViaDirectSapphireWrite(input, deps)
  }

  const response = await (deps.fetchFn ?? fetch)(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      poc: input.pocJson,
      projectId: input.projectId.toString(),
      auditor: input.auditor,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(
      `Oasis relayer upload failed (${response.status}): ${message || "empty response"}`,
    )
  }

  const payload = (await response.json()) as Partial<OasisUploadResult>
  if (
    typeof payload.cipherURI !== "string"
    || !payload.cipherURI.startsWith("oasis://")
    || typeof payload.oasisTxHash !== "string"
  ) {
    throw new Error("Oasis relayer response shape is invalid")
  }

  return {
    cipherURI: payload.cipherURI,
    oasisTxHash: normalizeHash(payload.oasisTxHash, "oasisTxHash"),
  }
}
