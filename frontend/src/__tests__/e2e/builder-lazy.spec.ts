import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type LazyNetworkEvidence = {
  task: string
  initialBuilderModuleFetched: boolean
  initialMonacoModuleFetched: boolean
  builderModuleFetchedAfterNavigation: boolean
  monacoModuleFetchedAfterNavigation: boolean
  initialModuleRequests: string[]
  afterNavigationModuleRequests: string[]
}

const fileDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fileDir, '../../../../')
const evidenceDir = resolve(repoRoot, '.sisyphus/evidence')
const networkEvidencePath = resolve(evidenceDir, 'task-6-lazy-network.json')
const functionalScreenshotPath = resolve(evidenceDir, 'task-6-editor-functional.png')

function isRelevantModuleRequest(url: string): boolean {
  return url.includes('/src/') || url.includes('/node_modules/') || url.includes('/@fs/')
}

function isBuilderModule(url: string): boolean {
  return url.includes('/src/pages/Builder')
}

function isMonacoModule(url: string): boolean {
  return url.includes('@monaco-editor/react') || url.includes('monaco-editor')
}

test.describe('Builder lazy loading', () => {
  test('loads builder/editor modules only when entering builder route', async ({ page }) => {
    await mkdir(evidenceDir, { recursive: true })

    const moduleRequests: string[] = []
    page.on('requestfinished', (request) => {
      const url = request.url()
      if (isRelevantModuleRequest(url)) {
        moduleRequests.push(url)
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('START BUILDING POC')).toBeVisible()

    const initialModuleRequests = [...new Set(moduleRequests)]
    const initialBuilderModuleFetched = initialModuleRequests.some(isBuilderModule)
    const initialMonacoModuleFetched = initialModuleRequests.some(isMonacoModule)

    expect(initialBuilderModuleFetched).toBe(false)
    expect(initialMonacoModuleFetched).toBe(false)

    await page.goto('/builder')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#builder')).toBeVisible()

    const afterNavigationModuleRequests = [...new Set(moduleRequests)]
    const builderModuleFetchedAfterNavigation = afterNavigationModuleRequests.some(isBuilderModule)
    const monacoModuleFetchedAfterNavigation = afterNavigationModuleRequests.some(isMonacoModule)

    expect(builderModuleFetchedAfterNavigation).toBe(true)
    expect(monacoModuleFetchedAfterNavigation).toBe(true)

    await expect(page.locator('.monaco-editor').first()).toBeVisible()
    await page.locator('.monaco-editor').first().click({ position: { x: 40, y: 20 } })
    await page.keyboard.type('[]')

    await writeFile(
      networkEvidencePath,
      `${JSON.stringify({
        task: 'task-6-builder-lazy-load',
        initialBuilderModuleFetched,
        initialMonacoModuleFetched,
        builderModuleFetchedAfterNavigation,
        monacoModuleFetchedAfterNavigation,
        initialModuleRequests,
        afterNavigationModuleRequests,
      } satisfies LazyNetworkEvidence, null, 2)}\n`,
      'utf8'
    )

    await page.screenshot({ path: functionalScreenshotPath, fullPage: true })
  })
})
