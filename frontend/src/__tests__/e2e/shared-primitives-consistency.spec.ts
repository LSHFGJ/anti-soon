import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const screenshotPath = resolve(evidenceDir, 'task-13-primitives-consistency.png')

test.describe('Task 13 shared primitives consistency', () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test('captures dashboard and submission primitive consistency', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    const dashboardHeading = page.getByRole('heading', { name: 'DASHBOARD', exact: true })
    await expect(dashboardHeading).toBeVisible()

    const dashboardHeaderColor = await dashboardHeading.evaluate((node) => getComputedStyle(node).color)
    expect(dashboardHeaderColor).toBe('rgb(124, 58, 237)')

    await page.goto('/submission/1')
    await page.waitForLoadState('domcontentloaded')

    const submissionHeading = page.getByRole('heading', { name: 'SUBMISSION_#1' })
    await expect(submissionHeading).toBeVisible({ timeout: 20000 })

    const submissionHeaderColor = await submissionHeading.evaluate((node) => getComputedStyle(node).color)
    expect(submissionHeaderColor).toBe('rgb(124, 58, 237)')

    const statusSurface = page.getByTestId('status-banner').first()
    await expect(statusSurface).toBeVisible()

    const variant = await statusSurface.getAttribute('data-status-variant')
    expect(['info', 'success', 'error']).toContain(variant)

    await page.screenshot({ path: screenshotPath, fullPage: true })
  })
})
