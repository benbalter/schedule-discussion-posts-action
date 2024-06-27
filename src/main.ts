import * as core from '@actions/core'
import * as fs from 'fs'
import { Draft } from './draft'

function getDrafts(): Draft[] {
  const files = fs.readdirSync('./')
  let drafts = files.filter(file => file.endsWith('.md'))
  drafts = drafts.filter(draft => !draft.match(/README\.md/i))
  return drafts.map(file => new Draft(file))
}

function getChangedFiles(): Draft[] {
  const json = core.getInput('files')

  if (json === '') {
    return []
  }

  let paths: string[] = JSON.parse(json)
  paths = paths.filter(draft => !draft.match(/README\.md/i))
  return paths.map(file => new Draft(file))
}

async function cron(): Promise<void> {
  let drafts: Draft[]
  const dryRun = core.getInput('dry_run')

  if (dryRun === 'true') {
    core.info('Dry run enabled. Skipping publishing drafts')
  }

  const changed = getChangedFiles()
  if (changed.length > 0) {
    drafts = changed
  } else {
    drafts = getDrafts()
  }

  const pathsToProcess = drafts.map(draft => draft.path)
  core.info(`Found ${drafts.length} drafts`)
  core.info(`Processing drafts: ${pathsToProcess.join(', ')}`)

  for (const draft of drafts) {
    if (!draft.isPast && dryRun === 'false') {
      core.info(
        `Skipping draft ${draft.path} with date ${draft.date} as it is in the future`
      )
      continue
    }

    if (await draft.isPublished()) {
      core.info(`draft ${draft.title} is already published`)
      continue
    }

    await draft.publish()
  }
}

export async function run(): Promise<void> {
  try {
    cron()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
