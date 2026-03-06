declare module "bun:test" {
  type Matchers = {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toContain(expected: unknown): void
    toThrow(expected?: string | RegExp): void
    toHaveLength(expected: number): void
    not: Matchers
  }

  export function describe(name: string, fn: () => void): void
  export function it(name: string, fn: () => void | Promise<void>): void
  export function expect<T = unknown>(value: T): Matchers
}

declare const Bun: {
  file(
    path: string | URL,
  ): {
    json(): Promise<unknown>
  }
}
