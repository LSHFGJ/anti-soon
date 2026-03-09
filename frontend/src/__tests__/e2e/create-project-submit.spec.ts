import { type Page, expect, test } from '@playwright/test'

function buildMockMetaMaskInitScript() {
  return () => {
    const mockAddress = '0x1234567890123456789012345678901234567890'
    let chainId = '0xaa36a7'
    const listeners = new Map<string, Array<(payload: unknown) => void>>()

    const emit = (event: string, payload: unknown) => {
      const callbacks = listeners.get(event) ?? []
      for (const callback of callbacks) {
        callback(payload)
      }
    }

    const provider = {
      isMetaMask: true,
      selectedAddress: mockAddress,
      chainId,
      async request(args: { method: string; params?: Array<{ chainId?: string }> }) {
        if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') {
          return [mockAddress]
        }

        if (args.method === 'eth_chainId') {
          return chainId
        }

        if (args.method === 'net_version') {
          return String(parseInt(chainId, 16))
        }

        if (args.method === 'eth_getBalance') {
          return '0x56bc75e2d63100000'
        }

        if (args.method === 'wallet_switchEthereumChain') {
          const nextChainId = args.params?.[0]?.chainId
          if (typeof nextChainId === 'string') {
            chainId = nextChainId
            provider.chainId = nextChainId
            emit('chainChanged', nextChainId)
          }
          return null
        }

        if (args.method === 'eth_blockNumber') {
          return '0x123456'
        }

        if (args.method === 'eth_gasPrice') {
          return '0x3b9aca00'
        }

        if (args.method === 'eth_getTransactionCount') {
          return '0x1'
        }

        if (args.method === 'eth_estimateGas') {
          return '0x5208'
        }

        if (args.method === 'eth_sendTransaction') {
          return `0x${'ab'.repeat(32)}`
        }

        if (args.method === 'wallet_getPermissions') {
          return []
        }

        if (args.method === 'wallet_requestPermissions') {
          return [{ parentCapability: 'eth_accounts' }]
        }

        return null
      },
      on(event: string, callback: (payload: unknown) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), callback])
      },
      removeListener(event: string, callback: (payload: unknown) => void) {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== callback),
        )
      },
      enable: async () => [mockAddress],
    }

    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: true,
      configurable: true,
    })
  }
}

async function mockCreateProjectRepo(page: Page) {
  await page.route('https://api.github.com/repos/example/repo/contents/script', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          name: 'Deploy.s.sol',
          path: 'script/Deploy.s.sol',
          type: 'file',
          download_url: 'https://example.com/script/Deploy.s.sol',
        },
      ]),
    })
  })

  await page.route('https://example.com/script/Deploy.s.sol', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: 'contract MockContract {}\nnew MockContract();',
    })
  })
}

async function completeCreateProjectWizard(page: Page) {
  await page.goto('/create-project')
  await page.getByPlaceholder('https://github.com/owner/repo').fill('https://github.com/example/repo')
  await page.getByRole('button', { name: /scan/i }).click()
  await expect(page.getByText('✓ Found 1 deployment script. Click NEXT to continue.')).toBeVisible()
  await page.getByRole('button', { name: '[ NEXT ]' }).click()
  await page.getByRole('button', { name: /Deploy\.s\.sol/i }).click()
  await page.getByRole('button', { name: /MockContract Verified/i }).click()
  await page.getByRole('button', { name: '[ NEXT ]' }).click()
  await page.getByRole('spinbutton', { name: /BOUNTY POOL/i }).fill('10')
  await page.getByRole('spinbutton', { name: /MAX PAYOUT PER BUG/i }).fill('5')
  await page.getByRole('button', { name: '[ NEXT ]' }).click()
  await page.getByRole('button', { name: '[ NEXT ]' }).click()
  await page.getByRole('button', { name: '[ NEXT ]' }).click()
  await expect(page.getByText('// STEP_07: REVIEW & SUBMIT')).toBeVisible()
}

test.describe('CreateProject review CTA', () => {
  test('keeps the disconnected review CTA clickable in a real browser', async ({ page }) => {
    await mockCreateProjectRepo(page)

    await completeCreateProjectWizard(page)

    const submitCta = page.getByRole('button', { name: /connect wallet to submit/i })
    await expect(submitCta).toBeVisible()
    await expect(submitCta).toBeEnabled()

    await submitCta.click()

    await expect(page.getByRole('alertdialog')).toBeVisible()
  })

  test('submits successfully in a real browser with a mocked Sepolia wallet', async ({ page }) => {
    await page.addInitScript(buildMockMetaMaskInitScript())
    await mockCreateProjectRepo(page)

    await completeCreateProjectWizard(page)

    const submitButton = page.getByRole('button', { name: /submit project/i })
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeEnabled()

    await submitButton.click()

    await expect.poll(async () => {
      const submitted = await page.getByText('✓ SUBMITTED').isVisible().catch(() => false)
      const redirected = /\/explorer$/.test(page.url())
      return submitted || redirected
    }).toBe(true)
  })
})
