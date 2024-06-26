import * as core from '@actions/core'
import * as fs from 'fs'
import { Draft } from './draft'
import { Linter } from './linter'

function getDrafts(): Draft[] {
  const files = fs.readdirSync('./')
  let drafts = files.filter(file => file.endsWith('.md'))
  drafts = drafts.filter(file => !file.match(/README\.md/i))
  core.info(`Found ${drafts.length} drafts`)
  return drafts.map(file => new Draft(file))
}

function getChangedFiles() {
  const json = core.getInput('changed_files')
  return JSON.parse(json)
}

function lint() {
  const changedFiles = getChangedFiles()

  if (changedFiles.length === 0) {
    core.info('No Markdown files changed. Skipping linting.')
    return
  }

  for (const file of changedFiles) {
    console.log(file)
    const linter = new Linter(file)
  }
}

async function cron(): Promise<void> {
  const drafts = getDrafts()

  for (const draft of drafts) {
    if (draft.date === undefined) {
      core.info(`Skipping draft ${draft.path} with no date`)
      continue
    }

    if (!draft.isPast) {
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
