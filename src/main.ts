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

export async function run(): Promise<void> {
  try {
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
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
