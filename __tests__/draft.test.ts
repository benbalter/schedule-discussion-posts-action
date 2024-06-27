import { sandbox, octokit } from '../src/octokit'
import { Draft } from '../src/draft'
import {
  mockGraphQL,
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

  it('should delete', async () => {
    const { getMock, deleteMock } = mockFileDeletion()
    const draft = new Draft('./__tests__/fixtures/draft.md')
    await draft.delete()
    expect(getMock.called()).toBe(true)
    expect(deleteMock.called()).toBe(true)
  })

  it('Adds labels', async () => {
    mockLabel()
    const mock = mockLabelCreation()
    const draft = new Draft('./__tests__/fixtures/draft.md')
    draft.id = 'id123'

    await draft.addLabels()
    expect(mock.called()).toBe(true)
  })

  it('Publishes', async () => {
    const mock = mockCreateDiscussion()
    mockCategory()
    mockRepo()
    mockLabel()
    const labelMock = mockLabelCreation()
    const { getMock, deleteMock } = mockFileDeletion()

    const draft = new Draft('./__tests__/fixtures/draft.md')
    const id = await draft.publish()
    expect(mock.called()).toBe(true)
    expect(labelMock.called()).toBe(true)
    expect(deleteMock.called()).toBe(true)
    expect(getMock.called()).toBe(true)
    expect(id).toBe('id123')
  })

  it("Knows when it's published", async () => {
    const draft = new Draft('./__tests__/fixtures/draft.md')
    const mock = mockPost()
    const isPublished = await draft.isPublished()
    expect(mock.called()).toBe(true)
    expect(isPublished).toBe(true)
  })

  it("Knows when it's not published", async () => {
    const draft = new Draft('./__tests__/fixtures/future.md')
    const mock = mockPost({ nodes: [] })
    const isPublished = await draft.isPublished()
    expect(mock.called()).toBe(true)
    expect(isPublished).toBe(false)
  })

  it('uses the default octokit when no author is provided', async () => {
    const draft = new Draft('./__tests__/fixtures/draft.md')
    expect(draft.octokit).toBeDefined()
    expect(draft.octokit).toBe(octokit)

    const mock = sandbox.mock(
      {
        url: 'https://api.github.com/repos/owner/repo/labels/question',
        headers: {
          authorization: 'token TOKEN'
        }
      },
      {
        node_id: 'addlabel123'
      }
    )

    const data = {
      data: {
        addLabelsToLabelable: {
          discussion: {
            number: 1
          }
        }
      }
    }
    mockGraphQL(data, 'addLabels', 'addlabel123')
    draft.id = 'id123'

    await draft.addLabels()
    expect(mock.called()).toBe(true)
  })

  it('uses the author octokit when an author is provided', async () => {
    process.env['INPUT_DISCUSSION_TOKEN_HUBOT'] = 'author_token'
    const draft = new Draft('./__tests__/fixtures/author.md')
    expect(draft.octokit).toBeDefined()

    const mock = sandbox.mock(
      {
        url: 'https://api.github.com/repos/owner/repo/labels/question',
        headers: {
          authorization: 'token author_token'
        }
      },
      {
        node_id: 'addlabel123'
      }
    )

    const data = {
      data: {
        addLabelsToLabelable: {
          discussion: {
            number: 1
          }
        }
      }
    }
    mockGraphQL(data, 'addLabels', 'addlabel123')
    draft.id = 'id123'

    await draft.publish()
    expect(mock.called()).toBe(true)
  })
})
