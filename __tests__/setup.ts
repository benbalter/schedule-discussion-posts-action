// Runs before each test file, so tokens exist when src/octokit.ts loads
process.env.INPUT_DISCUSSION_TOKEN = 'TOKEN'
process.env.INPUT_REPO_TOKEN = 'REPO_TOKEN'

// @actions/github sets its own (proxy-aware) fetch on every client, so swap in
// one that defers to global.fetch, which ./sandbox points at fetch-mock
jest.mock('@actions/github', () => {
  const actual = jest.requireActual('@actions/github')
  return {
    ...actual,
    getOctokit: (token: string, options: Record<string, unknown> = {}) =>
      actual.getOctokit(token, {
        ...options,
        request: {
          fetch: async (...args: Parameters<typeof fetch>) =>
            global.fetch(...args)
        }
      })
  }
})
