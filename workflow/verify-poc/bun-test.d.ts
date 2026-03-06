declare module "bun:test" {
  type Matchers = {
    toBe(expected: unknown): void
    toBeNull(): void
    toEqual(expected: unknown): void
    toContain(expected: unknown): void
    toContainEqual(expected: unknown): void
    toHaveLength(expected: number): void
    toBeDefined(): void
    toBeGreaterThan(expected: number): void
    toMatch(expected: string | RegExp): void
    toThrow(expected?: string | RegExp): void
    not: Matchers
  }

  export function describe(name: string, fn: () => void): void
  export function it(name: string, fn: () => void | Promise<void>): void
  export function expect<T = unknown>(value: T): Matchers
}
