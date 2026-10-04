import fetchMock from 'fetch-mock'

export const sandbox = fetchMock.createInstance()

// Clears routes and call history between tests (v12 split v10's restore())
export function resetSandbox(): void {
  sandbox.removeRoutes().clearHistory()
}

// Clients fetch through global.fetch in tests (see ./setup.ts), so every
// client, including ones created at module load, is routed through here
// fetch-mock binds fetchHandler to its instance in the constructor
// eslint-disable-next-line @typescript-eslint/unbound-method
global.fetch = sandbox.fetchHandler
