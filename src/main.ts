import * as core from '@actions/core'
import * as fs from 'fs'
import { Draft } from './draft'

function getDrafts(): Draft[] {
  const files = fs.readdirSync('./')
  let drafts = files.filter(file => file.endsWith('.md'))
  drafts = drafts.filter(file => !file.match(/README\.md/i))
  core.info(`Found ${drafts.length} drafts`)
  return drafts.map(file => new Draft(file))
}

function getChangedFiles(): Draft[] {
  const json = core.getInput('files')
  const paths: string[] = JSON.parse(json)
  return paths.map(file => new Draft(file)
}

async function cron(): Promise<void> {
  let drafts: Draft[];
  const changed = core.getInput('changed')
  const dryRun = core.getInput('dry_run')

  if (dryRun === 'true') {
    core.info('Dry run enabled. Skipping publishing drafts')
  }

  if (changed.length > 0) {
    drafts = getChangedFiles()
  } else {
    drafts = getDrafts()
  }

  const pathsToProcess = drafts.map(draft => draft.path)
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
    const linting = core.getInput('lint')
    if (linting === 'true') {
      lint()
    } else {
      cron()
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
