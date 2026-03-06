import { expect, test } from '@playwright/test'

test.describe('Docs route hardening', () => {
  test('docs urls resolve to the page shell and unknown subpaths return to /docs', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('[data-docs-route="page"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Docs Overview' })).toBeVisible()

    await page.goto('/docs/')
    await expect(page.locator('[data-docs-route="page"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Docs Overview' })).toBeVisible()

    await page.goto('/docs#overview')
    await expect(page.locator('#overview')).toBeVisible()
    await expect
      .poll(async () => page.locator('#overview').evaluate((element) => Math.round(element.getBoundingClientRect().top)))
      .toBeLessThan(180)

    await page.goto('/docs/unknown')
    await expect(page).toHaveURL(/\/docs$/)
    await expect(page.locator('[data-docs-route="page"]')).toBeVisible()
    await expect(page.locator('[data-docs-route="fallback"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Docs Overview' })).toBeVisible()
  })
})
