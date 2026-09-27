import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import { Draft } from './draft'
import { isDryRun } from './inputs'

interface DraftResult {
  path: string
  title: string
  status:
    | 'published'
    | 'skipped_future'
    | 'skipped_published'
    | 'invalid'
    | 'failed'
  url?: string
  targetRepo?: string
}

const EXCLUDED_DIRS = new Set(['node_modules', '__tests__', 'dist', 'coverage'])

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) {
      continue
    }

    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (!entry.name.match(/README\.md/i)) {
        results.push(fullPath)
      }
    }
  }

  return results
}

function getDrafts(): Draft[] {
  const draftsDir = core.getInput('drafts_dir') || './'
  const files = findMarkdownFiles(draftsDir)
  return files.map(file => new Draft(file))
}

function getChangedFiles(): Draft[] {
  const json = core.getInput('files')

  if (json === '') {
    return []
  }

  let paths: string[]
  try {
    paths = JSON.parse(json)
  } catch (error) {
    core.setFailed(
      `Failed to parse 'files' input as JSON: ${error}. Expected a JSON array of file paths.`
    )
    return []
  }

  if (!Array.isArray(paths)) {
    core.setFailed(
      `'files' input must be a JSON array of file paths, got: ${typeof paths}`
    )
    return []
  }

  paths = paths
    .filter((p): p is string => typeof p === 'string')
    .filter(draft => !draft.match(/README\.md/i))
  return paths.map(file => new Draft(file))
}

async function writeSummary(results: DraftResult[]): Promise<void> {
  if (results.length === 0) {
    await core.summary.addRaw('No drafts found to process.').write()
    return
  }

  const rows: string[][] = [['Draft', 'Status', 'Target Repo', 'URL']]

  for (const result of results) {
    const statusEmoji = {
      published: '✅ Published',
      skipped_future: '⏳ Scheduled',
      skipped_published: '⚠️ Already published',
      invalid: '❌ Invalid',
      failed: '❌ Failed'
    }[result.status]

    rows.push([
      result.title || result.path,
      statusEmoji,
      result.targetRepo || '—',
      result.url ? `[Link](${result.url})` : '—'
    ])
  }

  await core.summary
    .addHeading('Discussion Posts Summary', 2)
    .addTable(
      rows.map((row, index) =>
        row.map(cell => ({
          data: cell,
          header: index === 0
        }))
      )
    )
    .write()
}

async function processDraft(
  draft: Draft,
  dryRun: boolean
): Promise<DraftResult> {
  const result: DraftResult = {
    path: draft.path,
    title: draft.title || draft.path,
    status: 'invalid'
  }

  if (!draft.valid) {
    core.warning(`Skipping invalid draft: ${draft.path}`)
    return result
  }

  result.targetRepo = `${draft.repository?.owner}/${draft.repository?.name}`

  if (!draft.isPast && !dryRun) {
    core.info(
      `Skipping draft ${draft.path} with date ${draft.date} as it is in the future`
    )
    return { ...result, status: 'skipped_future' }
  }

  if (await draft.isPublished()) {
    core.warning(`Draft ${draft.title} is already published at ${draft.url}`)

    // A previous run published the post but failed to delete the draft
    if (!dryRun) {
      await draft.delete()
    }

    return { ...result, status: 'skipped_published', url: draft.url }
  }

  await draft.publish()

  if (draft.url === undefined) {
    return { ...result, status: dryRun ? 'invalid' : 'failed' }
  }

  return { ...result, status: 'published', url: draft.url }
}

async function cron(): Promise<void> {
  const dryRun = isDryRun()
  const results: DraftResult[] = []

  if (dryRun) {
    core.info('Dry run enabled. Skipping publishing drafts')
  }

  const changed = getChangedFiles()
  const drafts = changed.length > 0 ? changed : getDrafts()

  core.info(`Found ${drafts.length} drafts`)
  core.info(`Processing drafts: ${drafts.map(d => d.path).join(', ')}`)

  for (const draft of drafts) {
    try {
      results.push(await processDraft(draft, dryRun))
    } catch (error) {
      // Keep going so one bad draft doesn't block the rest
      core.setFailed(`Failed to process draft ${draft.path}: ${error}`)
      results.push({
        path: draft.path,
        title: draft.title || draft.path,
        status: 'failed'
      })
    }
  }

  const publishedUrls = results
    .filter(result => result.status === 'published')
    .map(result => result.url)
  const skippedCount = results.length - publishedUrls.length

  core.setOutput('published_count', publishedUrls.length.toString())
  core.setOutput('skipped_count', skippedCount.toString())
  core.setOutput('published_urls', JSON.stringify(publishedUrls))

  await writeSummary(results)
}

export async function run(): Promise<void> {
  try {
    await cron()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
