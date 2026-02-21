import { test, expect } from '@playwright/test'

const GENERATIVE_PRIMARY_RGB = 'rgb(124, 58, 237)'

test('regression: --color-primary remains generative token at runtime', async ({ page }) => {
  await page.goto('/explorer')
  await page.waitForLoadState('networkidle')

  const rootPrimary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
  )

  expect(rootPrimary).toBe('#7c3aed')

  const activeNavLink = page.locator('nav').getByText('[EXPLORER]').first()
  await expect(activeNavLink).toBeVisible()

  const activeColor = await activeNavLink.evaluate((el) => getComputedStyle(el).color)
  expect(activeColor).toBe(GENERATIVE_PRIMARY_RGB)
})
