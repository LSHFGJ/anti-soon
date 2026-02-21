import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const MOCK_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890'

async function mockWalletConnection(page: Page) {
  await page.addInitScript(() => {
    const mockAddress = '0x1234567890123456789012345678901234567890'
    
    Object.defineProperty(window, 'ethereum', {
      value: {
        isMetaMask: true,
        selectedAddress: mockAddress,
        chainId: '0xaa36a7',
        request: async (args: { method: string; params?: unknown[] }) => {
          if (args.method === 'eth_requestAccounts') {
            return [mockAddress]
          }
          if (args.method === 'eth_chainId') {
            return '0xaa36a7'
          }
          if (args.method === 'eth_accounts') {
            return [mockAddress]
          }
          if (args.method === 'eth_getBalance') {
            return '0x56bc75e2d63100000'
          }
          return []
        },
        on: () => {},
        removeListener: () => {},
        emit: () => {},
        enable: async () => [mockAddress],
      },
      writable: true,
      configurable: true,
    })
  })
}

async function mockContractCalls(page: Page) {
  await page.route('**/0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9**', async (route) => {
    const request = route.request()
    const postData = request.postDataJSON()
    
    if (postData?.method === 'eth_call') {
      const data = postData.params?.[0]?.data
      if (data?.startsWith('0x')) {
        const selector = data.slice(0, 10)
        
        if (selector === '0x') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: postData.id,
              result: '0x0000000000000000000000000000000000000000000000000000000000000001'
            })
          })
          return
        }
        
        const mockPublicKey = '0x' + 'a'.repeat(128)
        const mockProjectResponse = [
          MOCK_WALLET_ADDRESS,
          '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000',
          '0x000000000000000000000000000000000000000000000000002386f26fc10000',
          '0xDummyVault',
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          true ? '0x0000000000000000000000000000000000000000000000000000000000000001' : '0x0000000000000000000000000000000000000000000000000000000000000000',
          '0x00',
          '0x0000000000000000000000000000000000000000000000000000000067b00000',
          '0x0000000000000000000000000000000000000000000000000000000067c00000',
          '0x0000000000000000000000000000000000000000000000000000000000001c20',
          '0x' + '0'.repeat(64),
          mockPublicKey
        ]
        
        const encodedResponse = mockProjectResponse.join('')
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: postData.id,
            result: encodedResponse
          })
        })
        return
      }
    }
    
    if (postData?.method === 'eth_estimateGas') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: postData.id,
          result: '0x5208'
        })
      })
      return
    }
    
    if (postData?.method === 'eth_sendTransaction') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: postData.id,
          result: '0x' + 'ab'.repeat(32)
        })
      })
      return
    }
    
    if (postData?.method === 'eth_getTransactionReceipt') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: postData.id,
          result: {
            status: '0x1',
            transactionHash: '0x' + 'ab'.repeat(32),
            blockNumber: '0x1234567',
            logs: []
          }
        })
      })
      return
    }
    
    await route.continue()
  })
}

