import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  toHex,
  type Hex,
} from 'viem'
import { BOUNTY_HUB_V2_ABI } from '../../config'

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const finalQaDir = resolve(repoRoot, '.sisyphus/evidence/final-qa')
const manifestPath = resolve(finalQaDir, 'final-wave-f3-manifest.json')
const summaryPath = resolve(finalQaDir, 'final-wave-f3-summary.log')
const screenshotName = 'final-wave-f3-route-leaderboard.png'
const screenshotPath = resolve(finalQaDir, screenshotName)

const payoutsPerAuditor = 5
const auditorCount = 24

const MULTICALL3_ABI = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const

const leaderboardAuditorsSelector = encodeFunctionData({
  abi: BOUNTY_HUB_V2_ABI,
  functionName: 'getLeaderboardAuditors',
  args: [0n, 100n],
}).slice(0, 10) as Hex

const auditorStatsSelector = encodeFunctionData({
  abi: BOUNTY_HUB_V2_ABI,
  functionName: 'getAuditorStats',
  args: [shortAddr(1)],
}).slice(0, 10) as Hex

const multicallSelector = encodeFunctionData({
  abi: MULTICALL3_ABI,
  functionName: 'aggregate3',
  args: [[]],
}).slice(0, 10) as Hex

function shortAddr(index: number): Hex {
  return (`0x${index.toString(16).padStart(40, '0')}`) as Hex
}

function buildAuditorStats(auditor: Hex): readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] {
  const auditorIndex = BigInt(Number.parseInt(auditor.slice(-2), 16))
  const paidCount = BigInt(payoutsPerAuditor)
  const totalEarned = 1_000_000_000_000_000n * (25n - auditorIndex) * paidCount

  return [
    paidCount,
    paidCount,
    0n,
    paidCount,
    BigInt((Number(auditorIndex) % 3) + 1),
    BigInt(Number(auditorIndex) % 2),
    totalEarned,
    auditorIndex - 1n,
  ]
}

async function installLeaderboardMock(page: import('@playwright/test').Page) {
  const auditors = Array.from({ length: auditorCount }, (_, index) => shortAddr(index + 1))

  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') {
      await route.continue()
      return
    }

    let body: unknown
    try {
      body = request.postDataJSON()
    } catch {
      await route.continue()
      return
    }

    const payload = Array.isArray(body) ? body : [body]
    const rpcRequests = payload.filter((item) => typeof item === 'object' && item !== null && 'method' in item)

    if (rpcRequests.length === 0) {
      await route.continue()
      return
    }

    const responses = rpcRequests.map((rpcRequest) => {
      const call = rpcRequest as { id: number | string; method: string; params?: unknown[] }

      if (call.method === 'eth_chainId') {
        return { jsonrpc: '2.0', id: call.id, result: '0xaa36a7' }
      }

      if (call.method === 'net_version') {
        return { jsonrpc: '2.0', id: call.id, result: '11155111' }
      }

      if (call.method === 'eth_blockNumber') {
        return { jsonrpc: '2.0', id: call.id, result: toHex(18_100_999n) }
      }

      if (call.method === 'eth_call') {
        const params = call.params ?? []
        const requestData = ((params[0] ?? {}) as { data?: Hex }).data ?? ('0x' as Hex)
        const selector = requestData.slice(0, 10).toLowerCase()

        if (selector === leaderboardAuditorsSelector.toLowerCase()) {
          return {
            jsonrpc: '2.0',
            id: call.id,
            result: encodeFunctionResult({
              abi: BOUNTY_HUB_V2_ABI,
              functionName: 'getLeaderboardAuditors',
              result: [auditors, 0n],
            }),
          }
        }

        if (selector === multicallSelector.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: MULTICALL3_ABI, data: requestData })
          const calls = Array.isArray(decoded.args?.[0]) ? decoded.args[0] : []

          const result = calls.map((aggregateCall) => {
            const callData = typeof aggregateCall === 'object' && aggregateCall !== null && 'callData' in aggregateCall
              ? (aggregateCall as { callData: Hex }).callData
              : ('0x' as Hex)

            if (callData.slice(0, 10).toLowerCase() !== auditorStatsSelector.toLowerCase()) {
              return { success: false, returnData: '0x' as Hex }
            }

            const decodedAuditor = decodeFunctionData({ abi: BOUNTY_HUB_V2_ABI, data: callData })
            const auditor = Array.isArray(decodedAuditor.args) ? (decodedAuditor.args[0] as Hex) : shortAddr(1)

            return {
              success: true,
              returnData: encodeFunctionResult({
                abi: BOUNTY_HUB_V2_ABI,
                functionName: 'getAuditorStats',
                result: buildAuditorStats(auditor),
              }),
            }
          })

          return {
            jsonrpc: '2.0',
            id: call.id,
            result: encodeFunctionResult({
              abi: MULTICALL3_ABI,
              functionName: 'aggregate3',
              result,
            }),
          }
        }
      }

      return {
        jsonrpc: '2.0',
        id: call.id,
        error: { code: -32601, message: `Unhandled method ${call.method}` },
      }
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Array.isArray(body) ? responses : responses[0]),
    })
  })
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

