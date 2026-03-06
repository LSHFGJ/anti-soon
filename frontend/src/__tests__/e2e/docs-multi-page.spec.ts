import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function expectDocsPage(page: Page, slug: string, heading: string) {
  const docsShell = page.locator('[data-docs-route="page"]')
  const docsPageNav = page.locator('[data-docs-nav="pages"]')

  await expect(docsShell).toBeVisible()
  await expect(docsShell).toHaveAttribute('data-docs-page', slug)
  await expect(docsPageNav).toBeVisible()
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
}

test.describe('Docs multi-page flows', () => {
  test('docs landing links navigate into technical and user child pages', async ({ page }) => {
    await page.goto('/docs')
    await expectDocsPage(page, 'overview', 'Docs Overview')

    const developerQuickPaths = page.locator('section#developer-quick-paths')
    await expect(developerQuickPaths.locator('a[href="/docs/architecture"]')).toBeVisible()
    await developerQuickPaths.locator('a[href="/docs/architecture"]').click()

    await expect(page).toHaveURL(/\/docs\/architecture$/)
    await expectDocsPage(page, 'architecture', 'Architecture')
    await expect(page.locator('[data-docs-nav="pages"]').getByRole('link', { name: 'Architecture' })).toHaveAttribute('aria-current', 'page')

    await page.goto('/docs')
    await expectDocsPage(page, 'overview', 'Docs Overview')

    const userWorkflows = page.locator('section#user-workflows')
    await expect(userWorkflows.locator('a[href="/docs/create-project"]')).toBeVisible()
    await userWorkflows.locator('a[href="/docs/create-project"]').click()

    await expect(page).toHaveURL(/\/docs\/create-project$/)
    await expectDocsPage(page, 'create-project', 'Create a Project')
    await expect(page.locator('[data-docs-nav="pages"]').getByRole('link', { name: 'Create a Project' })).toHaveAttribute('aria-current', 'page')
  })

  test('direct child routes load the expected docs pages', async ({ page }) => {
    for (const [path, slug, heading] of [
      ['/docs/architecture', 'architecture', 'Architecture'],
      ['/docs/getting-started', 'getting-started', 'Getting Started'],
    ] as const) {
      await page.goto(path)

      await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`))
      await expectDocsPage(page, slug, heading)
      await expect(page.locator('[data-docs-nav="pages"]').getByRole('link', { name: heading })).toHaveAttribute('href', path)
    }
  })

  test('page-local anchor routes land on the requested operations section', async ({ page }) => {
    await page.goto('/docs/operations#incident-response')
    await expectDocsPage(page, 'operations', 'Operations')
    await expect.poll(() => new URL(page.url()).hash).toBe('#incident-response')

    const incidentResponseSection = page.locator('#incident-response')
    await expect(incidentResponseSection).toBeVisible()
    await expect
      .poll(async () => incidentResponseSection.evaluate((element) => Math.round(element.getBoundingClientRect().top)))
      .toBeLessThan(180)
  })

  test('unknown child routes fall back to the docs overview shell', async ({ page }) => {
    await page.goto('/docs/unknown')

    await expect(page).toHaveURL(/\/docs$/)
    await expectDocsPage(page, 'overview', 'Docs Overview')
    await expect(page.locator('[data-docs-route="fallback"]')).toHaveCount(0)
  })

  test('mobile navbar still enters the docs portal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const mobileNav = page.locator('nav div.md\\:hidden').first()
    await expect(mobileNav).toBeVisible()

    const docsLink = mobileNav.getByRole('link', { name: '[DOCS]' })
    await expect(docsLink).toBeVisible()
    await docsLink.click()

    await expect.poll(() => new URL(page.url()).pathname).toBe('/docs')
    await expectDocsPage(page, 'overview', 'Docs Overview')
  })
})
