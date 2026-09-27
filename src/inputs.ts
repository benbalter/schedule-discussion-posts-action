import * as core from '@actions/core'

/**
 * Whether the action is running in dry-run mode.
 *
 * An empty value (e.g., when running locally) is treated as false. Any other
 * value must be a YAML boolean (true/True/TRUE/false/False/FALSE), otherwise
 * this throws rather than guessing, since guessing wrong could publish posts.
 */
export function isDryRun(): boolean {
  if (core.getInput('dry_run') === '') {
    return false
  }

  return core.getBooleanInput('dry_run')
}
