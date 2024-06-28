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
  author = author.replace(/-/, '_')
  const token = core.getInput(`discussion_token_${author}`)
  if (token === '') {
    core.setFailed(
      `"discussion_token_${author}" is required to post as ${author}.`
    )
    return
  }
  return github.getOctokit(token, options)
}
