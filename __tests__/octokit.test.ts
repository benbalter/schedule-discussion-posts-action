import {
  octokitForAuthor,
  octokit,
  repoOctokit,
  withRetry
} from '../src/octokit'

describe('octokit', () => {
  it('inits the discussion octokit', () => {
    expect(octokit).toBeDefined()
  })

  it('inits the repo octokit', () => {
    expect(repoOctokit).toBeDefined()
  })

  it('returns undefined when no author token is present', () => {
    process.env['INPUT_DISCUSSION_TOKEN_AUTHOR'] = ''
    const authorOctokit = octokitForAuthor('author')
    expect(authorOctokit).toBeUndefined()
  })

  it('inits the author octokit when the author token is present', () => {
    process.env['INPUT_DISCUSSION_TOKEN_AUTHOR'] = 'some_author_token'
    const authorOctokit = octokitForAuthor('author')
    expect(authorOctokit).toBeDefined()
  })

  describe('withRetry', () => {
    it('returns the value on first success', async () => {
      const fn = jest.fn().mockResolvedValue('ok')
      const result = await withRetry(fn, 'test', 3)
      expect(result).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries on failure and succeeds on 2nd attempt', async () => {
      jest.useFakeTimers()
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('ok')

      const promise = withRetry(fn, 'test', 3)
      await jest.advanceTimersByTimeAsync(2000)
      const result = await promise

      expect(result).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(2)
      jest.useRealTimers()
    })

    it('throws after max retries exhausted', async () => {
      jest.useFakeTimers()
      const fn = jest.fn().mockRejectedValue(new Error('fail'))

      const promise = withRetry(fn, 'test', 3)
      // Attach rejection handler before advancing timers to avoid unhandled rejection
      const resultPromise = expect(promise).rejects.toThrow('fail')

      await jest.advanceTimersByTimeAsync(2000)
      await jest.advanceTimersByTimeAsync(4000)

      await resultPromise
      expect(fn).toHaveBeenCalledTimes(3)
      jest.useRealTimers()
    })
  })
})
