import { jest } from '@jest/globals'

// Runs before each test file, so tokens exist when src/octokit.ts loads
process.env.INPUT_DISCUSSION_TOKEN = 'TOKEN'
process.env.INPUT_REPO_TOKEN = 'REPO_TOKEN'

// @actions/* are ESM-only, and ESM module namespaces can't be spied on. Load
// the real modules first, then register mocks that re-export them with the
// functions tests spy on wrapped in jest.fn (spyOn reuses an existing mock).
const actualCore = await import('@actions/core')
jest.unstable_mockModule('@actions/core', () => ({
  ...actualCore,
  setFailed: jest.fn(actualCore.setFailed),
  setOutput: jest.fn(actualCore.setOutput),
  warning: jest.fn(actualCore.warning)
}))

// @actions/github sets its own (proxy-aware) fetch on every client, so swap in
// one that defers to global.fetch, which ./sandbox points at fetch-mock
const actualGithub = await import('@actions/github')
jest.unstable_mockModule('@actions/github', () => ({
  ...actualGithub,
  getOctokit: (token: string, options: Record<string, unknown> = {}) =>
    actualGithub.getOctokit(token, {
      ...options,
      request: {
        fetch: async (...args: Parameters<typeof fetch>) =>
          global.fetch(...args)
      }
    })
}))
