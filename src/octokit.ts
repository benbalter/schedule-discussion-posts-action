import 'dotenv/config'
import * as github from '@actions/github'
import * as core from '@actions/core'

const discussionToken = core.getInput('discussion_token')
const repoToken = core.getInput('repo_token')

// Octokit instance with discussion create scope for the target repo
export const octokit = github.getOctokit(discussionToken)

// Octokit instance with the default Actions token for the current repo
export const repoOctokit = github.getOctokit(repoToken)
