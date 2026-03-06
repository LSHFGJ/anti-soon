import { expect, test } from '@playwright/test'

const EXPECTED_PAGE_NAV = [
  ['Docs Overview', '/docs'],
  ['Architecture', '/docs/architecture'],
  ['Data Flow', '/docs/data-flow'],
  ['API & Contracts', '/docs/api-and-contracts'],
  ['Security', '/docs/security'],
  ['Operations', '/docs/operations'],
  ['Troubleshooting', '/docs/troubleshooting'],
  ['Getting Started', '/docs/getting-started'],
  ['Submit a PoC', '/docs/submit-poc'],
  ['Explore Projects', '/docs/explore-projects'],
  ['Create a Project', '/docs/create-project'],
  ['Dashboard & Leaderboard', '/docs/dashboard-and-leaderboard'],
  ['Glossary', '/docs/glossary'],
] as const

test.describe('Docs route hardening', () => {
  test('docs urls resolve to the page shell and unknown subpaths return to /docs', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('[data-docs-route="page"]')).toBeVisible()
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'overview')
    await expect(page.getByRole('heading', { name: 'Docs Overview' })).toBeVisible()
    const docsPageNav = page.locator('[data-docs-nav="pages"]')
    await expect(docsPageNav).toBeVisible()
    await expect(docsPageNav.getByRole('link')).toHaveCount(EXPECTED_PAGE_NAV.length)
    await expect(docsPageNav.getByRole('link')).toHaveText(EXPECTED_PAGE_NAV.map(([label]) => label))
    for (const [label, href] of EXPECTED_PAGE_NAV) {
      await expect(docsPageNav.getByRole('link', { name: label })).toHaveAttribute('href', href)
    }

    await page.goto('/docs/')
    await expect(page).toHaveURL(/\/docs$/)
    await expect(page.locator('[data-docs-route="page"]')).toBeVisible()
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'overview')
    await expect(page.getByRole('heading', { name: 'Docs Overview' })).toBeVisible()

    await page.goto('/docs#overview')
    await expect(page.locator('#overview')).toBeVisible()
    await expect
      .poll(async () => page.locator('#overview').evaluate((element) => Math.round(element.getBoundingClientRect().top)))
      .toBeLessThan(180)

    await page.goto('/docs/architecture')
    await expect(page).toHaveURL(/\/docs\/architecture$/)
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'architecture')
    await expect(page.locator('[data-docs-nav="pages"]')).toBeVisible()

    await page.goto('/docs/operations')
    await expect(page).toHaveURL(/\/docs\/operations$/)
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'operations')
    await expect(page.locator('[data-docs-nav="pages"]')).toBeVisible()

    await page.goto('/docs/api-and-contracts')
    await expect(page).toHaveURL(/\/docs\/api-and-contracts$/)
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'api-and-contracts')
    await expect(page.locator('[data-docs-nav="pages"]')).toBeVisible()

    await page.goto('/docs/getting-started/')
    await expect(page).toHaveURL(/\/docs\/getting-started$/)
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'getting-started')
    await expect(page.locator('[data-docs-nav="pages"]')).toBeVisible()

    await page.goto('/docs/submit-poc')
    await expect(page).toHaveURL(/\/docs\/submit-poc$/)
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'submit-poc')
    await expect(page.locator('[data-docs-nav="pages"]')).toBeVisible()

    await page.goto('/docs/create-project')
    await expect(page).toHaveURL(/\/docs\/create-project$/)
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'create-project')
    await expect(page.locator('[data-docs-nav="pages"]')).toBeVisible()

    await page.goto('/docs/dashboard-and-leaderboard')
    await expect(page).toHaveURL(/\/docs\/dashboard-and-leaderboard$/)
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'dashboard-and-leaderboard')
    await expect(page.locator('[data-docs-nav="pages"]')).toBeVisible()

    await page.goto('/docs/unknown')
    await expect(page).toHaveURL(/\/docs$/)
    await expect(page.locator('[data-docs-route="page"]')).toBeVisible()
    await expect(page.locator('[data-docs-route="page"]')).toHaveAttribute('data-docs-page', 'overview')
    await expect(page.locator('[data-docs-route="fallback"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Docs Overview' })).toBeVisible()
  })
})
