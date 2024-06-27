import { octokitForAuthor, octokit, repoOctokit } from '../src/octokit'

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
})
