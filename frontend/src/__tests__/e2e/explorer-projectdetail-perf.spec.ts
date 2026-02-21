import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  keccak256,
  stringToHex,
  toHex,
  type Hex,
} from 'viem'
import { BOUNTY_HUB_V2_ABI } from '../../config'

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const requestEvidencePath = resolve(evidenceDir, 'task-14-explorer-requests.json')
const projectDetailScreenshotPath = resolve(evidenceDir, 'task-14-projectdetail-correctness.png')

const EXPLORER_HTTP_BUDGET = 4
const PROJECT_DETAIL_HTTP_BUDGET = 5
const EXPLORER_READY_BUDGET_MS = 1500
const PROJECT_DETAIL_READY_BUDGET_MS = 1400

const baseTimestamp = 1_900_000_000n
const shortAddr = (suffix: string) => (`0x000000000000000000000000000000000000${suffix}` as Hex)

const projectRows = [
  {
    id: 0n,
    owner: shortAddr('0011'),
    bountyPool: 4_000_000_000_000_000_000n,
    maxPayoutPerBug: 1_000_000_000_000_000_000n,
    targetContract: shortAddr('0aa0'),
    forkBlock: 5_000_000n,
    active: true,
    mode: 0,
    commitDeadline: 0n,
    revealDeadline: 0n,
    disputeWindow: 86_400n,
    rulesHash: `0x${'11'.repeat(32)}` as Hex,
    projectPublicKey: `0x${'22'.repeat(32)}` as Hex,
  },
  {
    id: 1n,
    owner: shortAddr('0022'),
    bountyPool: 9_000_000_000_000_000_000n,
    maxPayoutPerBug: 3_000_000_000_000_000_000n,
    targetContract: shortAddr('0bb0'),
    forkBlock: 5_500_000n,
    active: true,
    mode: 1,
    commitDeadline: 0n,
    revealDeadline: 0n,
    disputeWindow: 172_800n,
    rulesHash: `0x${'33'.repeat(32)}` as Hex,
    projectPublicKey: `0x${'44'.repeat(32)}` as Hex,
  },
  {
    id: 2n,
    owner: shortAddr('0033'),
    bountyPool: 2_000_000_000_000_000_000n,
    maxPayoutPerBug: 500_000_000_000_000_000n,
    targetContract: shortAddr('0cc0'),
    forkBlock: 6_100_000n,
    active: false,
    mode: 0,
    commitDeadline: 0n,
    revealDeadline: 0n,
    disputeWindow: 86_400n,
    rulesHash: `0x${'55'.repeat(32)}` as Hex,
    projectPublicKey: `0x${'66'.repeat(32)}` as Hex,
  },
  {
    id: 3n,
    owner: shortAddr('0044'),
    bountyPool: 6_000_000_000_000_000_000n,
    maxPayoutPerBug: 2_000_000_000_000_000_000n,
    targetContract: shortAddr('0dd0'),
    forkBlock: 6_600_000n,
    active: true,
    mode: 0,
    commitDeadline: 0n,
    revealDeadline: 0n,
    disputeWindow: 120_000n,
    rulesHash: `0x${'77'.repeat(32)}` as Hex,
    projectPublicKey: `0x${'88'.repeat(32)}` as Hex,
  },
] as const

const rulesByProject = {
  1: {
    maxAttackerSeedWei: 1_000_000_000_000_000_000n,
    maxWarpSeconds: 3_600n,
    allowImpersonation: true,
    thresholds: {
      criticalDrainWei: 5_000_000_000_000_000_000n,
      highDrainWei: 2_000_000_000_000_000_000n,
      mediumDrainWei: 1_000_000_000_000_000_000n,
      lowDrainWei: 100_000_000_000_000_000n,
    },
  },
} as const

