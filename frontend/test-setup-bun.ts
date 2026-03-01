import { JSDOM } from 'jsdom'
import { spawnSync } from 'node:child_process'
import { vi } from 'vitest'
import './src/test/setup'

if (!process.env.ANTISOON_BUN_TEST_BRIDGED) {
  const bridged = spawnSync('bun', ['run', 'test:unit'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, ANTISOON_BUN_TEST_BRIDGED: '1' },
  })
  process.exit(bridged.status ?? 1)
}

const viAny = vi as any
const envSnapshots = new Map<string, string | undefined>()
const globalSnapshots = new Map<string, unknown>()

if (typeof viAny.hoisted !== 'function') {
  viAny.hoisted = <T>(factory: () => T): T => factory()
}

if (typeof viAny.mocked !== 'function') {
  viAny.mocked = <T>(value: T): T => value
}

if (typeof viAny.stubEnv !== 'function') {
  viAny.stubEnv = (key: string, value: string) => {
    if (!envSnapshots.has(key)) {
      envSnapshots.set(key, process.env[key])
    }
    process.env[key] = value
  }
}

if (typeof viAny.unstubAllEnvs !== 'function') {
  viAny.unstubAllEnvs = () => {
    for (const [key, value] of envSnapshots.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    envSnapshots.clear()
  }
}

if (typeof viAny.stubGlobal !== 'function') {
  viAny.stubGlobal = (key: string, value: unknown) => {
    if (!globalSnapshots.has(key)) {
      globalSnapshots.set(key, (globalThis as Record<string, unknown>)[key])
    }
    ;(globalThis as Record<string, unknown>)[key] = value
  }
}

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
})
const window = dom.window

global.window = window as any
global.document = window.document
global.navigator = window.navigator
global.HTMLElement = window.HTMLElement as any
global.HTMLDivElement = window.HTMLDivElement as any
global.HTMLSpanElement = window.HTMLSpanElement as any
global.HTMLButtonElement = window.HTMLButtonElement as any
global.HTMLInputElement = window.HTMLInputElement as any
global.HTMLFormElement = window.HTMLFormElement as any
global.DocumentFragment = window.DocumentFragment as any
global.Text = window.Text as any
global.Node = window.Node as any
global.Element = window.Element as any
global.Event = window.Event as any
global.MouseEvent = window.MouseEvent as any
global.KeyboardEvent = window.KeyboardEvent as any
global.CustomEvent = window.CustomEvent as any
global.HTMLElement = window.HTMLElement as any
global.dispatchEvent = window.dispatchEvent.bind(window)

if (!global.crypto) {
  global.crypto = {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256)
      }
      return arr
    },
  } as any
}

if (!global.localStorage) {
  const store: Record<string, string> = {}

  global.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((key) => {
        delete store[key]
      })
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] || null,
  } as any
}

if (!global.sessionStorage) {
  const store: Record<string, string> = {}

  global.sessionStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((key) => {
        delete store[key]
      })
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] || null,
  } as any
}

console.log('✅ happy-dom initialized for Bun test runner')
