import { runOnceCommand } from "./run-once"

function isMainModule(): boolean {
  const moduleMeta = import.meta as { main?: boolean }
  return moduleMeta.main === true
}

if (isMainModule()) {
  void runOnceCommand().then((exitCode) => {
    const runtime = globalThis as {
      process?: {
        exitCode?: number
      }
    }

    if (runtime.process) {
      runtime.process.exitCode = exitCode
    }
  })
}