const submissionRows = {
  11: [
    shortAddr('0e01'),
    1n,
    `0x${'ab'.repeat(32)}` as Hex,
    'ipfs://poc-11',
    `0x${'00'.repeat(32)}` as Hex,
    `0x${'00'.repeat(32)}` as Hex,
    baseTimestamp,
    0n,
    0,
    0n,
    0,
    0n,
    0n,
    false,
    shortAddr('0e00'),
    0n,
  ],
  12: [
    shortAddr('0e02'),
    1n,
    `0x${'bc'.repeat(32)}` as Hex,
    'ipfs://poc-12',
    `0x${'00'.repeat(32)}` as Hex,
    `0x${'00'.repeat(32)}` as Hex,
    baseTimestamp + 100n,
    baseTimestamp + 200n,
    2,
    1_500_000_000_000_000_000n,
    2,
    750_000_000_000_000_000n,
    baseTimestamp + 1000n,
    false,
    shortAddr('0e00'),
    0n,
  ],
  13: [
    shortAddr('0e03'),
    1n,
    `0x${'cd'.repeat(32)}` as Hex,
    'ipfs://poc-13',
    `0x${'00'.repeat(32)}` as Hex,
    `0x${'00'.repeat(32)}` as Hex,
    baseTimestamp + 300n,
    baseTimestamp + 350n,
    5,
    0n,
    0,
    0n,
    baseTimestamp + 1200n,
    true,
    shortAddr('0e09'),
    100_000_000_000_000_000n,
  ],
} as const

const jsonRpcMethods = {
  ethChainId: 'eth_chainId',
  netVersion: 'net_version',
  blockNumber: 'eth_blockNumber',
  call: 'eth_call',
  getLogs: 'eth_getLogs',
} as const

const measuredReadMethods = new Set<string>([
  jsonRpcMethods.call,
  jsonRpcMethods.getLogs,
  jsonRpcMethods.blockNumber,
])

const pocCommittedEvent = {
  type: 'event',
  name: 'PoCCommitted',
  inputs: [
    { indexed: true, name: 'submissionId', type: 'uint256' },
    { indexed: true, name: 'projectId', type: 'uint256' },
    { indexed: true, name: 'auditor', type: 'address' },
    { indexed: false, name: 'commitHash', type: 'bytes32' },
  ],
} as const

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

type RequestMetrics = {
  explorer: { httpRequests: number; rpcCalls: number; methods: Record<string, number>; readyMs: number }
  projectDetail: { httpRequests: number; rpcCalls: number; methods: Record<string, number>; readyMs: number }
}

function toProjectTuple(id: bigint) {
  const row = projectRows.find((project) => project.id === id)
  if (!row) {
    return [
      shortAddr('0000'),
      0n,
      0n,
      shortAddr('0000'),
      0n,
      false,
      0,
      0n,
      0n,
      0n,
      `0x${'00'.repeat(32)}` as Hex,
      '0x' as Hex,
    ] as const
  }

  return [
    row.owner,
    row.bountyPool,
    row.maxPayoutPerBug,
    row.targetContract,
    row.forkBlock,
    row.active,
    row.mode,
    row.commitDeadline,
    row.revealDeadline,
    row.disputeWindow,
    row.rulesHash,
    row.projectPublicKey,
  ] as const
}

function selectorOf(functionName: 'nextProjectId' | 'projects' | 'projectRules' | 'submissions'): Hex {
  return encodeFunctionData({ abi: BOUNTY_HUB_V2_ABI, functionName, args: functionName === 'nextProjectId' ? [] : [0n] }).slice(0, 10) as Hex
}

function decodeUintArg(data: Hex): bigint {
  const normalized = data.startsWith('0x') ? data.slice(2) : data
  const hexArg = normalized.slice(normalized.length - 64)
  return BigInt(`0x${hexArg}`)
}