test('final F3 leaderboard table rendering is green with deterministic fixture', async ({ page }) => {
  await mkdir(finalQaDir, { recursive: true })
  await installLeaderboardMock(page)

  await page.goto('/leaderboard')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('heading', { name: 'LEADERBOARD' })).toBeVisible()
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(auditorCount)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const rawManifest = await readFile(manifestPath, 'utf8').catch(() => '')
  const manifest = rawManifest
    ? JSON.parse(rawManifest)
    : {
        qaWave: 'F3-final-manual-qa',
        artifactRoot: '.sisyphus/evidence/final-qa',
        baseUrl: 'http://127.0.0.1:4173',
        generatedAt: new Date().toISOString(),
        routes: [],
        flows: [],
        files: {
          screenshots: [screenshotName],
          manifest: 'final-wave-f3-manifest.json',
          summaryLog: 'final-wave-f3-summary.log',
        },
        verdict: 'partial',
      }

  const routes = ensureArray<{ route: string; status: string; checks: string[]; screenshot: string }>(manifest.routes)
  const flows = ensureArray<{ name: string; status: string; details: string }>(manifest.flows)

  const routeIndex = routes.findIndex((entry) => entry.route === '/leaderboard')
  const routeEntry = {
    route: '/leaderboard',
    status: 'pass',
    checks: [
      'leaderboard route available',
      'leaderboard table rendered with deterministic payout fixture',
    ],
    screenshot: screenshotName,
  }

  if (routeIndex >= 0) {
    routes[routeIndex] = routeEntry
  } else {
    routes.push(routeEntry)
  }

  const flowIndex = flows.findIndex((entry) => entry.name === 'leaderboard_table_rendering')
  const flowEntry = {
    name: 'leaderboard_table_rendering',
    status: 'pass',
    details: `Rendered leaderboard table with ${auditorCount} mocked auditor rows`,
  }

  if (flowIndex >= 0) {
    flows[flowIndex] = flowEntry
  } else {
    flows.push(flowEntry)
  }

  const screenshotSet = new Set<string>(ensureArray<string>(manifest.files?.screenshots))
  screenshotSet.add(screenshotName)

  const hasFailures = flows.some((entry) => entry.status !== 'pass')

  const updatedManifest = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    routes,
    flows,
    files: {
      ...(manifest.files ?? {}),
      screenshots: Array.from(screenshotSet).sort(),
      manifest: 'final-wave-f3-manifest.json',
      summaryLog: 'final-wave-f3-summary.log',
    },
    verdict: hasFailures ? 'partial' : 'pass',
  }

  await writeFile(manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`, 'utf8')

  const routeLines = routes
    .map((route) => `- ${route.route}: ${route.status.toUpperCase()} (${route.screenshot})`)
    .join('\n')
  const flowLines = flows
    .map((flow) => `- ${flow.name}: ${flow.status.toUpperCase()}${flow.details ? ` (${flow.details})` : ''}`)
    .join('\n')

  const summary = [
    'Final Wave F3 Manual QA Summary',
    `Generated: ${updatedManifest.generatedAt}`,
    `Base URL: ${updatedManifest.baseUrl}`,
    `Artifact Root: ${updatedManifest.artifactRoot}`,
    '',
    'Route Checks',
    routeLines,
    '',
    'Flow Checks',
    flowLines,
    '',
    `Final Verdict: ${String(updatedManifest.verdict).toUpperCase()}`,
    '',
  ].join('\n')

  await writeFile(summaryPath, summary, 'utf8')
})
