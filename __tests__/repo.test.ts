import { jest } from '@jest/globals'
import { octokitForAuthor } from '../src/octokit'
import { resetSandbox, sandbox } from './sandbox'
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
    resetSandbox()
  })

  for (const author of [undefined, 'author']) {
    describe(`with author: ${author || 'default'}`, () => {
      let token: string
      const client = (): ReturnType<typeof octokitForAuthor> =>
        author ? octokitForAuthor(author) : undefined

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
        const repo = new Repository('owner', 'repo', client())
        const id = '123'
        mockRepo({ id, token })
        const result = await repo.getId()
        expect(result).toBe(id)
      })

      it("gets a label's ID", async () => {
        const repo = new Repository('owner', 'repo', client())
        const id = '123'
        mockLabel({ id: '123', token })
        const result = await repo.getLabelId('question')
        expect(result).toBe(id)
      })

      it('gets a category ID', async () => {
        const repo = new Repository('owner', 'repo', client())
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
        const repo = new Repository('owner', 'repo', client())
        const title = 'matched post'
        const date = new Date('2021-01-01')
        const id = 'post123'
        const url = 'https://github.com/owner./repo/discussions/1'
        mockPost({ nodes: [{ id, url, title }], token })
        const result = await repo.findDiscussion(title, date)
        expect(result).toBeDefined()
        expect(result?.id).toBe(id)
        expect(result?.url).toBe(url)
      })

      it('knows when a post has not been published', async () => {
        const repo = new Repository('owner', 'repo', client())
        const title = 'missing post'
        const date = new Date('2021-01-01')
        mockPost({ nodes: [], token })
        const result = await repo.findDiscussion(title, date)
        expect(result).toBeUndefined()
      })

      it('ignores discussions whose title only partially matches', async () => {
        const repo = new Repository('owner', 'repo', client())
        mockPost({ nodes: [{ title: 'matched post, part 2' }], token })
        const result = await repo.findDiscussion(
          'matched post',
          new Date('2021-01-01')
        )
        expect(result).toBeUndefined()
      })

      it('ignores matching discussions created before the draft date', async () => {
        const repo = new Repository('owner', 'repo', client())
        mockPost({
          nodes: [{ title: 'weekly post', createdAt: '2020-12-25T00:00:00Z' }],
          token
        })
        const result = await repo.findDiscussion(
          'weekly post',
          new Date('2021-01-01')
        )
        expect(result).toBeUndefined()
      })

      it('ignores matching discussions by a different author', async () => {
        const repo = new Repository('owner', 'repo', client())
        mockPost({
          nodes: [
            { title: 'weekly update', author: { login: 'someone-else' } }
          ],
          token
        })
        const result = await repo.findDiscussion(
          'weekly update',
          new Date('2021-01-01'),
          'author'
        )
        expect(result).toBeUndefined()
      })

      it('matches the author case-insensitively', async () => {
        const repo = new Repository('owner', 'repo', client())
        mockPost({
          nodes: [{ title: 'weekly update', author: { login: 'Author' } }],
          token
        })
        const result = await repo.findDiscussion(
          'weekly update',
          new Date('2021-01-01'),
          'author'
        )
        expect(result).toBeDefined()
      })

      it('matches any author when none is given', async () => {
        const repo = new Repository('owner', 'repo', client())
        mockPost({
          nodes: [
            { title: 'weekly update', author: { login: 'someone-else' } }
          ],
          token
        })
        const result = await repo.findDiscussion(
          'weekly update',
          new Date('2021-01-01')
        )
        expect(result).toBeDefined()
      })

      it('pages through discussions', async () => {
        const repo = new Repository('owner', 'repo', client())
        mockPost({
          nodes: [{ id: 'older', title: 'paged post' }],
          body: '"after":"cursor1"',
          token
        })
        mockPost({
          nodes: [{ title: 'something else' }],
          hasNextPage: true,
          endCursor: 'cursor1',
          body: '"after":null',
          token
        })
        const result = await repo.findDiscussion(
          'paged post',
          new Date('2021-01-01')
        )
        // 'older' is only on the second page
        expect(sandbox.callHistory.calls('matched')).toHaveLength(2)
        expect(result?.id).toBe('older')
      })

      it('throws when the lookup fails', async () => {
        jest.useFakeTimers()
        const repo = new Repository('owner', 'repo', client())
        sandbox.route(
          { method: 'POST', url: 'https://api.github.com/graphql' },
          { status: 500, body: { message: 'Server Error' } }
        )
        const promise = repo.findDiscussion('any', new Date('2021-01-01'))
        // eslint-disable-next-line jest/valid-expect
        const assertion = expect(promise).rejects.toThrow()
        await jest.advanceTimersByTimeAsync(10000)
        await assertion
        jest.useRealTimers()
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
      sandbox.route(
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
      sandbox.route(
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
