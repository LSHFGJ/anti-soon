import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeAbiParameters, parseAbiParameters } from 'viem'

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const contextScreenshotPath = resolve(evidenceDir, 'task-5-context-projectdetail.png')
const ctaRoutingJsonPath = resolve(evidenceDir, 'task-5-cta-routing.json')

const PROJECTS_SELECTOR = '0x107046bd'
const PROJECT_RULES_SELECTOR = '0xe703adad'
const PROJECT_ID_1_SUFFIX = '1'.padStart(64, '0')
const ZERO_BYTES32 = ('0x' + '00'.repeat(32)) as `0x${string}`

const mockedProjectResult = encodeAbiParameters(
  parseAbiParameters('address,uint256,uint256,address,uint256,bool,uint8,uint256,uint256,uint256,bytes32,bytes'),
  [
    '0x1111111111111111111111111111111111111111',
    10_000_000_000_000_000n,
    2_000_000_000_000_000n,
    '0x2222222222222222222222222222222222222222',
    0n,
    true,
    0,
    0n,
    0n,
    0n,
    ZERO_BYTES32,
    '0x01'
  ]
)

const mockedRulesResult = encodeAbiParameters(
  parseAbiParameters('uint256,uint256,bool,(uint256,uint256,uint256,uint256)'),
  [1_000_000_000_000_000n, 3_600n, true, [5_000_000_000_000_000n, 3_000_000_000_000_000n, 2_000_000_000_000_000n, 1_000_000_000_000_000n]]
)

async function mockProjectDetailReads(page: import('@playwright/test').Page) {
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') {
      await route.continue()
      return
    }

    const payload = request.postDataJSON()
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      await route.continue()
      return
    }

    const method = Reflect.get(payload, 'method')
    if (method !== 'eth_call') {
      await route.continue()
      return
    }

    const params = Reflect.get(payload, 'params')
    if (!Array.isArray(params) || !params[0] || typeof params[0] !== 'object') {
      await route.continue()
      return
    }

    const callData = String(Reflect.get(params[0], 'data') ?? '').toLowerCase()
    if (!callData.endsWith(PROJECT_ID_1_SUFFIX)) {
      await route.continue()
      return
    }

    const id = Reflect.get(payload, 'id')
    if (callData.startsWith(PROJECTS_SELECTOR)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id, result: mockedProjectResult })
      })
      return
    }

    if (callData.startsWith(PROJECT_RULES_SELECTOR)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id, result: mockedRulesResult })
      })
      return
    }

    await route.continue()
  })
}

test.describe('Builder context + CTA routing contract', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true })
  })

  test('propagates selected project context into Builder via query/path routes', async ({ page }) => {
    await mockProjectDetailReads(page)

    await page.goto('/builder?project=7')
    await page.waitForLoadState('domcontentloaded')

    const context = page.getByTestId('builder-project-context')
    await expect(context).toBeVisible()
    await expect(context).toContainText('#7')

    await page.goto('/builder?projectId=8')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('builder-project-context')).toContainText('#8')

    await page.goto('/builder/9')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('builder-project-context')).toContainText('#9')

    await page.goto('/project/1')
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('link', { name: /SUBMIT POC/i }).click()
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/builder\?projectId=1(?:&source=project-detail)?$/)
    await expect(page.getByTestId('builder-project-context')).toBeVisible()
    await expect(page.getByTestId('builder-project-context')).toContainText('#1')
    await page.screenshot({ path: contextScreenshotPath, fullPage: true })
  })

  test('routes all primary landing CTAs deterministically', async ({ page }) => {
    await mockProjectDetailReads(page)

    const observed: Record<string, string> = {}

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: 'Submit PoC' }).click()
    await page.waitForLoadState('domcontentloaded')
    observed.heroSubmitPoC = page.url()
    await expect(page).toHaveURL(/\/builder(?:\?.*)?$/)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: 'View Bounties' }).click()
    await page.waitForLoadState('domcontentloaded')
    observed.heroViewBounties = page.url()
    await expect(page).toHaveURL(/\/explorer$/)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: /START BUILDING POC/i }).click()
    await page.waitForLoadState('domcontentloaded')
    observed.landingStartBuilding = page.url()
    await expect(page).toHaveURL(/\/builder(?:\?.*)?$/)

    await page.goto('/project/1')
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('link', { name: /SUBMIT POC/i }).click()
    await page.waitForLoadState('domcontentloaded')
    observed.projectDetailSubmit = page.url()
    await expect(page).toHaveURL(/\/builder\?projectId=1(?:&source=project-detail)?$/)
    await expect(page.getByTestId('builder-project-context')).toContainText('#1')

    await writeFile(
      ctaRoutingJsonPath,
      `${JSON.stringify({ task: 'task-5-builder-context-and-cta', observed }, null, 2)}\n`,
      'utf8'
    )
  })
})
