import { sandbox } from '../src/octokit'
import { Repository } from '../src/repo'
import { mockGraphQL } from './fixtures'

describe('Repo', () => {
  it('constructs', () => {
    const owner = 'owner'
    const name = 'repo'
    const repo = new Repository(owner, name)
    expect(repo.owner).toBe(owner)
    expect(repo.name).toBe(name)
  })

  it('gets a category ID', async () => {
    const repo = new Repository('owner', 'repo')
    const category = 'General'
    const id = '123'
    const data = {
      data: {
        repository: {
          discussionCategories: {
            nodes: [
              { id, name: category },
              { id: '456', name: 'Other' }
            ]
          }
        }
      }
    }
    mockGraphQL(data, 'repoDiscussionCategoryQuery', 'discussionCategories')
    const result = await repo.getCategoryId(category)
    expect(result).toBe(id)
  })

  it("gets a repository's ID", async () => {
    const repo = new Repository('owner', 'repo')
    const id = '123'
    sandbox.mock('https://api.github.com/repos/owner/repo', { node_id: id })
    const result = await repo.getId()
    expect(result).toBe(id)
  })

  it("gets a label's ID", async () => {
    const repo = new Repository('owner', 'repo')
    const id = '123'
    sandbox.mock('https://api.github.com/repos/owner/repo/labels/question', {
      node_id: id
    })

    const result = await repo.getLabelId('question')
    expect(result).toBe(id)
  })

  it('knows when a post has been published', async () => {
    const repo = new Repository('owner', 'repo')
    const title = 'matched post'
    const date = new Date('2021-01-01')
    const postID = 'post123'
    const postUrl = 'https://github.com/owner./repo/discussions/1'
    const responseData = {
      data: {
        search: {
          nodes: [{ id: postID, url: postUrl }]
        }
      }
    }
    mockGraphQL(responseData, 'searchWithMatch', title)
    const result = await repo.findDiscussion(title, date)
    expect(result).toBeDefined()
    expect(result?.id).toBe(postID)
    expect(result?.url).toBe(postUrl)
  })

  it('knows when a post has not been published', async () => {
    const repo = new Repository('owner', 'repo')
    const title = 'missing post'
    const date = new Date('2021-01-01')
    const responseData = {
      data: {
        search: {
          nodes: []
        }
      }
    }
    mockGraphQL(responseData, 'searchWithoutMatch', title)
    const result = await repo.findDiscussion(title, date)
    expect(result).toBeUndefined()
  })
})
