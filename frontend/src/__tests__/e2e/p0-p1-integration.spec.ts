import { expect, test } from '@playwright/test'
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
  type Hex
} from 'viem'
import { BOUNTY_HUB_V2_ABI } from '../../config'

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const perfEvidencePath = resolve(evidenceDir, 'task-15-compute-perf.json')

const BUILDER_STEP_P95_BUDGET_MS = 100
const LEADERBOARD_READY_BUDGET_MS = 1500
const DASHBOARD_READY_BUDGET_MS = 1200

const payoutsPerAuditor = 5
const auditorCount = 24
const submissionCount = payoutsPerAuditor * auditorCount

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
          { name: 'callData', type: 'bytes' }
        ]
      }
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' }
        ]
      }
    ]
  }
] as const

const bountyPaidEvent = {
  type: 'event',
  name: 'BountyPaid',
  inputs: [
    { indexed: true, name: 'submissionId', type: 'uint256' },
    { indexed: true, name: 'auditor', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' }
  ]
} as const

const submissionSelector = encodeFunctionData({
  abi: BOUNTY_HUB_V2_ABI,
  functionName: 'submissions',
  args: [0n]
}).slice(0, 10) as Hex

const multicallSelector = encodeFunctionData({
  abi: MULTICALL3_ABI,
  functionName: 'aggregate3',
  args: [[]]
}).slice(0, 10) as Hex

function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index]
}

function shortAddr(index: number): Hex {
  return (`0x${index.toString(16).padStart(40, '0')}`) as Hex
}

function buildSubmissionTuple(submissionId: bigint): readonly [Hex, bigint, Hex, string, Hex, Hex, bigint, bigint, number, bigint, number, bigint, bigint, boolean, Hex, bigint] {
  const severity = Number(submissionId % 5n)
  const payoutAmount = (1_000_000_000_000_000n * (submissionId % 9n + 1n))
  const auditorIndex = Number((submissionId - 1n) % BigInt(auditorCount)) + 1
  const auditor = shortAddr(auditorIndex)

  return [
    auditor,
    1n,
    `0x${'ab'.repeat(32)}` as Hex,
    `oasis://mock/submission-${submissionId.toString()}`,
    `0x${'00'.repeat(32)}` as Hex,
    `0x${'00'.repeat(32)}` as Hex,
    1_900_000_000n + submissionId,
    1_900_000_500n + submissionId,
    4,
    payoutAmount,
    severity,
    payoutAmount,
    0n,
    false,
    shortAddr(0),
    0n
  ]
}

function buildPayoutLogs() {
  const logs = []

  for (let i = 1; i <= submissionCount; i += 1) {
    const submissionId = BigInt(i)
    const auditor = shortAddr(((i - 1) % auditorCount) + 1)
    const amount = 1_000_000_000_000_000n * BigInt((i % 7) + 1)

    const topics = encodeEventTopics({
      abi: [bountyPaidEvent],
      eventName: 'BountyPaid',
      args: { submissionId, auditor }
    }) as readonly Hex[]

    logs.push({
      address: shortAddr(48879),
      topics,
      data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
      blockNumber: toHex(18_100_000n + submissionId),
      transactionHash: keccak256(stringToHex(`payout-tx-${i}`)),
      transactionIndex: toHex(i),
      blockHash: keccak256(stringToHex(`payout-block-${i}`)),
      logIndex: toHex(i),
      removed: false
    })
  }

  return logs
}

async function installLeaderboardRpcMock(page: import('@playwright/test').Page) {
  const payoutLogs = buildPayoutLogs()
  let lastGetLogsFromBlock: string | null = null

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

      if (call.method === 'eth_getLogs') {
        const firstParam = (call.params?.[0] ?? {}) as { fromBlock?: string }
        lastGetLogsFromBlock = firstParam.fromBlock ?? null
        return { jsonrpc: '2.0', id: call.id, result: payoutLogs }
      }

      if (call.method === 'eth_call') {
        const params = call.params ?? []
        const requestData = ((params[0] ?? {}) as { data?: Hex }).data ?? ('0x' as Hex)
        const selector = requestData.slice(0, 10).toLowerCase()

        if (selector === multicallSelector.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: MULTICALL3_ABI, data: requestData })
          const calls = Array.isArray(decoded.args?.[0]) ? decoded.args[0] : []

          const result = calls.map((aggregateCall) => {
            const callData = typeof aggregateCall === 'object' && aggregateCall !== null && 'callData' in aggregateCall
              ? (aggregateCall as { callData: Hex }).callData
              : ('0x' as Hex)

            if (callData.slice(0, 10).toLowerCase() !== submissionSelector.toLowerCase()) {
              return { success: false, returnData: '0x' as Hex }
            }

            const decodedSubmission = decodeFunctionData({ abi: BOUNTY_HUB_V2_ABI, data: callData })
            const submissionId = Array.isArray(decodedSubmission.args) ? (decodedSubmission.args[0] as bigint) : 0n

            return {
              success: true,
              returnData: encodeFunctionResult({
                abi: BOUNTY_HUB_V2_ABI,
                functionName: 'submissions',
                result: buildSubmissionTuple(submissionId)
              })
            }
          })

          return {
            jsonrpc: '2.0',
            id: call.id,
            result: encodeFunctionResult({
              abi: MULTICALL3_ABI,
              functionName: 'aggregate3',
              result
            })
          }
        }
      }

      return {
        jsonrpc: '2.0',
        id: call.id,
        error: { code: -32601, message: `Unhandled method ${call.method}` }
      }
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Array.isArray(body) ? responses : responses[0])
    })
  })

  return {
    getLastGetLogsFromBlock: () => lastGetLogsFromBlock
  }
}

