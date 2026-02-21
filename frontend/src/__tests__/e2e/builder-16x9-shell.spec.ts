import { expect, test } from '@playwright/test'

test.describe('Builder 16:9 single-screen shell', () => {
  test('keeps each builder step within a 1920x1080 viewport without page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')

    const stepLabels = ['TARGET', 'CONDITIONS', 'TRANSACTIONS', 'IMPACT', 'REVIEW']

    for (const label of stepLabels) {
      await page.getByRole('button', { name: new RegExp(`(?:^|\\s)${label}$`) }).click()

      const metrics = await page.evaluate(() => {
        const docOwner = document.scrollingElement as HTMLElement
        const primaryOwner = document.querySelector<HTMLElement>('[data-builder-scroll-owner="primary"]')

        return {
          documentOverflow: docOwner.scrollHeight > docOwner.clientHeight + 1,
          primaryOverflow: primaryOwner
            ? primaryOwner.scrollHeight > primaryOwner.clientHeight + 1
            : true,
        }
      })

      expect(metrics.documentOverflow).toBe(false)
      expect(metrics.primaryOverflow).toBe(false)
    }
  })
})
