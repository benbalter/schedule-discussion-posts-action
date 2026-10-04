import { jest } from '@jest/globals'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { resetSandbox, sandbox } from './sandbox'
import { Draft } from '../src/draft'
import { run } from '../src/main'
import {
  mockCategory,
  mockCreateDiscussion,
  mockFileDeletion,
  mockLabel,
  mockLabelCreation,
  mockPost,
  mockRepo
} from './fixtures'

const DRAFT = './__tests__/fixtures/draft.md'
const FUTURE = './__tests__/fixtures/future.md'

describe('main', () => {
  let outputs: Record<string, string>
  let setFailedSpy: jest.SpyInstance

  // core.summary caches the file path on first write, so use one file
  const summaryFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'summary-')),
    'summary.md'
  )

  beforeEach(() => {
    resetSandbox()
    process.env.GITHUB_REPOSITORY = 'source-owner/source-repo'
    process.env.INPUT_DRY_RUN = 'false'
    process.env.GITHUB_STEP_SUMMARY = summaryFile
    fs.writeFileSync(summaryFile, '')

    outputs = {}
    jest
      .spyOn(core, 'setOutput')
      .mockImplementation((name: string, value: unknown) => {
        outputs[name] = String(value)
      })
    setFailedSpy = jest.spyOn(core, 'setFailed').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.INPUT_FILES
    delete process.env.INPUT_DRY_RUN
  })

  const setFiles = (...files: string[]): void => {
    process.env.INPUT_FILES = JSON.stringify(files)
  }

  it('publishes a past draft', async () => {
    setFiles(DRAFT)
    mockPost({ nodes: [] })
    mockCategory()
    mockRepo()
    mockCreateDiscussion()
    mockLabel()
    mockLabelCreation()
    const { deleteMock } = mockFileDeletion()

    await run()

    expect(deleteMock.called()).toBe(true)
    expect(outputs.published_count).toBe('1')
    expect(outputs.skipped_count).toBe('0')
    expect(JSON.parse(outputs.published_urls)).toEqual([
      'https://github.com/owner/repo/discussions/1'
    ])
    expect(setFailedSpy).not.toHaveBeenCalled()
  })

  it('does not publish future drafts when dry_run is a non-lowercase false', async () => {
    process.env.INPUT_DRY_RUN = 'False'
    setFiles(FUTURE)

    await run()

    expect(sandbox.callHistory.called()).toBe(false)
    expect(outputs.published_count).toBe('0')
    expect(outputs.skipped_count).toBe('1')
  })

  it('fails on an invalid dry_run value instead of guessing', async () => {
    process.env.INPUT_DRY_RUN = 'maybe'
    setFiles(DRAFT)

    await run()

    expect(sandbox.callHistory.called()).toBe(false)
    expect(setFailedSpy).toHaveBeenCalledWith(
      expect.stringContaining('dry_run')
    )
  })

  it('deletes a draft whose post was already published', async () => {
    setFiles(DRAFT)
    mockPost()
    const { deleteMock } = mockFileDeletion()

    await run()

    expect(deleteMock.called()).toBe(true)
    expect(outputs.published_count).toBe('0')
    expect(outputs.skipped_count).toBe('1')
  })

  it('does not delete an already-published draft in dry run', async () => {
    process.env.INPUT_DRY_RUN = 'true'
    setFiles(DRAFT)
    mockPost()
    const { getMock, deleteMock } = mockFileDeletion()

    await run()

    expect(getMock.called()).toBe(false)
    expect(deleteMock.called()).toBe(false)
  })

  it('keeps processing drafts after one throws', async () => {
    setFiles(DRAFT, FUTURE)
    jest
      .spyOn(Draft.prototype, 'isPublished')
      .mockRejectedValueOnce(new Error('boom'))

    await run()

    expect(setFailedSpy).toHaveBeenCalledWith(expect.stringContaining('boom'))
    expect(outputs.skipped_count).toBe('2')
    const summary = fs.readFileSync(summaryFile, 'utf8')
    expect(summary).toContain('Failed')
    expect(summary).toContain('Scheduled')
  })
})