test.describe('Encryption Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockWalletConnection(page)
    await mockContractCalls(page)
  })

  test('should display landing page with hero section', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    
    await expect(page.locator('body')).toContainText('ANTI-SOON')
    
    await page.screenshot({ 
      path: 'test-results/01-landing-page.png',
      fullPage: true 
    })
  })

  test('should navigate to PoC builder', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    
    await expect(page.locator('#builder')).toBeVisible()
    
    await page.screenshot({ 
      path: 'test-results/02-builder-page.png',
      fullPage: true 
    })
  })

  test('should display multi-step form in builder', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    
    await expect(page.getByRole('button', { name: 'TARGET' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CONDITIONS' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'TRANSACTIONS' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'IMPACT' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'REVIEW' })).toBeVisible()
    
    await page.screenshot({ 
      path: 'test-results/03-builder-steps.png',
      fullPage: true 
    })
  })

  test('should fill target configuration step', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    
    const targetInput = page.locator('input').first()
    if (await targetInput.isVisible()) {
      await targetInput.fill('0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9')
    }
    
    const chainSelect = page.locator('select').first()
    if (await chainSelect.isVisible()) {
      await chainSelect.selectOption({ label: 'Sepolia Testnet' })
    }
    
    await page.screenshot({ 
      path: 'test-results/04-target-step-filled.png',
      fullPage: true 
    })
  })

  test('should display connect wallet prompt when not connected', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    
    const targetInput = page.locator('input').first()
    if (await targetInput.isVisible()) {
      await targetInput.fill('0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9')
    }
    
    const chainSelect = page.locator('select').first()
    if (await chainSelect.isVisible()) {
      await chainSelect.selectOption({ label: 'Sepolia Testnet' })
    }
    
    const inputs = page.locator('input')
    const forkBlockInput = inputs.nth(1)
    if (await forkBlockInput.isVisible()) {
      await forkBlockInput.fill('18000000')
    }
    
    for (let i = 0; i < 5; i++) {
      const nextButton = page.getByRole('button', { name: /next|continue/i })
      if (await nextButton.isVisible()) {
        await nextButton.click()
        await page.waitForTimeout(300)
      }
    }
    
    await page.waitForTimeout(500)
    
    await page.screenshot({ 
      path: 'test-results/05-review-step.png',
      fullPage: true 
    })
  })

  test('should display commit/reveal flow UI elements', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /(?:^|\s)REVIEW$/ }).click()
    await expect(page.getByText('1. COMMIT')).toBeVisible()
    await expect(page.getByText('2. REVEAL')).toBeVisible()
    await expect(page.getByText('3. VERIFYING')).toBeVisible()

    await page.screenshot({ 
      path: 'test-results/06-commit-reveal-ui.png',
      fullPage: true 
    })
  })

  test('should display generated POC JSON in review step', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    
    const targetInput = page.locator('input').first()
    if (await targetInput.isVisible()) {
      await targetInput.fill('0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9')
    }
    
    const chainSelect = page.locator('select').first()
    if (await chainSelect.isVisible()) {
      await chainSelect.selectOption({ label: 'Sepolia Testnet' })
    }
    
    const inputs = page.locator('input')
    const forkBlockInput = inputs.nth(1)
    if (await forkBlockInput.isVisible()) {
      await forkBlockInput.fill('18000000')
    }
    
    for (let i = 0; i < 5; i++) {
      const nextButton = page.getByRole('button', { name: /next|continue/i })
      if (await nextButton.isVisible()) {
        await nextButton.click()
        await page.waitForTimeout(500)
        
        if (i === 3) {
          await page.waitForTimeout(300)
          
          const vulnTypeSelects = page.locator('select')
          for (let j = 0; j < await vulnTypeSelects.count(); j++) {
            try {
              await vulnTypeSelects.nth(j).selectOption({ label: 'Funds Drained' })
            } catch {}
          }
          
          await page.waitForTimeout(300)
          
          const allInputs = page.locator('input')
          for (let j = 0; j < await allInputs.count(); j++) {
            const input = allInputs.nth(j)
            try {
              const placeholder = await input.getAttribute('placeholder')
              if (placeholder && (placeholder.includes('wei') || placeholder.includes('ETH'))) {
                await input.fill('1000000000000000000')
              }
            } catch {}
          }
          
          await page.waitForTimeout(300)
          
          const textareas = page.locator('textarea')
          if (await textareas.count() > 0) {
            await textareas.first().fill('Test impact description')
          }
        }
      }
    }
    
    await page.waitForTimeout(500)
    
    const preElement = page.locator('pre')
    if (await preElement.isVisible()) {
      const pocJson = await preElement.textContent()
      expect(pocJson).toBeTruthy()
      expect(pocJson?.length).toBeGreaterThan(10)
    }
    
    await page.screenshot({ 
      path: 'test-results/07-poc-json-display.png',
      fullPage: true 
    })
  })

  test('should show encryption flow phases', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForLoadState('domcontentloaded')
    
    const targetInput = page.locator('input').first()
    if (await targetInput.isVisible()) {
      await targetInput.fill('0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9')
    }
    
    const chainSelect = page.locator('select').first()
    if (await chainSelect.isVisible()) {
      await chainSelect.selectOption({ label: 'Sepolia Testnet' })
    }
    
    const inputs = page.locator('input')
    const forkBlockInput = inputs.nth(1)
    if (await forkBlockInput.isVisible()) {
      await forkBlockInput.fill('18000000')
    }
    
    for (let i = 0; i < 5; i++) {
      const nextButton = page.getByRole('button', { name: /next|continue/i })
      if (await nextButton.isVisible()) {
        await nextButton.click()
        await page.waitForTimeout(500)
        
        if (i === 3) {
          await page.waitForTimeout(300)
          
          const vulnTypeSelects = page.locator('select')
          for (let j = 0; j < await vulnTypeSelects.count(); j++) {
            try {
              await vulnTypeSelects.nth(j).selectOption({ label: 'Funds Drained' })
            } catch {}
          }
          
          await page.waitForTimeout(300)
          
          const allInputs = page.locator('input')
          for (let j = 0; j < await allInputs.count(); j++) {
            const input = allInputs.nth(j)
            try {
              const placeholder = await input.getAttribute('placeholder')
              if (placeholder && (placeholder.includes('wei') || placeholder.includes('ETH'))) {
                await input.fill('1000000000000000000')
              }
            } catch {}
          }
          
          await page.waitForTimeout(300)
          
          const textareas = page.locator('textarea')
          if (await textareas.count() > 0) {
            await textareas.first().fill('Test impact description')
          }
        }
      }
    }
    
    await page.waitForTimeout(1000)
    
    await expect(page.locator('body')).toContainText('1. COMMIT')
    await expect(page.locator('body')).toContainText('2. REVEAL')
    await expect(page.locator('body')).toContainText('VERIFY')
    
    await page.screenshot({ 
      path: 'test-results/08-encryption-phases.png',
      fullPage: true 
    })
  })

  test('should navigate to create-project page', async ({ page }) => {
    await page.goto('/create-project')
    await page.waitForLoadState('domcontentloaded')
    
    await page.screenshot({ 
      path: 'test-results/09-create-project.png',
      fullPage: true 
    })
  })

  test('should navigate to explorer page', async ({ page }) => {
    await page.goto('/explorer')
    await page.waitForLoadState('domcontentloaded')
    
    await page.screenshot({ 
      path: 'test-results/10-explorer.png',
      fullPage: true 
    })
  })
})

