declare module "bun:test" {
  export function describe(name: string, fn: () => void | Promise<void>): void
  export function it(name: string, fn: () => void | Promise<void>): void
  export function expect<T>(value: T): {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toContain(expected: unknown): void
    toHaveLength(expected: number): void
    toThrow(expected?: unknown): void
  }
}

declare const Bun: {
  file(path: string | URL): {
    text(): Promise<string>
  }
}
