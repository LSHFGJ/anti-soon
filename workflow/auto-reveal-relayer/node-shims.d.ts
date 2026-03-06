declare module "node:crypto" {
  export type Hash = {
    update(data: string): Hash
    digest(encoding: "hex"): string
  }

  export function createHash(algorithm: string): Hash
}

declare module "node:fs" {
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function readFileSync(path: string, encoding: "utf8"): string
  export function renameSync(oldPath: string, newPath: string): void
  export function writeFileSync(
    path: string,
    data: string,
    encoding?: "utf8",
  ): void
  export function mkdtempSync(prefix: string): string
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void
}

declare module "node:os" {
  export function tmpdir(): string
}

declare module "node:path" {
  export function dirname(path: string): string
  export function join(...parts: string[]): string
}