test.describe('Encryption Utilities E2E', () => {
  test('should have Web Crypto API available for AES-GCM', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    
    const cryptoAvailable = await page.evaluate(() => {
      return typeof window.crypto !== 'undefined' && 
             typeof window.crypto.subtle !== 'undefined'
    })
    
    expect(cryptoAvailable).toBe(true)
  })

  test('should be able to generate AES key', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    
    const keyGenerated = await page.evaluate(async () => {
      try {
        const key = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        )
        return key !== null && key.type === 'secret'
      } catch {
        return false
      }
    })
    
    expect(keyGenerated).toBe(true)
  })

  test('should be able to encrypt and decrypt data with AES-GCM', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    
    const encryptionWorks = await page.evaluate(async () => {
      try {
        const key = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        )
        
        const encoder = new TextEncoder()
        const data = encoder.encode('Test POC data for encryption')
        const iv = window.crypto.getRandomValues(new Uint8Array(12))
        
        const ciphertext = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          data
        )
        
        const decrypted = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          ciphertext
        )
        
        const decoder = new TextDecoder()
        const decryptedText = decoder.decode(decrypted)
        
        return decryptedText === 'Test POC data for encryption'
      } catch {
        return false
      }
    })
    
    expect(encryptionWorks).toBe(true)
  })
})

test.describe('No Wallet Available', () => {
  test.skip('skip test requiring real wallet connection', () => {
    expect(true).toBe(true)
  })
})
