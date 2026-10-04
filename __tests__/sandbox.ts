import fetchMock from 'fetch-mock'

export const sandbox = fetchMock.sandbox()

// Clients fetch through global.fetch in tests (see ./setup.ts), so every
// client, including ones created at module load, is routed through here
global.fetch = sandbox
