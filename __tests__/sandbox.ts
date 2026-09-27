// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-commonjs, @typescript-eslint/no-require-imports
export const sandbox = require('fetch-mock').sandbox()

// Clients fetch through global.fetch in tests (see ./setup.ts), so every
// client, including ones created at module load, is routed through here
global.fetch = sandbox
