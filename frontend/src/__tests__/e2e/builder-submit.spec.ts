import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STEP_SWITCH_P95_MS = 400
const INPUT_TO_PAINT_P95_MS = 500

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const baselineJsonPath = resolve(evidenceDir, 'task-1-builder-baseline.json')
const baselineErrorLogPath = resolve(evidenceDir, 'task-1-builder-baseline-error.log')

const stepTitleByLabel: Record<string, string> = {
  TARGET: '// STEP_01: TARGET',
  CONDITIONS: '// STEP_02: CONDITIONS',
  TRANSACTIONS: '// STEP_03: ATTACK VECTOR',
  IMPACT: '// STEP_04: IMPACT',
  REVIEW: '// STEP_05: REVIEW & SUBMIT'
}

function navStepButtonName(label: string): RegExp {
  return new RegExp(`(?:^|\\s)${label}$`)
}

const stepTransitionSamples: number[] = []
const inputToPaintSamples: number[] = []

function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index]
}

async function waitForPaint(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolvePaint) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
      })
  )
}

async function measureInputToPaintSample(page: Page, value: string): Promise<number> {
  return page.evaluate(async ({ nextValue }: { nextValue: string }) => {
    const input = document.querySelector<HTMLInputElement>('input[placeholder="0x..."]')
    if (!input) {
      throw new Error('Target input not found for input-to-paint baseline')
    }

    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    if (!valueSetter) {
      throw new Error('Unable to resolve native HTMLInputElement value setter')
    }

    const start = performance.now()
    valueSetter.call(input, nextValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise<void>((resolvePaint) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
    })
    return performance.now() - start
  }, { nextValue: value })
}

async function measureStepSwitchSample(page: Page, label: string): Promise<number> {
  return page.evaluate(async ({ nextLabel }: { nextLabel: string }) => {
    const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().replace('✓', '').replace(/>/g, '').trim()
    const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((button) =>
      button.classList.contains('wizard-step') || Boolean(button.getAttribute('aria-label'))
    )

    const targetButton = candidates.find((button) =>
      normalize(button.getAttribute('aria-label')) === nextLabel || normalize(button.textContent) === nextLabel
    )

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

test.describe('Builder + Submit baseline', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(baselineErrorLogPath, '', 'utf8')
  })

  test.afterAll(async () => {
    const stepP95 = p95(stepTransitionSamples)
    const inputP95 = p95(inputToPaintSamples)

    const payload = {
      task: 'task-1-builder-submit-baseline',
      thresholds: {
        stepSwitchP95Ms: STEP_SWITCH_P95_MS,
        inputToPaintP95Ms: INPUT_TO_PAINT_P95_MS
      },
      measured: {
        stepSwitchP95Ms: Number(stepP95.toFixed(2)),
        inputToPaintP95Ms: Number(inputP95.toFixed(2)),
        stepSwitchSamplesMs: stepTransitionSamples.map((v) => Number(v.toFixed(2))),
        inputToPaintSamplesMs: inputToPaintSamples.map((v) => Number(v.toFixed(2)))
      },
      assertions: {
        stepSwitchWithinThreshold: stepP95 <= STEP_SWITCH_P95_MS,
        inputToPaintWithinThreshold: inputP95 <= INPUT_TO_PAINT_P95_MS
      }
    }

    await writeFile(baselineJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  })

  test('captures route entry and step-switch p95 baseline', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('#builder')).toBeVisible()
    await expect(page.getByText(stepTitleByLabel.TARGET)).toBeVisible()

    const transitionPlan = ['CONDITIONS', 'TRANSACTIONS', 'IMPACT', 'REVIEW', 'TARGET'] as const
    for (const label of transitionPlan) {
      await measureStepSwitchSample(page, label)
      await expect(page.getByText(stepTitleByLabel[label])).toBeVisible()
      await waitForPaint(page)
    }

    for (let round = 0; round < 2; round++) {
      for (const label of transitionPlan) {
        const sample = await measureStepSwitchSample(page, label)
        await expect(page.getByText(stepTitleByLabel[label])).toBeVisible()
        await waitForPaint(page)
        stepTransitionSamples.push(sample)
      }
    }

    const measuredP95 = p95(stepTransitionSamples)
    expect(measuredP95).toBeLessThanOrEqual(STEP_SWITCH_P95_MS)
  })

  test('captures input-to-paint p95 and submit feedback path baseline', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')

    const targetInput = page.getByPlaceholder('0x...')
    await expect(targetInput).toBeVisible()

    for (let i = 0; i < 8; i++) {
      const value = `0x${String(i + 1).repeat(40)}`
      const sample = await measureInputToPaintSample(page, value)
      await expect(targetInput).toHaveValue(value)
      inputToPaintSamples.push(sample)
    }

    const measuredP95 = p95(inputToPaintSamples)
    expect(measuredP95).toBeLessThanOrEqual(INPUT_TO_PAINT_P95_MS)

    await page.getByRole('button', { name: navStepButtonName('REVIEW') }).click()
    await expect(page.getByText(stepTitleByLabel.REVIEW)).toBeVisible()
    await expect(page.getByRole('button', { name: '[ COMMIT ]' })).toBeVisible()
    await expect(page.getByRole('button', { name: '[ CONNECT_WALLET ]' })).toHaveCount(0)
  })

  test('logs intentional selector failure for baseline reliability checks', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')

    const missingSelector = '[data-testid="intentional-missing-selector"]'
    const observedError = await page
      .locator(missingSelector)
      .waitFor({ timeout: 250 })
      .then(() => null)
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)))

    expect(observedError).not.toBeNull()

    const line = JSON.stringify({ selector: missingSelector, observedError })
    await appendFile(baselineErrorLogPath, `${line}\n`, 'utf8')
    expect((observedError ?? '').length).toBeGreaterThan(0)
  })
})
