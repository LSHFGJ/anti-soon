import { defineConfig, devices } from '@playwright/test'
import { createServer } from 'node:net'

// Wire enabled-state docs for E2E testing
process.env.VITE_ENABLE_DOCS = 'true'

const webServerHost = '127.0.0.1'
const preferredWebServerPort = 5173
const webServerPortEnvVar = 'ANTI_SOON_PLAYWRIGHT_PORT'

function buildNoProxyList(value: string | undefined) {
  return Array.from(new Set([
    ...(value?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? []),
    '127.0.0.1',
    'localhost',
  ])).join(',')
}

process.env.NO_PROXY = buildNoProxyList(process.env.NO_PROXY)
process.env.no_proxy = buildNoProxyList(process.env.no_proxy)
delete process.env.HTTP_PROXY
delete process.env.HTTPS_PROXY
delete process.env.http_proxy
delete process.env.https_proxy

async function findAvailablePort(host: string, startPort: number) {
  for (let candidatePort = startPort; candidatePort < startPort + 20; candidatePort += 1) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const probe = createServer()
      let isSettled = false

      const finish = (value: boolean) => {
        if (isSettled) {
          return
        }

        isSettled = true
        resolve(value)
      }

      const cleanup = (value: boolean) => {
        if (probe.listening) {
          probe.close(() => finish(value))
          return
        }

        finish(value)
      }

      probe.once('error', () => {
        cleanup(false)
      })

      probe.listen(candidatePort, host, () => {
        cleanup(true)
      })
    })

    if (isAvailable) {
      return candidatePort
    }
  }

  throw new Error(`Could not find an available Playwright port starting at ${startPort}`)
}

const configuredWebServerPort = Number.parseInt(process.env[webServerPortEnvVar] ?? '', 10)
const selectedWebServerPort = Number.isInteger(configuredWebServerPort) && configuredWebServerPort > 0
  ? configuredWebServerPort
  : await findAvailablePort(webServerHost, preferredWebServerPort)
const selectedWebServerOrigin = `http://${webServerHost}:${selectedWebServerPort}`
process.env[webServerPortEnvVar] = String(selectedWebServerPort)

if (selectedWebServerPort !== preferredWebServerPort) {
  console.log(`playwright config info: port ${preferredWebServerPort} was busy, using ${selectedWebServerPort} instead`)
}

export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  use: {
    baseURL: selectedWebServerOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `bun x vite --host ${webServerHost} --port ${selectedWebServerPort} --strictPort`,
    url: selectedWebServerOrigin,
    reuseExistingServer: true,
    timeout: 120 * 1000,
    env: {
      VITE_ENABLE_DOCS: 'true',
      [webServerPortEnvVar]: String(selectedWebServerPort),
      NO_PROXY: process.env.NO_PROXY,
      no_proxy: process.env.no_proxy,
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      http_proxy: '',
      https_proxy: '',
    },
  },
})
