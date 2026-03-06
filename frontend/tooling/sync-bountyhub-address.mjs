import fs from 'node:fs'
import path from 'node:path'

const checkOnly = process.argv.includes('--check')

const frontendDir = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(frontendDir, '..')

const canonicalConfigPath = path.join(repoRoot, 'workflow/verify-poc/config.staging.json')
const frontendConfigPath = path.join(frontendDir, 'src/config.ts')
const alignedWorkflowPaths = [
  path.join(repoRoot, 'workflow/vnet-init/config.staging.json'),
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function ensureAddress(address) {
  if (typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid bountyHubAddress: ${address}`)
  }
}

function syncFrontendConfig(address) {
  const current = fs.readFileSync(frontendConfigPath, 'utf8')
  const pattern = /(const DEFAULT_BOUNTY_HUB_ADDRESS\s*=\s*)(['"])[^'"]+\2/
  if (!pattern.test(current)) {
    throw new Error('Could not locate DEFAULT_BOUNTY_HUB_ADDRESS in frontend config')
  }

  const updated = current.replace(pattern, (_, prefix, quote) => {
    return `${prefix}${quote}${address}${quote}`
  })

  if (updated === current) {
    return false
  }

  if (!checkOnly) {
    fs.writeFileSync(frontendConfigPath, updated, 'utf8')
  }

  return true
}

function syncWorkflowConfig(filePath, address) {
  if (!fs.existsSync(filePath)) {
    return false
  }

  const current = readJson(filePath)
  if (current.bountyHubAddress === address) {
    return false
  }

  if (!checkOnly) {
    writeJson(filePath, { ...current, bountyHubAddress: address })
  }

  return true
}

function main() {
  const canonical = readJson(canonicalConfigPath)
  const address = canonical.bountyHubAddress
  ensureAddress(address)

  const changed = []

  if (syncFrontendConfig(address)) {
    changed.push(path.relative(repoRoot, frontendConfigPath))
  }

  for (const workflowPath of alignedWorkflowPaths) {
    if (syncWorkflowConfig(workflowPath, address)) {
      changed.push(path.relative(repoRoot, workflowPath))
    }
  }

  if (checkOnly && changed.length > 0) {
    console.error(`BountyHub address drift detected against ${path.relative(repoRoot, canonicalConfigPath)}:`)
    for (const file of changed) {
      console.error(`- ${file}`)
    }
    process.exit(1)
  }

  if (changed.length === 0) {
    console.log(`BountyHub address already aligned: ${address}`)
    return
  }

  const mode = checkOnly ? 'would update' : 'updated'
  console.log(`BountyHub address ${mode}: ${address}`)
  for (const file of changed) {
    console.log(`- ${file}`)
  }
}

main()
