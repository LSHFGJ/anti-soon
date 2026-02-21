import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STEP_SWITCH_P95_MS = 100

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const latencyJsonPath = resolve(evidenceDir, 'task-8-step-latency.json')
const statePersistImagePath = resolve(evidenceDir, 'task-8-step-state-persist.png')

const stepTitleByLabel: Record<string, string> = {
  TARGET: '// STEP_01: TARGET',
  CONDITIONS: '// STEP_02: CONDITIONS',
  TRANSACTIONS: '// STEP_03: ATTACK VECTOR',
  IMPACT: '// STEP_04: IMPACT',
  REVIEW: '// STEP_05: REVIEW & SUBMIT'
}

type StepLabel = keyof typeof stepTitleByLabel

const stepTransitionSamples: number[] = []
let targetInputReferenceStable = false

function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index]
}

async function waitForPaint(page: import('@playwright/test').Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolvePaint) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
      })
  )
}

async function measureStepSwitchSample(page: import('@playwright/test').Page, label: StepLabel): Promise<number> {
  return page.evaluate(async ({ nextLabel }: { nextLabel: StepLabel }) => {
    const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()
    const normalizeStepLabel = (value: string) => normalize(value).replace('✓', '').replace(/>/g, '').trim()

    const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((button) =>
      button.className.includes('min-w-[100px]')
    )

    const targetButton = candidates.find((button) => normalizeStepLabel(button.textContent ?? '') === nextLabel)
    if (!targetButton) {
      throw new Error(`Step button not found for label: ${nextLabel}`)
    }

    const start = performance.now()
    targetButton.click()

    await new Promise<void>((resolvePaint) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
    })

    return performance.now() - start
  }, { nextLabel: label })
}

test.describe('Builder step-switch orchestration latency', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test.afterAll(async () => {
    const measuredP95 = p95(stepTransitionSamples)
    const payload = {
      task: 'task-8-step-latency',
      thresholds: {
        stepSwitchP95Ms: STEP_SWITCH_P95_MS
      },
      measured: {
        stepSwitchP95Ms: Number(measuredP95.toFixed(2)),
        stepSwitchSamplesMs: stepTransitionSamples.map((v) => Number(v.toFixed(2)))
      },
      assertions: {
        stepSwitchWithinThreshold: measuredP95 <= STEP_SWITCH_P95_MS,
        targetInputReferenceStable
      }
    }

    await writeFile(latencyJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  })

  test('captures step-switch p95 under threshold', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('#builder')).toBeVisible()
    await expect(page.getByText(stepTitleByLabel.TARGET)).toBeVisible()

    const plan: StepLabel[] = ['CONDITIONS', 'TRANSACTIONS', 'IMPACT', 'REVIEW', 'TARGET']
    for (let round = 0; round < 3; round++) {
      for (const label of plan) {
        const sample = await measureStepSwitchSample(page, label)
        await expect(page.getByText(stepTitleByLabel[label])).toBeVisible()
        await waitForPaint(page)
        stepTransitionSamples.push(sample)
      }
    }

    const measuredP95 = p95(stepTransitionSamples)
    expect(measuredP95).toBeLessThanOrEqual(STEP_SWITCH_P95_MS)
  })

  test('rapid switching preserves target value without remounting target input', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText(stepTitleByLabel.TARGET)).toBeVisible()

    const targetInput = page.getByPlaceholder('0x...')
    await expect(targetInput).toBeVisible()

    const persistedValue = '0x1111111111111111111111111111111111111111'
    await targetInput.fill(persistedValue)
    await expect(targetInput).toHaveValue(persistedValue)

    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder="0x..."]')
      if (!input) {
        throw new Error('Unable to mark target input identity')
      }
      ;(window as Window & { __task8TargetInput?: HTMLInputElement }).__task8TargetInput = input
    })

    const rapidPlan: StepLabel[] = ['CONDITIONS', 'TARGET', 'TRANSACTIONS', 'TARGET', 'IMPACT', 'TARGET', 'REVIEW', 'TARGET']
    for (const label of rapidPlan) {
      await page.getByRole('button', { name: new RegExp(`(?:^|\\s)${label}$`) }).click()
      await expect(page.getByText(stepTitleByLabel[label])).toBeVisible()
      await waitForPaint(page)
    }

    await expect(targetInput).toHaveValue(persistedValue)

    targetInputReferenceStable = await page.evaluate(() => {
      const current = document.querySelector<HTMLInputElement>('input[placeholder="0x..."]')
      const previous = (window as Window & { __task8TargetInput?: HTMLInputElement }).__task8TargetInput
      return Boolean(current && previous && current === previous)
    })

    expect(targetInputReferenceStable).toBe(true)
    await page.screenshot({ path: statePersistImagePath, fullPage: true })
  })
})
