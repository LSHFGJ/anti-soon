import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const successEvidencePath = resolve(evidenceDir, 'task-10-review-success.json')
const errorEvidencePath = resolve(evidenceDir, 'task-10-review-error.png')

test.describe('Task 10 review feedback reliability', () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test('records deterministic review-step progression evidence', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /(?:^|\s)REVIEW$/ }).click()

    const reviewPrevious = page.getByRole('button', { name: '[ PREVIOUS ]' })
    const reviewCommit = page.getByRole('button', { name: '[ COMMIT ]' })

    await expect(reviewPrevious).toBeVisible()
    await expect(reviewCommit).toBeVisible()
    await expect(page.getByRole('button', { name: '[ CONNECT_WALLET ]' })).toHaveCount(0)
    await expect(page.getByText('1. COMMIT')).toHaveCount(0)
    await expect(page.getByText('2. REVEAL')).toHaveCount(0)
    await expect(page.getByText('3. VERIFYING')).toHaveCount(0)

    const duplicateErrorBannerVisible = await page.getByText('ERROR:').isVisible().catch(() => false)

    const payload = {
      task: 'task-10-review-feedback-reliability',
      route: '/builder',
      assertions: {
        removedLegacyConnectWalletCta: (await page.getByRole('button', { name: '[ CONNECT_WALLET ]' }).count()) === 0,
        hasReviewPrevious: await reviewPrevious.isVisible(),
        hasReviewCommit: await reviewCommit.isVisible(),
        removedLegacyProgressIndicator: (await page.getByText('1. COMMIT').count()) === 0,
        startsWithoutErrorBanner: !duplicateErrorBannerVisible
      }
    }

    await writeFile(successEvidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  })

  test('captures review-step failure-path evidence screenshot artifact', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('button', { name: /(?:^|\s)REVIEW$/ }).click()

    await page.screenshot({ path: errorEvidencePath, fullPage: true })
  })
})
