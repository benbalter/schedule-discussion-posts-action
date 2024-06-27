import { sandbox } from '../src/octokit'
import { Repository } from '../src/repo'
import {
  mockGraphQL,
  mockLabel,
  mockRepo,
  mockCategory,
  mockPost
} from './fixtures'

describe('Repo', () => {
  beforeEach(() => {
    sandbox.restore()
    process.env.INPUTS_DISCUSSION_TOKEN_AUTHOR = ''
  })

  it('constructs', () => {
    const owner = 'owner'
    const name = 'repo'
    const repo = new Repository(owner, name)
    expect(repo.owner).toBe(owner)
    expect(repo.name).toBe(name)
  })

  it.only('gets a category ID', async () => {
    const repo = new Repository('owner', 'repo')
    const category = 'General'
    const id = '123'
    mockCategory({
      categories: [
        { id, name: category },
        { id: '456', name: 'Other' }
      ]
    })
    const result = await repo.getCategoryId(category)
    expect(result).toBe(id)
  })

  it('uses the author token to get the repo ID when present', async () => {
    process.env.INPUT_DISCUSSION_TOKEN_AUTHOR = 'author_token'
    const repo = new Repository('owner', 'repo', 'author')
    const mock = sandbox.mock(
      {
        url: 'https://api.github.com/repos/owner/repo',
        headers: {
          authorization: 'token author_token'
        }
      },
      {
        node_id: '123'
      }
    )
    await repo.getId()
    expect(mock.called()).toBe(true)
  })

  it("gets a repository's ID", async () => {
    const repo = new Repository('owner', 'repo')
    const id = '123'
    mockRepo({ id })
    const result = await repo.getId()
    expect(result).toBe(id)
  })

  it("gets a label's ID", async () => {
    const repo = new Repository('owner', 'repo')
    const id = '123'
    mockLabel({ id: '123' })
    const result = await repo.getLabelId('question')
    expect(result).toBe(id)
  })

  it('knows when a post has been published', async () => {
    const repo = new Repository('owner', 'repo')
    const title = 'matched post'
    const date = new Date('2021-01-01')
    const id = 'post123'
    const url = 'https://github.com/owner./repo/discussions/1'
    mockPost({ nodes: [{ id, url }] })
    const result = await repo.findDiscussion(title, date)
    expect(result).toBeDefined()
    expect(result?.id).toBe(id)
    expect(result?.url).toBe(url)
  })

  it('knows when a post has not been published', async () => {
    const repo = new Repository('owner', 'repo')
    const title = 'missing post'
    const date = new Date('2021-01-01')
    mockPost({ nodes: [] })
    const result = await repo.findDiscussion(title, date)
    expect(result).toBeUndefined()
  })
})
