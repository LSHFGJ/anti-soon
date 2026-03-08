import { describe, expect, it } from "bun:test"

async function readLocalFile(path: string): Promise<string> {
  return await (Bun.file(new URL(path, import.meta.url)) as unknown as Blob).text()
}

describe("auto-reveal-relayer CRE import safety", () => {
  it("keeps the CRE entrypoint path free of run-once and filesystem store imports", async () => {
    const [entrypointSource, uniqueSource, multiSource] = await Promise.all([
      readLocalFile("./entrypoint.ts"),
      readLocalFile("./unique-orchestration.ts"),
      readLocalFile("./multi-deadline.ts"),
    ])

    expect(entrypointSource).not.toContain('from "./run-once"')
    expect(uniqueSource).not.toContain('from "./cursor-store"')
    expect(multiSource).not.toContain('from "./cursor-store"')
  })
})
