import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

type PageShellEvidence = {
  path: string
  primaryOwnerTag: string
  primaryOwnerClass: string
  primaryOwnerIsRoot: boolean
  documentHasVerticalOverflow: boolean
  verticalScrollableOwners: number
  primaryOwnerCanScroll: boolean
  footerVisibleAfterScroll: boolean
}

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const crossPageEvidencePath = resolve(evidenceDir, 'task-4-shell-cross-page.json')
const desktopScreenshotPath = resolve(evidenceDir, 'task-4-shell-desktop.png')

const targetPages = ['/explorer', '/dashboard', '/leaderboard', '/submission/1', '/docs'] as const

async function captureShellEvidence(path: string, page: import('@playwright/test').Page): Promise<PageShellEvidence> {
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('main').first()).toBeVisible()
  await expect(page.locator('footer')).toBeVisible()

  const metrics = await page.evaluate(() => {
    const docOwner = document.scrollingElement as HTMLElement
    const all = Array.from(document.querySelectorAll<HTMLElement>('body, main, main *'))
    const verticalOwners = all.filter((el) => {
      const style = window.getComputedStyle(el)
      if (!(style.overflowY === 'auto' || style.overflowY === 'scroll')) return false
      if (el.clientHeight < 120) return false
      return el.scrollHeight > el.clientHeight + 8
    })

    const documentHasVerticalOverflow = docOwner.scrollHeight > docOwner.clientHeight + 8
    if (documentHasVerticalOverflow) {
      verticalOwners.push(docOwner)
    }

    const bestOwner = verticalOwners.sort(
      (a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight)
    )[0] ?? docOwner

    const ownerTag = bestOwner.tagName.toLowerCase()
    const ownerClass = bestOwner.className || ''
    const ownerIsRoot = bestOwner === document.documentElement || bestOwner === document.body || bestOwner === docOwner

    const beforeScroll = bestOwner === docOwner ? window.scrollY : bestOwner.scrollTop
    if (bestOwner === docOwner) {
      window.scrollTo(0, document.body.scrollHeight)
    } else {
      bestOwner.scrollTop = bestOwner.scrollHeight
    }
    const afterScroll = bestOwner === docOwner ? window.scrollY : bestOwner.scrollTop

    const footer = document.querySelector('footer')
    let footerVisible = false
    if (footer) {
      const rect = footer.getBoundingClientRect()
      footerVisible = rect.top < window.innerHeight && rect.bottom > 0
    }

    return {
      primaryOwnerTag: ownerTag,
      primaryOwnerClass: ownerClass,
      primaryOwnerIsRoot: ownerIsRoot,
      documentHasVerticalOverflow,
      verticalScrollableOwners: verticalOwners.length,
      primaryOwnerCanScroll: afterScroll > beforeScroll,
      footerVisibleAfterScroll: footerVisible,
    }
  })

  return {
    path,
    ...metrics,
  }
}

test.describe('Cross-page shell regression', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test('mobile reachability keeps a single primary scroll owner', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    const records: PageShellEvidence[] = []

    for (const path of targetPages) {
      const evidence = await captureShellEvidence(path, page)
      records.push(evidence)

      if (path === '/docs') {
        await expect(page.locator('[data-docs-route="page"]')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Docs Overview' })).toBeVisible()
      }

      if (evidence.verticalScrollableOwners === 0) {
        expect(evidence.documentHasVerticalOverflow).toBe(false)
      } else {
        expect(evidence.verticalScrollableOwners).toBe(1)
        expect(evidence.primaryOwnerCanScroll).toBe(true)
      }
      expect(evidence.footerVisibleAfterScroll).toBe(true)
    }

    await writeFile(
      crossPageEvidencePath,
      `${JSON.stringify({ task: 'task-4-shell-cross-page', viewport: '390x844', records }, null, 2)}\n`,
      'utf8'
    )
  })

  test('desktop dense table pages remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })

    await page.goto('/leaderboard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'LEADERBOARD' })).toBeVisible()

    const leaderboardRows = page.locator('tbody tr')
    if (await leaderboardRows.count()) {
      await leaderboardRows.first().hover()
      await expect(leaderboardRows.first()).toBeVisible()
    }

    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    const dashboardTitle = page.getByText('AUDITOR DASHBOARD').first()
    const dashboardMain = page.getByText('DASHBOARD').first()
    const titleVisible = await dashboardTitle.isVisible().catch(() => false)
    if (!titleVisible) {
      await expect(dashboardMain).toBeVisible()
    } else {
      await expect(dashboardTitle).toBeVisible()
    }

    const dashboardRows = page.locator('tbody tr')
    if (await dashboardRows.count()) {
      await dashboardRows.first().hover()
      await expect(dashboardRows.first()).toBeVisible()
    }

    await page.screenshot({ path: desktopScreenshotPath, fullPage: true })
  })
})
