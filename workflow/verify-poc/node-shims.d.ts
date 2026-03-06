declare module "fs" {
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function mkdtempSync(prefix: string): string
  export function readFileSync(path: string, encoding: "utf8"): string
  export function renameSync(oldPath: string, newPath: string): void
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void
  export function writeFileSync(
    path: string,
    data: string,
    encoding?: "utf8",
  ): void
}

declare module "node:fs" {
  export * from "fs"
}

declare module "os" {
  export function tmpdir(): string
}

declare module "node:os" {
  export * from "os"
}

declare module "path" {
  export function dirname(path: string): string
  export function join(...parts: string[]): string
}

declare module "node:path" {
  export * from "path"
}
