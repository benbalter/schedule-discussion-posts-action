import * as github from '@actions/github'
import * as core from '@actions/core'
import { isDryRun } from './inputs'

// An invalid dry_run value is reported by run(); don't throw at module load
let dryRun = false
try {
  dryRun = isDryRun()
} catch {
  dryRun = false
}

// Yes, we could set { required: true } below, but this provides more
// human-friendly error messages.
for (const token of ['discussion_token', 'repo_token']) {
  // discussion_token is not required in dry-run mode as no discussions are published
  if (token === 'discussion_token' && dryRun) continue
  if (core.getInput(token) === '') {
    core.setFailed(
      `${token} is required. Pass as a "with" parameter in your workflow file.`
    )
  }
}

const repoToken = core.getInput('repo_token')
// In dry-run mode, fall back to repo_token when discussion_token is not provided
const discussionToken = core.getInput('discussion_token') || repoToken

// Octokit instance with discussion create scope for the target repo
export const octokit = github.getOctokit(discussionToken)

// Octokit instance with the default Actions token for the current repo
export const repoOctokit = github.getOctokit(repoToken)

export function octokitForAuthor(author: string): undefined | typeof octokit {
  const input = `discussion_token_${author.replaceAll(/-/g, '_')}`
  const token = core.getInput(input)
  if (token === '') {
    core.warning(
      `No "${input}" input found to post as "${author}". Falling back to the default discussion_token. See the README for setup instructions.`
    )
    return
  }
  return github.getOctokit(token)
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
