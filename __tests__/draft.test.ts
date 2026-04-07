import * as core from '@actions/core'
import { sandbox } from '../src/octokit'
import { Draft } from '../src/draft'
import {
  mockLabel,
  mockRepo,
  mockCreateDiscussion,
  mockCategory,
  mockLabelCreation,
  mockFileDeletion,
  mockPost
} from './fixtures'

describe('draft', () => {
  beforeEach(() => {
    sandbox.restore()
    process.env.GITHUB_REPOSITORY = 'source-owner/source-repo'
  })

  it('should read the contents', () => {
    const draft = new Draft('./__tests__/fixtures/draft.md')
    expect(draft.contents).toBeDefined()
  })

  it('should parse the front matter', () => {
    const draft = new Draft('./__tests__/fixtures/draft.md')
    expect(draft.title).toBe('Draft post')
    expect(draft.repository).toBeDefined()
    expect(draft.date).toStrictEqual(new Date('2024-01-01T19:00:00.000Z'))
    expect(draft.category).toBe('General')
    expect(draft.repository?.owner).toBe('owner')
    expect(draft.repository?.name).toBe('repo')
    expect(draft.labels).toEqual(['question'])
  })

  it('should parse the body', () => {
    const draft = new Draft('./__tests__/fixtures/draft.md')
    expect(draft.body).toBe('Body of draft post')
  })

  it('should know its in the past', () => {
    const draft = new Draft('./__tests__/fixtures/draft.md')
    expect(draft.isPast).toBe(true)
  })

  it('should know its in the future', () => {
    const draft = new Draft('./__tests__/fixtures/future.md')
    expect(draft.isPast).toBe(false)
  })

  it('should be valid for a well-formed draft', () => {
    const draft = new Draft('./__tests__/fixtures/draft.md')
    expect(draft.valid).toBe(true)
  })

  it('should be invalid for a non-existent file', () => {
    const draft = new Draft('./__tests__/fixtures/nonexistent.md')
    expect(draft.valid).toBe(false)
  })

  it('should not call setFailed for a file without front matter', () => {
    const setFailedSpy = jest.spyOn(core, 'setFailed')
    const draft = new Draft('./__tests__/fixtures/no-frontmatter.md')
    expect(draft.valid).toBe(false)
    expect(setFailedSpy).not.toHaveBeenCalled()
    setFailedSpy.mockRestore()
  })

  it('should not call setFailed for a non-existent file', () => {
    const setFailedSpy = jest.spyOn(core, 'setFailed')
    const draft = new Draft('./__tests__/fixtures/nonexistent.md')
    expect(draft.valid).toBe(false)
    expect(setFailedSpy).not.toHaveBeenCalled()
    setFailedSpy.mockRestore()
  })

  describe('interpolateVariables', () => {
    it('replaces known variables', () => {
      const draft = new Draft('./__tests__/fixtures/draft.md')
      const result = draft.interpolateVariables(
        '{{title}} in {{category}} of {{repository}}'
      )
      expect(result).toBe('Draft post in General of owner/repo')
    })

    it('leaves unknown variables untouched', () => {
      const draft = new Draft('./__tests__/fixtures/draft.md')
      const result = draft.interpolateVariables('Hello {{unknown}}')
      expect(result).toBe('Hello {{unknown}}')
    })

    it('handles undefined body', () => {
      const draft = new Draft('./__tests__/fixtures/draft.md')
      const result = draft.interpolateVariables(undefined)
      expect(result).toBeUndefined()
    })
  })

  describe('pin field', () => {
    it('parses pin: true from front matter', () => {
      const draft = new Draft('./__tests__/fixtures/pinned.md')
      expect(draft.pin).toBe(true)
    })

    it('defaults pin to false when not specified', () => {
      const draft = new Draft('./__tests__/fixtures/draft.md')
      expect(draft.pin).toBe(false)
    })
  })

  describe('YAML array labels', () => {
    it('parses labels as an array', () => {
      const draft = new Draft('./__tests__/fixtures/array-labels.md')
      expect(draft.labels).toEqual(['bug', 'feature'])
    })
  })

  it('should delete', async () => {
    const { getMock, deleteMock } = mockFileDeletion()
    const draft = new Draft('./__tests__/fixtures/draft.md')
    draft.url = 'https://github.com/owner/repo/discussions/1'
    await draft.delete()
    expect(getMock.called()).toBe(true)
    expect(deleteMock.called()).toBe(true)
  })

  for (const author of [undefined, 'author']) {
    describe(`with author: ${author || 'default'}`, () => {
      let token: string
      let fixture: string

      beforeAll(() => {
        if (author === 'author') {
          token = 'AUTHOR_TOKEN'
          process.env.INPUT_DISCUSSION_TOKEN_AUTHOR = token
        } else {
          token = 'TOKEN'
          process.env.INPUT_DISCUSSION_TOKEN_AUTHOR = undefined
        }
        fixture = `./__tests__/fixtures/${author || 'default'}.md`
      })

      it('Adds labels', async () => {
        mockLabel({ token })
        const mock = mockLabelCreation({ token })
        const draft = new Draft(fixture)
        draft.id = 'id123'

        await draft.addLabels()
        expect(mock.called()).toBe(true)
      })

      it("Knows when it's published", async () => {
        const draft = new Draft(fixture)
        const mock = mockPost({ token })
        const isPublished = await draft.isPublished()
        expect(mock.called()).toBe(true)
        expect(isPublished).toBe(true)
      })

      it("Knows when it's not published", async () => {
        const draft = new Draft(fixture)
        const mock = mockPost({ nodes: [], token })
        const isPublished = await draft.isPublished()
        expect(mock.called()).toBe(true)
        expect(isPublished).toBe(false)
      })

      it('Publishes', async () => {
        const mock = mockCreateDiscussion({ token })
        mockCategory({ token })
        mockRepo({ token })
        mockLabel({ token })
        const labelMock = mockLabelCreation({ token })
        const { getMock, deleteMock } = mockFileDeletion()

        const draft = new Draft(fixture)
        const id = await draft.publish()
        expect(mock.called()).toBe(true)
        expect(labelMock.called()).toBe(true)
        expect(deleteMock.called()).toBe(true)
        expect(getMock.called()).toBe(true)
        expect(id).toBe('id123')
      })
    })
  }
})
