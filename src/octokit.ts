import 'dotenv/config'
import * as github from '@actions/github'
import * as core from '@actions/core'

// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-commonjs, @typescript-eslint/no-require-imports
export const sandbox = require('fetch-mock').sandbox()
let options = {}

if (process.env.NODE_ENV === 'test') {
  options = { request: { fetch: sandbox } }
}

const discussionToken = core.getInput('discussion_token')
const repoToken = core.getInput('repo_token')

// Octokit instance with discussion create scope for the target repo
export const octokit = github.getOctokit(discussionToken, options)

// Octokit instance with the default Actions token for the current repo
export const repoOctokit = github.getOctokit(repoToken, options)
