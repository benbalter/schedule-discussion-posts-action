import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import { Draft } from './draft'

interface DraftResult {
  path: string
  title: string
  status: 'published' | 'skipped_future' | 'skipped_published' | 'invalid'
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
      invalid: '❌ Invalid'
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
      rows.map(row =>
        row.map(cell => ({
          data: cell,
          header: rows.indexOf(row) === 0
        }))
      )
    )
    .write()
}

async function cron(): Promise<void> {
  let drafts: Draft[]
  const dryRun = core.getInput('dry_run')
  const results: DraftResult[] = []

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

  const publishedUrls: string[] = []
  let publishedCount = 0
  let skippedCount = 0

  for (const draft of drafts) {
    if (!draft.valid) {
      core.warning(`Skipping invalid draft: ${draft.path}`)
      results.push({
        path: draft.path,
        title: draft.title || draft.path,
        status: 'invalid'
      })
      skippedCount++
      continue
    }

    if (!draft.isPast && dryRun === 'false') {
      core.info(
        `Skipping draft ${draft.path} with date ${draft.date} as it is in the future`
      )
      results.push({
        path: draft.path,
        title: draft.title || draft.path,
        status: 'skipped_future',
        targetRepo: `${draft.repository?.owner}/${draft.repository?.name}`
      })
      skippedCount++
      continue
    }

    if (await draft.isPublished()) {
      core.warning(`draft ${draft.title} is already published`)
      results.push({
        path: draft.path,
        title: draft.title || draft.path,
        status: 'skipped_published',
        targetRepo: `${draft.repository?.owner}/${draft.repository?.name}`
      })
      skippedCount++
      continue
    }

    await draft.publish()

    if (draft.url) {
      publishedCount++
      publishedUrls.push(draft.url)
      results.push({
        path: draft.path,
        title: draft.title || draft.path,
        status: 'published',
        url: draft.url,
        targetRepo: `${draft.repository?.owner}/${draft.repository?.name}`
      })
    } else {
      skippedCount++
      results.push({
        path: draft.path,
        title: draft.title || draft.path,
        status: 'invalid',
        targetRepo: `${draft.repository?.owner}/${draft.repository?.name}`
      })
    }
  }

  core.setOutput('published_count', publishedCount.toString())
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
