import { sandbox } from '../src/octokit'

export function mockGraphQL(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>,
  name: string,
  body?: string,
  token?: string
): typeof sandbox.mock {
  const response = { status: 200, body: data }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matcher = (_: string, options: Record<string, any>): boolean => {
    if (body == null) {
      return true
    }

    if (options.body == null) {
      return false
    }

    return options.body.toString().includes(body)
  }
  return sandbox.mock(
    {
      method: 'POST',
      url: 'https://api.github.com/graphql',
      name,
      headers: {
        authorization: `token ${token || 'TOKEN'}`
      },
      functionMatcher: matcher
    },
    response,
    { sendAsJson: true }
  )
}

export function mockLabel(options?: {
  label?: string
  id?: string
  token?: string
}): typeof sandbox.mock {
  const defaults = { label: 'question', id: 'label123', token: 'TOKEN' }
  const { label, id, token } = { ...defaults, ...options }

  return sandbox.mock(
    {
      url: `https://api.github.com/repos/owner/repo/labels/${label}`,
      headers: { authorization: `token ${token}` }
    },
    {
      node_id: id
    }
  )
}

export function mockRepo(options?: {
  owner?: string
  name?: string
  id?: string
  token?: string
}): typeof sandbox.mock {
  const defaults = { owner: 'owner', name: 'repo', id: 'id123', token: 'TOKEN' }
  const { owner, name, id, token } = { ...defaults, ...options }

  return sandbox.mock(
    {
      url: `https://api.github.com/repos/${owner}/${name}`,
      headers: {
        authorization: `token ${token}`
      }
    },
    {
      node_id: id
    }
  )
}

export function mockCreateDiscussion(options?: {
  id?: string
  url?: string
  token?: string
}): typeof sandbox.mock {
  const defaults = {
    id: 'id123',
    url: 'https://github.com/owner/repo/discussions/1',
    token: 'TOKEN'
  }
  const { id, url, token } = { ...defaults, ...options }

  const postData = {
    data: {
      createDiscussion: {
        discussion: {
          id,
          url
        }
      }
    }
  }

  return mockGraphQL(postData, 'publish', 'createDiscussion', token)
}

export function mockCategory(options?: {
  categories?: { id: string; name: string }[]
  token?: string
}): typeof sandbox.mock {
  const defaults = {
    categories: [
      { id: '123', name: 'General' },
      { id: '456', name: 'Other' }
    ],
    token: 'TOKEN'
  }
  const { categories, token } = { ...defaults, ...options }
  const categoryData = {
    data: {
      repository: {
        discussionCategories: {
          nodes: categories
        }
      }
    }
  }
  return mockGraphQL(
    categoryData,
    'repoDiscussionCategoryQuery',
    'discussionCategories',
    token
  )
}

export function mockLabelCreation(options?: {
  label?: string
  number?: number
  token?: string
}): typeof sandbox.mock {
  const defaults = { number: 1, token: 'TOKEN', label: 'question' }
  const { number, token, label } = { ...defaults, ...options }
  const data = {
    data: {
      addLabelsToLabelable: {
        discussion: {
          number
        }
      }
    }
  }
  return mockGraphQL(data, 'addLabels', label, token)
}

export function mockFileDeletion(options?: {
  url?: string
  sha?: string
  token: string
  path?: string
  publishedUrl?: string
}): { getMock: typeof sandbox.mock; deleteMock: typeof sandbox.mock } {
  const defaults = {
    url: 'https://api.github.com/repos/owner/repo/contents/.%2F__tests__%2Ffixtures%2Fdraft.md',
    sha: 'sha123',
    token: 'REPO_TOKEN',
    path: './__tests__/fixtures/draft.md',
    publishedUrl: 'https://github.com/owner/repo/discussions/1'
  }
  const { url, sha, token, path, publishedUrl } = { ...defaults, ...options }
  const message = `Delete ${path}
    
    The post has been published as ${publishedUrl}`

  const getMock = sandbox.mock(
    {
      url,
      method: 'GET',
      headers: {
        authorization: `token ${token}`
      }
    },
    { sha }
  )
  const deleteMock = sandbox.mock(
    {
      url,
      body: {
        message,
        sha
      },
      method: 'DELETE',
      headers: {
        authorization: `token ${token}`
      }
    },
    200
  )

  return { getMock, deleteMock }
}

export function mockPost(options?: {
  nodes?: { id?: string; url?: string }[]
  token?: string
}): typeof sandbox.mock {
  const defaults = {
    nodes: [
      { id: 'post123', url: 'https://github.com/owner./repo/discussions/1' }
    ]
  }
  const { nodes, token } = { ...defaults, ...options }
  const responseData = {
    data: {
      search: {
        nodes
      }
    }
  }
  return mockGraphQL(responseData, 'postIsPublished', 'search', token)
}
