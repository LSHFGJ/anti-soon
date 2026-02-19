import { JSDOM } from 'jsdom'

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
      Object.keys(store).forEach(key => delete store[key])
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
      Object.keys(store).forEach(key => delete store[key])
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] || null,
  } as any
}

console.log('✅ happy-dom initialized for Bun test runner')