function buildCommittedLogs(projectId: bigint) {
  if (projectId !== 1n) return []
  const ids = [11n, 12n, 12n, 13n]
  const auditors = [shortAddr('0e01'), shortAddr('0e02'), shortAddr('0e02'), shortAddr('0e03')]

  return ids.map((submissionId, index) => {
    const eventTopics = encodeEventTopics({
      abi: [pocCommittedEvent],
      eventName: 'PoCCommitted',
      args: {
        submissionId,
        projectId,
        auditor: auditors[index],
      },
    }) as readonly Hex[]

    return {
      address: shortAddr('b00b'),
      topics: eventTopics,
      data: encodeAbiParameters([{ type: 'bytes32' }], [`0x${'aa'.repeat(32)}` as Hex]),
      blockNumber: toHex(18_000_000n + BigInt(index)),
      transactionHash: keccak256(stringToHex(`tx-${index}`)),
      transactionIndex: toHex(index),
      blockHash: keccak256(stringToHex(`block-${index}`)),
      logIndex: toHex(index),
      removed: false,
    }
  })
}

function createRouteMetrics() {
  return {
    httpRequests: 0,
    rpcCalls: 0,
    methods: {} as Record<string, number>,
  }
}

function getBountyCallResult(
  data: Hex,
  selectors: {
    nextProjectSelector: Hex
    projectsSelector: Hex
    rulesSelector: Hex
    submissionsSelector: Hex
  }
): Hex | null {
  const selector = data.slice(0, 10).toLowerCase() as Hex

  if (selector === selectors.nextProjectSelector.toLowerCase()) {
    return encodeFunctionResult({
      abi: BOUNTY_HUB_V2_ABI,
      functionName: 'nextProjectId',
      result: 4n,
    })
  }

  if (selector === selectors.projectsSelector.toLowerCase()) {
    const projectId = decodeUintArg(data)
    return encodeFunctionResult({
      abi: BOUNTY_HUB_V2_ABI,
      functionName: 'projects',
      result: toProjectTuple(projectId),
    })
  }

  if (selector === selectors.rulesSelector.toLowerCase()) {
    const projectId = decodeUintArg(data)
    const row = rulesByProject[Number(projectId) as keyof typeof rulesByProject]
    const fallback = {
      maxAttackerSeedWei: 0n,
      maxWarpSeconds: 0n,
      allowImpersonation: false,
      thresholds: {
        criticalDrainWei: 0n,
        highDrainWei: 0n,
        mediumDrainWei: 0n,
        lowDrainWei: 0n,
      },
    }

    const value = row ?? fallback
    return encodeFunctionResult({
      abi: BOUNTY_HUB_V2_ABI,
      functionName: 'projectRules',
      result: [
        value.maxAttackerSeedWei,
        value.maxWarpSeconds,
        value.allowImpersonation,
        value.thresholds,
      ],
    })
  }

  if (selector === selectors.submissionsSelector.toLowerCase()) {
    const submissionId = Number(decodeUintArg(data))
    const row = submissionRows[submissionId as keyof typeof submissionRows]
    const fallback = [
      shortAddr('0000'),
      0n,
      `0x${'00'.repeat(32)}` as Hex,
      '',
      `0x${'00'.repeat(32)}` as Hex,
      `0x${'00'.repeat(32)}` as Hex,
      0n,
      0n,
      0,
      0n,
      0,
      0n,
      0n,
      false,
      shortAddr('0000'),
      0n,
    ] as const

    return encodeFunctionResult({
      abi: BOUNTY_HUB_V2_ABI,
      functionName: 'submissions',
      result: row ?? fallback,
    })
  }

  return null
}

