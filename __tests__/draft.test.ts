import { sandbox } from '../src/octokit'
import { Draft } from '../src/draft'
import { mockGraphQL } from './fixtures'

describe('draft', () => {
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
    const getMock = sandbox.mock(
      {
        url: 'https://api.github.com/repos/owner/repo/contents/.%2F__tests__%2Ffixtures%2Fdraft.md',
        method: 'GET'
      },
      { sha: 'sha123' }
    )
    const deleteMock = sandbox.mock(
      {
        url: 'https://api.github.com/repos/owner/repo/contents/.%2F__tests__%2Ffixtures%2Fdraft.md',
        //TODO: Validate SHA and message
        method: 'DELETE'
      },
      200
    )
    const draft = new Draft('./__tests__/fixtures/draft.md')
    await draft.delete()
    expect(getMock.called()).toBe(true)
    expect(deleteMock.called()).toBe(true)
  })

  it('Adds labels', async () => {
    //TODO
  })

  it('Publishes', async () => {
    const postData = {
      data: {
        createDiscussion: {
          discussion: {
            id: 'id123',
            url: 'https://github.com/owner/repo/discussions/1'
          }
        }
      }
    }

    // Mock the create mutation
    const mock = mockGraphQL(postData, 'publish', 'createDiscussion')

    // Mock the query to get the discussion category ID
    const categoryData = {
      data: {
        repository: {
          discussionCategories: {
            nodes: [
              { id: '123', name: 'General' },
              { id: '456', name: 'Other' }
            ]
          }
        }
      }
    }
    mockGraphQL(
      categoryData,
      'repoDiscussionCategoryQuery',
      'discussionCategories'
    )

    // Mock the query to get the Repo ID
    sandbox.mock('https://api.github.com/repos/owner/repo', {
      node_id: 'id123'
    })

    // Mock the query to get the Label ID
    sandbox.mock('https://api.github.com/repos/owner/repo/labels/question', {
      node_id: 'label123'
    })

    const draft = new Draft('./__tests__/fixtures/draft.md')
    const id = await draft.publish()
    expect(mock.called()).toBe(true)
    expect(id).toBe('id123')
  })

  it("Knows when it's published", async () => {
    const draft = new Draft('./__tests__/fixtures/draft.md')
    const postID = 'post123'
    const postUrl = 'https://github.com/owner./repo/discussions/1'
    const responseData = {
      data: {
        search: {
          nodes: [{ id: postID, url: postUrl }]
        }
      }
    }
    const mock = mockGraphQL(responseData, 'postIsPublished', draft.title)
    const isPublished = await draft.isPublished()
    expect(mock.called()).toBe(true)
    expect(isPublished).toBe(true)
  })

  it("Knows when it's not published", async () => {
    const draft = new Draft('./__tests__/fixtures/future.md')
    const responseData = {
      data: {
        search: {
          nodes: []
        }
      }
    }
    const mock = mockGraphQL(responseData, 'postIsNotPublished', draft.title)
    const isPublished = await draft.isPublished()
    expect(mock.called()).toBe(true)
    expect(isPublished).toBe(false)
  })
})
