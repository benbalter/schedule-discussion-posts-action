import 'dotenv/config'
import * as github from '@actions/github'
import * as core from '@actions/core'

// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-commonjs, @typescript-eslint/no-require-imports
export const sandbox = require('fetch-mock').sandbox()
let options = {}

if (process.env.NODE_ENV === 'test') {
  options = { request: { fetch: sandbox } }
}

let discussionToken: string
let repoToken: string

// Avoid errors for missing tokens when running tests
if (process.env.NODE_ENV === 'test') {
  discussionToken = 'TOKEN'
  repoToken = 'REPO_TOKEN'
  core.info('Running in test mode')
} else {
  // Yes, we could set { required: true } below, but this provides more
  // human-friendly error messages.
  for (const token of ['discussion_token', 'repo_token']) {
    if (core.getInput(token) === '') {
      core.setFailed(
        `${token} is required. Pass as a "with" parameter in your workflow file.`
      )
    }
  }

  discussionToken = core.getInput('discussion_token')
  repoToken = core.getInput('repo_token')
}

// Octokit instance with discussion create scope for the target repo
export const octokit = github.getOctokit(discussionToken, options)

// Octokit instance with the default Actions token for the current repo
export const repoOctokit = github.getOctokit(repoToken, options)

export function octokitForAuthor(author: string): undefined | typeof octokit {
  author = author.replaceAll(/-/g, '_')
  const token = core.getInput(`discussion_token_${author}`)
  if (token === '') {
    core.setFailed(
      `To post as "${author}", add a secret named "discussion_token_${author}" to your repository. See the README for setup instructions.`
    )
    return
  }
  return github.getOctokit(token, options)
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      const delay = Math.pow(2, attempt) * 1000
      core.warning(
        `${label} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${error}`
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error(`${label} failed after ${maxRetries} attempts`)
}