const stepSwitchSamplesMs: number[] = []

async function measureStepSwitchSample(page: import('@playwright/test').Page, label: string) {
  return page.evaluate(async ({ nextLabel }: { nextLabel: string }) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((button) =>
      button.classList.contains('wizard-step') || Boolean(button.getAttribute('aria-label'))
    )
    const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().replace('✓', '').replace(/>/g, '').trim()
    const target = buttons.find((button) =>
      normalize(button.getAttribute('aria-label')) === nextLabel || normalize(button.textContent) === nextLabel
    )

    if (!target) {
      throw new Error(`Step button not found: ${nextLabel}`)
    }

    const start = performance.now()
    target.click()
    await new Promise<void>((resolvePaint) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
    })
    return performance.now() - start
  }, { nextLabel: label })
}

test.describe('Task 15 P0/P1 integration + compute perf gates', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test('keeps builder step-switch responsive and preserves integration paths', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('#builder')).toBeVisible()

    for (const step of ['CONDITIONS', 'TRANSACTIONS', 'IMPACT', 'REVIEW', 'TARGET'] as const) {
      const sample = await measureStepSwitchSample(page, step)
      stepSwitchSamplesMs.push(sample)
    }

    const measuredP95 = p95(stepSwitchSamplesMs)
    expect(measuredP95).toBeLessThanOrEqual(BUILDER_STEP_P95_BUDGET_MS)

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('link', { name: 'Submit PoC' }).click()
    await expect(page).toHaveURL(/\/builder/)
  })

  test('captures dashboard and leaderboard readiness budgets', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'DASHBOARD', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CONNECT WALLET' })).toBeVisible()

    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'DASHBOARD', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CONNECT WALLET' })).toBeVisible()
    const dashboardReadyMs = await page.evaluate(() => Math.round(performance.now()))

    await page.unroute('**/*')
    const rpcInspector = await installLeaderboardRpcMock(page)

    await page.goto('/leaderboard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'LEADERBOARD' })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(auditorCount)
    await expect(rows.first()).toBeVisible()
    await expect.poll(() => rpcInspector.getLastGetLogsFromBlock() ?? '0x0').toBe('0x0')
    const leaderboardReadyMs = await page.evaluate(() => Math.round(performance.now()))

    expect(dashboardReadyMs).toBeLessThanOrEqual(DASHBOARD_READY_BUDGET_MS)
    expect(leaderboardReadyMs).toBeLessThanOrEqual(LEADERBOARD_READY_BUDGET_MS)

    const payload = {
      task: 'task-15-dashboard-leaderboard-compute-perf',
      thresholds: {
        builderStepSwitchP95Ms: BUILDER_STEP_P95_BUDGET_MS,
        dashboardReadyMs: DASHBOARD_READY_BUDGET_MS,
        leaderboardReadyMs: LEADERBOARD_READY_BUDGET_MS
      },
      measured: {
        builderStepSwitchP95Ms: Number(p95(stepSwitchSamplesMs).toFixed(2)),
        builderStepSwitchSamplesMs: stepSwitchSamplesMs.map((value) => Number(value.toFixed(2))),
        dashboardReadyMs,
        leaderboardReadyMs,
        leaderboardRowCount: auditorCount
      },
      assertions: {
        builderStepSwitchWithinBudget: p95(stepSwitchSamplesMs) <= BUILDER_STEP_P95_BUDGET_MS,
        dashboardReadyWithinBudget: dashboardReadyMs <= DASHBOARD_READY_BUDGET_MS,
        leaderboardReadyWithinBudget: leaderboardReadyMs <= LEADERBOARD_READY_BUDGET_MS
      }
    }

    await writeFile(perfEvidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  })
})
