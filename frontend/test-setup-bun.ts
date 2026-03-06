import { JSDOM } from 'jsdom'
import { spawnSync } from 'node:child_process'
import { vi } from 'vitest'
import './src/test/setup'

type ViCompat = typeof vi & {
  hoisted?: <T>(factory: () => T) => T
  mocked?: <T>(value: T) => T
  stubEnv?: (key: string, value: string) => void
  unstubAllEnvs?: () => void
  stubGlobal?: (key: string, value: unknown) => void
}

type TestGlobals = typeof globalThis & {
  window: Window & typeof globalThis
  document: Document
  navigator: Navigator
  HTMLElement: typeof HTMLElement
  HTMLDivElement: typeof HTMLDivElement
  HTMLSpanElement: typeof HTMLSpanElement
  HTMLButtonElement: typeof HTMLButtonElement
  HTMLInputElement: typeof HTMLInputElement
  HTMLFormElement: typeof HTMLFormElement
  DocumentFragment: typeof DocumentFragment
  Text: typeof Text
  Node: typeof Node
  Element: typeof Element
  Event: typeof Event
  MouseEvent: typeof MouseEvent
  KeyboardEvent: typeof KeyboardEvent
  CustomEvent: typeof CustomEvent
  dispatchEvent: typeof window.dispatchEvent
  crypto?: Crypto
  localStorage?: Storage
  sessionStorage?: Storage
}

function createStorageShim(): Storage {
  const store: Record<string, string> = {}

  return {
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
  }
}

if (!process.env.ANTISOON_BUN_TEST_BRIDGED) {
  const bridged = spawnSync('bun', ['run', 'test:unit'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, ANTISOON_BUN_TEST_BRIDGED: '1' },
  })
  process.exit(bridged.status ?? 1)
}

const viCompat = vi as ViCompat
const envSnapshots = new Map<string, string | undefined>()
const globalSnapshots = new Map<string, unknown>()
const globals = globalThis as TestGlobals

if (typeof viCompat.hoisted !== 'function') {
  viCompat.hoisted = <T>(factory: () => T): T => factory()
}

if (typeof viCompat.mocked !== 'function') {
  viCompat.mocked = <T>(value: T): T => value
}

if (typeof viCompat.stubEnv !== 'function') {
  viCompat.stubEnv = (key: string, value: string) => {
    if (!envSnapshots.has(key)) {
      envSnapshots.set(key, process.env[key])
    }
    process.env[key] = value
  }
}

if (typeof viCompat.unstubAllEnvs !== 'function') {
  viCompat.unstubAllEnvs = () => {
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

if (typeof viCompat.stubGlobal !== 'function') {
  viCompat.stubGlobal = (key: string, value: unknown) => {
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

globals.window = window as unknown as Window & typeof globalThis
globals.document = window.document
globals.navigator = window.navigator
globals.HTMLElement = window.HTMLElement
globals.HTMLDivElement = window.HTMLDivElement
globals.HTMLSpanElement = window.HTMLSpanElement
globals.HTMLButtonElement = window.HTMLButtonElement
globals.HTMLInputElement = window.HTMLInputElement
globals.HTMLFormElement = window.HTMLFormElement
globals.DocumentFragment = window.DocumentFragment
globals.Text = window.Text
globals.Node = window.Node
globals.Element = window.Element
globals.Event = window.Event
globals.MouseEvent = window.MouseEvent
globals.KeyboardEvent = window.KeyboardEvent
globals.CustomEvent = window.CustomEvent
globals.HTMLElement = window.HTMLElement
globals.dispatchEvent = window.dispatchEvent.bind(window)

if (!globals.crypto) {
  const cryptoShim: Pick<Crypto, 'getRandomValues'> = {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256)
      }
      return arr
    },
  }

  globals.crypto = cryptoShim as Crypto
}

if (!globals.localStorage) {
  globals.localStorage = createStorageShim()
}

if (!globals.sessionStorage) {
  globals.sessionStorage = createStorageShim()
}

console.log('✅ happy-dom initialized for Bun test runner')
