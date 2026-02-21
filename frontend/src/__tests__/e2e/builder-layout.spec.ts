import { test, expect } from '@playwright/test'

const MOBILE_EVIDENCE_PATH = '../.sisyphus/evidence/task-3-layout-mobile.png'
const DESKTOP_EVIDENCE_PATH = '../.sisyphus/evidence/task-3-layout-desktop.png'

type ScrollOwner = {
  tag: string
  id: string | null
  scrollOwner: string | null
  className: string
  overflowY: string
  scrollHeight: number
  clientHeight: number
  clipsViewport: boolean
}

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

async function collectScrollOwners(page: import('@playwright/test').Page): Promise<ScrollOwner[]> {
  return page.evaluate(() => {
    const isScrollable = (el: Element) => {
      const style = window.getComputedStyle(el)
      const overflowY = style.overflowY
      const canScroll = overflowY === 'auto' || overflowY === 'scroll'
      const node = el as HTMLElement
      if (node.getAttribute('data-builder-scroll-owner') === 'primary') {
        return canScroll
      }
      return canScroll && node.scrollHeight > node.clientHeight + 1
    }

    const clipsViewport = (el: Element) => {
      let node: HTMLElement | null = el.parentElement
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node)
        if (style.overflowY === 'hidden' || style.overflow === 'hidden') {
          return true
        }
        node = node.parentElement
      }
      return false
    }

    return Array.from(document.querySelectorAll('[data-builder-scroll-owner], main, section, .container'))
      .filter(isScrollable)
      .map((el) => {
        const node = el as HTMLElement
        const style = window.getComputedStyle(el)
        return {
          tag: el.tagName.toLowerCase(),
          id: node.id || null,
          scrollOwner: node.getAttribute('data-builder-scroll-owner'),
          className: node.className,
          overflowY: style.overflowY,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          clipsViewport: clipsViewport(el)
        }
      })
  })
}

test.describe('Builder layout regression', () => {
  test('mobile has single unclipped primary scroll container', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('#builder')).toBeVisible()

    await page.getByRole('button', { name: navStepButtonName('REVIEW') }).click()
    await expect(page.getByText(stepTitleByLabel.REVIEW)).toBeVisible()

    const owners = await collectScrollOwners(page)
    expect(owners.length).toBe(1)
    expect(owners[0]?.clipsViewport).toBe(false)
    expect(owners[0]?.scrollOwner).toBe('primary')

    await expect(page.getByRole('button', { name: '[ CONNECT_WALLET ]' })).toBeVisible()
    await page.screenshot({ path: MOBILE_EVIDENCE_PATH, fullPage: true })
  })

  test('desktop can traverse target to review without clipping controls', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('#builder')).toBeVisible()

    const orderedSteps = ['TARGET', 'CONDITIONS', 'TRANSACTIONS', 'IMPACT', 'REVIEW'] as const
    for (const step of orderedSteps) {
      await page.getByRole('button', { name: navStepButtonName(step) }).click()
      await expect(page.getByText(stepTitleByLabel[step])).toBeVisible()
    }

    const owners = await collectScrollOwners(page)
    expect(owners.length).toBe(1)
    expect(owners[0]?.clipsViewport).toBe(false)
    expect(owners[0]?.scrollOwner).toBe('primary')

    await expect(page.getByRole('button', { name: '[ CONNECT_WALLET ]' })).toBeVisible()
    await page.screenshot({ path: DESKTOP_EVIDENCE_PATH, fullPage: true })
  })
})
