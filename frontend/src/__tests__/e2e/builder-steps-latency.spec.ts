import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const targetTypingPath = resolve(evidenceDir, 'task-9-target-typing.json')
const transactionsListPath = resolve(evidenceDir, 'task-9-transactions-list.json')
const TARGET_TYPING_P95_BUDGET_MS = 8
const TRANSACTION_LIST_OP_P95_BUDGET_MS = 140

function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index]
}

test.describe('Builder step interaction latency', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test('captures target typing responsiveness evidence', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')

    const targetInput = page.getByPlaceholder('0x...').first()
    await expect(targetInput).toBeVisible()

    const metrics = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder="0x..."]')
      if (!input) {
        throw new Error('target input not found')
      }

      const samples: number[] = []
      const base = '0x1234567890abcdef1234567890abcdef12345678'

      for (let i = 2; i <= base.length; i += 1) {
        const nextValue = base.slice(0, i)
        const start = performance.now()
        input.value = nextValue
        input.dispatchEvent(new Event('input', { bubbles: true }))
        samples.push(performance.now() - start)
      }

      return {
        sampleCount: samples.length,
        samplesMs: samples,
        finalValue: input.value,
      }
    })

    const targetTypingP95Ms = p95(metrics.samplesMs)
    expect(targetTypingP95Ms).toBeLessThanOrEqual(TARGET_TYPING_P95_BUDGET_MS)

    await expect(targetInput).toHaveValue(metrics.finalValue)

    await writeFile(
      targetTypingPath,
      `${JSON.stringify({
        task: 'task-9-target-typing',
        thresholds: {
          targetTypingP95BudgetMs: TARGET_TYPING_P95_BUDGET_MS,
        },
        measured: {
          targetTypingP95Ms: Number(targetTypingP95Ms.toFixed(3)),
          sampleCount: metrics.sampleCount,
          samplesMs: metrics.samplesMs.map((value: number) => Number(value.toFixed(3))),
        },
        assertions: {
          finalValueLength: metrics.finalValue.length,
          finalValuePreserved: metrics.finalValue === '0x1234567890abcdef1234567890abcdef12345678',
          withinBudget: targetTypingP95Ms <= TARGET_TYPING_P95_BUDGET_MS,
        },
      }, null, 2)}\n`,
      'utf8'
    )
  })

  test('captures transactions list operation responsiveness evidence', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /TRANSACTIONS/ }).click()
    await expect(page.getByText('// STEP_03: ATTACK VECTOR')).toBeVisible()

    const metrics = await page.evaluate(async () => {
      const samples: number[] = []
      const addButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
        (button.textContent ?? '').includes('ADD_TRANSACTION')
      )

      if (!addButton) {
        throw new Error('add transaction button not found')
      }

      const waitForPaint = () =>
        new Promise<void>((resolvePaint) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
        })

      for (let i = 0; i < 40; i += 1) {
        const start = performance.now()
        addButton.click()
        await waitForPaint()
        samples.push(performance.now() - start)
      }

      for (let i = 0; i < 20; i += 1) {
        const removeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove transaction"]'))
        const button = removeButtons[removeButtons.length - 1]
        if (!button) {
          break
        }

        const start = performance.now()
        button.click()
        await waitForPaint()
        samples.push(performance.now() - start)
      }

      const transactionCount = document.querySelectorAll('button[aria-label="Remove transaction"]').length

      return {
        sampleCount: samples.length,
        samplesMs: samples,
        transactionCount,
      }
    })

    const transactionListOpP95Ms = p95(metrics.samplesMs)
    expect(transactionListOpP95Ms).toBeLessThanOrEqual(TRANSACTION_LIST_OP_P95_BUDGET_MS)

    await writeFile(
      transactionsListPath,
      `${JSON.stringify({
        task: 'task-9-transactions-list',
        thresholds: {
          transactionListOpP95BudgetMs: TRANSACTION_LIST_OP_P95_BUDGET_MS,
        },
        measured: {
          transactionListOpP95Ms: Number(transactionListOpP95Ms.toFixed(3)),
          sampleCount: metrics.sampleCount,
          samplesMs: metrics.samplesMs.map((value: number) => Number(value.toFixed(3))),
        },
        assertions: {
          remainingTransactions: metrics.transactionCount,
          operationsExecuted: metrics.sampleCount,
          deterministicCount: metrics.transactionCount >= 1,
          withinBudget: transactionListOpP95Ms <= TRANSACTION_LIST_OP_P95_BUDGET_MS,
        },
      }, null, 2)}\n`,
      'utf8'
    )
  })
})
