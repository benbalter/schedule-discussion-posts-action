import { sandbox } from '../src/octokit'
import { Repository } from '../src/repo'
import {
  mockLabel,
  mockRepo,
  mockCategory,
  mockPost,
  mockGraphQL
} from './fixtures'

describe('Repo', () => {
  beforeEach(() => {
    sandbox.restore()
  })

  for (const author of [undefined, 'author']) {
    describe(`with author: ${author || 'default'}`, () => {
      let token: string

      beforeAll(() => {
        if (author === 'author') {
          token = 'AUTHOR_TOKEN'
          process.env.INPUT_DISCUSSION_TOKEN_AUTHOR = token
        } else {
          token = 'TOKEN'
          process.env.INPUT_DISCUSSION_TOKEN_AUTHOR = undefined
        }
      })

      it("gets a repository's ID", async () => {
        const repo = new Repository('owner', 'repo', author)
        const id = '123'
        mockRepo({ id, token })
        const result = await repo.getId()
        expect(result).toBe(id)
      })

      it("gets a label's ID", async () => {
        const repo = new Repository('owner', 'repo', author)
        const id = '123'
        mockLabel({ id: '123', token })
        const result = await repo.getLabelId('question')
        expect(result).toBe(id)
      })

      it('gets a category ID', async () => {
        const repo = new Repository('owner', 'repo', author)
        const category = 'General'
        const id = '123'
        mockCategory({
          categories: [
            { id, name: category },
            { id: '456', name: 'Other' }
          ],
          token
        })
        const result = await repo.getCategoryId(category)
        expect(result).toBe(id)
      })

      it('knows when a post has been published', async () => {
        const repo = new Repository('owner', 'repo', author)
        const title = 'matched post'
        const date = new Date('2021-01-01')
        const id = 'post123'
        const url = 'https://github.com/owner./repo/discussions/1'
        mockPost({ nodes: [{ id, url }], token })
        const result = await repo.findDiscussion(title, date)
        expect(result).toBeDefined()
        expect(result?.id).toBe(id)
        expect(result?.url).toBe(url)
      })

      it('knows when a post has not been published', async () => {
        const repo = new Repository('owner', 'repo', author)
        const title = 'missing post'
        const date = new Date('2021-01-01')
        mockPost({ nodes: [], token })
        const result = await repo.findDiscussion(title, date)
        expect(result).toBeUndefined()
      })
    })
  }

  it('constructs', () => {
    const owner = 'owner'
    const name = 'repo'
    const repo = new Repository(owner, name)
    expect(repo.owner).toBe(owner)
    expect(repo.name).toBe(name)
  })

  describe('validate', () => {
    it('returns true when repo is accessible', async () => {
      const repo = new Repository('owner', 'repo')
      mockRepo()
      const result = await repo.validate()
      expect(result).toBe(true)
    })

    it('returns false when repo is not accessible', async () => {
      const repo = new Repository('owner', 'repo')
      sandbox.mock(
        {
          url: 'https://api.github.com/repos/owner/repo',
          headers: { authorization: 'token TOKEN' }
        },
        { status: 404, body: { message: 'Not Found' } }
      )
      const result = await repo.validate()
      expect(result).toBe(false)
    })
  })

  describe('pinDiscussion', () => {
    it('calls the GraphQL mutation successfully', async () => {
      const repo = new Repository('owner', 'repo')
      const mock = mockGraphQL(
        { data: { pinDiscussion: { discussion: { id: 'disc123' } } } },
        'pinDiscussion',
        'pinDiscussion'
      )
      await repo.pinDiscussion('disc123')
      expect(mock.called()).toBe(true)
    })

    it('handles errors gracefully', async () => {
      const repo = new Repository('owner', 'repo')
      sandbox.mock(
        {
          method: 'POST',
          url: 'https://api.github.com/graphql',
          name: 'pinDiscussionFail',
          headers: { authorization: 'token TOKEN' }
        },
        { status: 500, body: { message: 'Server Error' } }
      )
      // Should not throw
      await expect(repo.pinDiscussion('disc123')).resolves.toBeUndefined()
    })
  })
})