async function installRpcMock(
  page: import('@playwright/test').Page,
  metrics: { httpRequests: number; rpcCalls: number; methods: Record<string, number> }
) {
  const nextProjectSelector = selectorOf('nextProjectId')
  const projectsSelector = selectorOf('projects')
  const rulesSelector = selectorOf('projectRules')
  const submissionsSelector = selectorOf('submissions')
  const multicallSelector = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: 'aggregate3',
    args: [[]],
  }).slice(0, 10) as Hex

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

    const requests = Array.isArray(body) ? body : [body]
    const rpcRequests = requests.filter((item) => {
      return typeof item === 'object' && item !== null && 'method' in item && 'jsonrpc' in item
    })

    if (rpcRequests.length === 0) {
      await route.continue()
      return
    }

    const measuredRpcRequests = rpcRequests.filter((rpcRequest) => {
      const method = (rpcRequest as { method?: unknown }).method
      return typeof method === 'string' && measuredReadMethods.has(method)
    })

    if (measuredRpcRequests.length > 0) {
      metrics.httpRequests += 1
      metrics.rpcCalls += measuredRpcRequests.length
    }

    const responses = rpcRequests.map((rpcRequest) => {
      const requestRecord = rpcRequest as {
        id: number | string
        method: string
        params?: unknown[]
      }

      if (measuredReadMethods.has(requestRecord.method)) {
        metrics.methods[requestRecord.method] = (metrics.methods[requestRecord.method] ?? 0) + 1
      }

      if (requestRecord.method === jsonRpcMethods.ethChainId) {
        return { jsonrpc: '2.0', id: requestRecord.id, result: '0xaa36a7' }
      }

      if (requestRecord.method === jsonRpcMethods.netVersion) {
        return { jsonrpc: '2.0', id: requestRecord.id, result: '11155111' }
      }

      if (requestRecord.method === jsonRpcMethods.blockNumber) {
        return { jsonrpc: '2.0', id: requestRecord.id, result: toHex(18_000_321n) }
      }

      if (requestRecord.method === jsonRpcMethods.getLogs) {
        const [filter] = requestRecord.params ?? []
        const topics = (filter as { topics?: unknown[] } | undefined)?.topics
        const projectTopic = Array.isArray(topics) ? topics[2] : undefined
        const projectId = typeof projectTopic === 'string' ? BigInt(projectTopic) : 0n
        return { jsonrpc: '2.0', id: requestRecord.id, result: buildCommittedLogs(projectId) }
      }

      if (requestRecord.method === jsonRpcMethods.call) {
        const params = requestRecord.params ?? []
        const callObj = (params[0] ?? {}) as { data?: Hex }
        const data = callObj.data ?? ('0x' as Hex)

        if (data.slice(0, 10).toLowerCase() === multicallSelector.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: MULTICALL3_ABI, data })
          const decodedCalls = Array.isArray(decoded.args?.[0]) ? decoded.args[0] : []
          const returnData = decodedCalls.map((call) => {
            const callData = typeof call === 'object' && call !== null && 'callData' in call
              ? (call as { callData: Hex }).callData
              : ('0x' as Hex)

            const innerResult = getBountyCallResult(callData, {
              nextProjectSelector,
              projectsSelector,
              rulesSelector,
              submissionsSelector,
            })

            return {
              success: Boolean(innerResult),
              returnData: innerResult ?? ('0x' as Hex),
            }
          })

          return {
            jsonrpc: '2.0',
            id: requestRecord.id,
            result: encodeFunctionResult({
              abi: MULTICALL3_ABI,
              functionName: 'aggregate3',
              result: returnData,
            }),
          }
        }

        const directCallResult = getBountyCallResult(data, {
          nextProjectSelector,
          projectsSelector,
          rulesSelector,
          submissionsSelector,
        })

        if (directCallResult) {
          return {
            jsonrpc: '2.0',
            id: requestRecord.id,
            result: directCallResult,
          }
        }
      }

      return {
        jsonrpc: '2.0',
        id: requestRecord.id,
        error: {
          code: -32601,
          message: `Mock does not implement method ${requestRecord.method}`,
        },
      }
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Array.isArray(body) ? responses : responses[0]),
    })
  })
}

