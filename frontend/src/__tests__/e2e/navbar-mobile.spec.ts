import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const mobileScreenshotPath = resolve(evidenceDir, 'task-11-navbar-mobile.png')
const desktopScreenshotPath = resolve(evidenceDir, 'task-11-navbar-desktop.png')
const isDocsEnabled = process.env.VITE_ENABLE_DOCS?.trim().toLowerCase() === 'true' || process.env.VITE_ENABLE_DOCS?.trim().toLowerCase() === '1'

const NAV_ITEMS = [
  { path: '/', label: 'HOME' },
  { path: '/builder', label: 'BUILDER' },
  { path: '/explorer', label: 'EXPLORER' },
  { path: '/dashboard', label: 'DASHBOARD' },
  { path: '/leaderboard', label: 'LEADERBOARD' },
  ...(isDocsEnabled ? [{ path: '/docs', label: 'DOCS' }] as const : []),
]

test.describe('Navbar mobile docs discoverability', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test('mobile labels are readable and route mapping is correct', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const desktopNav = page.locator('nav .navbar-links').first()
    const mobileNav = page.locator('nav div.md\\:hidden').first()
    await expect(desktopNav).toBeHidden()
    await expect(mobileNav).toBeVisible()

    const renderedLabels = (await mobileNav.locator('a').allTextContents()).map((label) => label.trim())
    expect(renderedLabels).toHaveLength(NAV_ITEMS.length)
    expect(renderedLabels.every((label) => /^\[[A-Z]{4,}\]$/.test(label))).toBe(true)

    const horizontalBoxes = await mobileNav.locator('a').evaluateAll((anchors) =>
      anchors.map((anchor) => {
        const rect = anchor.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
        }
      })
    )

    const overflowMetrics = await mobileNav.locator('a').evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        clientWidth: anchor.clientWidth,
        scrollWidth: anchor.scrollWidth,
      }))
    )

    for (let index = 1; index < horizontalBoxes.length; index += 1) {
      expect(horizontalBoxes[index].left).toBeGreaterThanOrEqual(horizontalBoxes[index - 1].right - 0.5)
    }

    expect(overflowMetrics.every((metric) => metric.scrollWidth <= metric.clientWidth + 0.5)).toBe(true)

    await page.screenshot({ path: mobileScreenshotPath, fullPage: true })

    for (const item of NAV_ITEMS) {
      const link = mobileNav.getByRole('link', { name: `[${item.label}]` })
      await expect(link).toBeVisible()

      const box = await link.boundingBox()
      expect(box).not.toBeNull()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(32)
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(52)

      await link.click()
      await expect.poll(() => new URL(page.url()).pathname).toBe(item.path)

      if (item.path === '/docs') {
        await expect(page.locator('[data-docs-route="page"]')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Docs Overview' })).toBeVisible()
      }

      await expect
        .poll(async () => {
          const activeLink = mobileNav.getByRole('link', { name: `[${item.label}]` })
          return activeLink.evaluate((el) => window.getComputedStyle(el).color)
        })
        .toBe('rgb(124, 58, 237)')
    }
  })

  test('desktop nav semantics remain unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto('/explorer')
    await page.waitForLoadState('networkidle')

    const mobileNav = page.locator('nav div.md\\:hidden').first()
    await expect(mobileNav).toBeHidden()

    for (const item of NAV_ITEMS) {
      await expect(page.locator('a:visible').filter({ hasText: `[${item.label}]` }).first()).toBeVisible()
    }

    const explorerColors = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('nav a'))
      return links
        .filter((link) => link.textContent?.trim() === '[EXPLORER]')
        .filter((link) => {
          const node = link as HTMLElement
          return node.offsetParent !== null
        })
        .map((link) => window.getComputedStyle(link).color)
    })

    expect(explorerColors).toContain('rgb(124, 58, 237)')

    await page.screenshot({ path: desktopScreenshotPath, fullPage: true })
  })
})
