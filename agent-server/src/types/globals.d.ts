// Electron's utilityProcess.fork attaches `parentPort` to the child's `process`.
// agent-server runs both inside that utility process (prod) and as a plain Node
// process (dev/CLI) where `parentPort` is undefined; we guard at the call site.
declare namespace NodeJS {
  interface Process {
    parentPort?: {
      postMessage(data: unknown): void
      on(event: 'message', listener: (event: { data: unknown }) => void): void
      off?(event: 'message', listener: (event: { data: unknown }) => void): void
    }
  }
}
