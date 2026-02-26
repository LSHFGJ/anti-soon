export type KeyProvisioningMode = "manual"

export type KeyProvisioningConfig = {
  keyProvisioningMode: KeyProvisioningMode
  keySecretPrefix: string
  oasisChain: string
}

export type ProjectKeyProvisioningMetadata = {
  mode: KeyProvisioningMode
  projectId: bigint
  owner: `0x${string}`
  secretId: string
  oasisChain: string
  instructions: string
}

function normalizeOwner(owner: string): `0x${string}` {
  return owner.toLowerCase() as `0x${string}`
}

export function buildProjectKeyProvisioningMetadata(
  projectId: bigint,
  owner: string,
  config: KeyProvisioningConfig
): ProjectKeyProvisioningMetadata {
  const normalizedOwner = normalizeOwner(owner)
  const secretId = `${config.keySecretPrefix}${projectId.toString()}`

  return {
    mode: config.keyProvisioningMode,
    projectId,
    owner: normalizedOwner,
    secretId,
    oasisChain: config.oasisChain,
    instructions:
      "Provision private key to DON secret store out-of-band using secretId and owner-bound access control.",
  }
}

export function validatePrivateKeyHex(privateKey: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(privateKey)
}

export function createSafeProvisioningLogs(
  metadata: ProjectKeyProvisioningMetadata
): string[] {
  return [
    `Keygen provisioning required: mode=${metadata.mode}, projectId=${metadata.projectId}, secretId=${metadata.secretId}`,
    `Keygen access model: owner=${metadata.owner}, oasisChain=${metadata.oasisChain}`,
    `Keygen instructions: ${metadata.instructions}`,
    "Keygen policy: private key material is never logged by this workflow.",
  ]
}