test.describe('Explorer + ProjectDetail read path performance', () => {
  test.describe.configure({ mode: 'serial' })

  const metrics: RequestMetrics = {
    explorer: { httpRequests: 0, rpcCalls: 0, methods: {}, readyMs: 0 },
    projectDetail: { httpRequests: 0, rpcCalls: 0, methods: {}, readyMs: 0 },
  }

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test.afterAll(async () => {
    await writeFile(
      requestEvidencePath,
      `${JSON.stringify(
        {
          task: 'task-14-explorer-projectdetail-data-read',
          budgets: {
            explorer: { httpRequests: EXPLORER_HTTP_BUDGET, readyMs: EXPLORER_READY_BUDGET_MS },
            projectDetail: { httpRequests: PROJECT_DETAIL_HTTP_BUDGET, readyMs: PROJECT_DETAIL_READY_BUDGET_MS },
          },
          measured: metrics,
          assertions: {
            explorerWithinHttpBudget: metrics.explorer.httpRequests <= EXPLORER_HTTP_BUDGET,
            projectDetailWithinHttpBudget: metrics.projectDetail.httpRequests <= PROJECT_DETAIL_HTTP_BUDGET,
            explorerReadyWithinBudget: metrics.explorer.readyMs <= EXPLORER_READY_BUDGET_MS,
            projectDetailReadyWithinBudget: metrics.projectDetail.readyMs <= PROJECT_DETAIL_READY_BUDGET_MS,
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    )
  })

  test('keeps request volume low and ready states responsive', async ({ page }) => {
    const explorerCounts = createRouteMetrics()
    await installRpcMock(page, explorerCounts)

    await page.goto('/explorer')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'EXPLORER' })).toBeVisible()
    explorerCounts.httpRequests = 0
    explorerCounts.rpcCalls = 0
    explorerCounts.methods = {}

    await page.goto('/explorer')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'EXPLORER' })).toBeVisible()
    await expect(page.getByText('PROJECT_#0')).toBeVisible()
    await expect(page.getByText('PROJECT_#1')).toBeVisible()
    await expect(page.getByText('PROJECT_#3')).toBeVisible()
    await expect(page.getByText('PROJECT_#2')).toHaveCount(0)

    const explorerReadyMs = await page.evaluate(() => Math.round(performance.now()))

    metrics.explorer = {
      httpRequests: explorerCounts.httpRequests,
      rpcCalls: explorerCounts.rpcCalls,
      methods: explorerCounts.methods,
      readyMs: explorerReadyMs,
    }

    expect(metrics.explorer.httpRequests).toBeLessThanOrEqual(EXPLORER_HTTP_BUDGET)
    expect(metrics.explorer.readyMs).toBeLessThanOrEqual(EXPLORER_READY_BUDGET_MS)

    const projectDetailCounts = createRouteMetrics()
    await page.unroute('**/*')
    await installRpcMock(page, projectDetailCounts)

    await page.goto('/project/1')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'PROJECT #1' })).toBeVisible()
    await expect(page.getByText('SUBMISSIONS [3]')).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(3)

    const detailReadyMs = await page.evaluate(() => Math.round(performance.now()))

    metrics.projectDetail = {
      httpRequests: projectDetailCounts.httpRequests,
      rpcCalls: projectDetailCounts.rpcCalls,
      methods: projectDetailCounts.methods,
      readyMs: detailReadyMs,
    }

    expect(metrics.projectDetail.httpRequests).toBeLessThanOrEqual(PROJECT_DETAIL_HTTP_BUDGET)
    expect(metrics.projectDetail.readyMs).toBeLessThanOrEqual(PROJECT_DETAIL_READY_BUDGET_MS)
  })

  test('preserves visible correctness on project detail after optimized reads', async ({ page }) => {
    const requestCounts = createRouteMetrics()
    await installRpcMock(page, requestCounts)

    await page.goto('/project/1')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByRole('heading', { name: 'PROJECT #1' })).toBeVisible()
    await expect(page.getByText('TARGET:').first()).toBeVisible()
    await expect(page.getByText('SUBMISSIONS [3]')).toBeVisible()
    await expect(page.getByText('UNIQUE')).toHaveCount(0)
    await expect(page.getByText('MULTI')).toBeVisible()

    await page.screenshot({ path: projectDetailScreenshotPath, fullPage: true })
  })
})
