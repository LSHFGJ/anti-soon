import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type LandingTimingEvidence = {
  heroVisibleMs: number
  ctaHref: string | null
  ctaNavigatedPath: string
  reducedMotion: {
    cyberGridAnimationName: string
    heroTransformStable: boolean
    heroAnimationCount: number
  }
}

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const timingEvidencePath = resolve(evidenceDir, 'task-12-landing-timing.json')
const reducedMotionScreenshotPath = resolve(evidenceDir, 'task-12-reduced-motion.png')

test.describe('Landing timing and reduced-motion budget', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test('landing hero is immediately visible, CTA routes to builder, and reduced-motion disables continuous animation', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })

    const navStart = Date.now()
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const heroTitle = page.getByRole('heading', { name: /ANTI-SOON/i })
    await expect(heroTitle).toBeVisible({ timeout: 1500 })
    const heroVisibleMs = Date.now() - navStart

    const submitCta = page.getByRole('link', { name: 'Submit PoC' })
    await expect(submitCta).toBeVisible()
    const ctaHref = await submitCta.getAttribute('href')

    await submitCta.click()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/builder')
    const ctaNavigatedPath = new URL(page.url()).pathname

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /ANTI-SOON/i })).toBeVisible({ timeout: 1500 })

    const cyberGridAnimationName = await page.locator('.cyber-grid-bg').first().evaluate((el) => {
      return window.getComputedStyle(el).animationName
    })

    const heroWord = page.locator('h1 span').filter({ hasText: 'ANTI-SOON' }).first()
    await expect(heroWord).toBeVisible()

    const before = await heroWord.evaluate((el) => window.getComputedStyle(el).transform)
    await page.waitForTimeout(300)
    const after = await heroWord.evaluate((el) => window.getComputedStyle(el).transform)
    const heroTransformStable = before === after

    const heroAnimationCount = await heroWord.evaluate((el) => el.getAnimations().length)

    expect(cyberGridAnimationName).toBe('none')
    expect(heroTransformStable).toBe(true)
    expect(heroAnimationCount).toBe(0)

    await page.screenshot({ path: reducedMotionScreenshotPath, fullPage: true })

    const evidence: LandingTimingEvidence = {
      heroVisibleMs,
      ctaHref,
      ctaNavigatedPath,
      reducedMotion: {
        cyberGridAnimationName,
        heroTransformStable,
        heroAnimationCount,
      },
    }

    await writeFile(timingEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  })
})
