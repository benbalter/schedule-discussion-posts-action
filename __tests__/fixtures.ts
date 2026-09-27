import { sandbox } from '../src/octokit'

// A handle to one mocked route. (sandbox.mock() returns the whole sandbox, so
// calling .called() on it reports whether *any* request was made.)
export interface Route {
  called: () => boolean
}

function route(name: string): Route {
  return { called: () => sandbox.called(name) }
}

export function mockGraphQL(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>,
  name: string,
  body?: string,
  token?: string
): Route {
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
  sandbox.mock(
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
  return route(name)
}

export function mockLabel(options?: {
  label?: string
  id?: string
  token?: string
}): Route {
  const defaults = { label: 'question', id: 'label123', token: 'TOKEN' }
  const { label, id, token } = { ...defaults, ...options }

  const name = `label-${label}-${token}`
  sandbox.mock(
    {
      name,
      url: `https://api.github.com/repos/owner/repo/labels/${label}`,
      headers: { authorization: `token ${token}` }
    },
    {
      node_id: id
    }
  )
  return route(name)
}

export function mockRepo(options?: {
  owner?: string
  name?: string
  id?: string
  token?: string
}): Route {
  const defaults = { owner: 'owner', name: 'repo', id: 'id123', token: 'TOKEN' }
  const { owner, name, id, token } = { ...defaults, ...options }

  const routeName = `repo-${owner}/${name}-${token}`
  sandbox.mock(
    {
      name: routeName,
      url: `https://api.github.com/repos/${owner}/${name}`,
      headers: {
        authorization: `token ${token}`
      }
    },
    {
      node_id: id
    }
  )
  return route(routeName)
}

export function mockCreateDiscussion(options?: {
  id?: string
  url?: string
  token?: string
}): Route {
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
}): Route {
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
  labelId?: string
  number?: number
  token?: string
}): Route {
  const defaults = { number: 1, token: 'TOKEN', labelId: 'label123' }
  const { number, token, labelId } = { ...defaults, ...options }
  const data = {
    data: {
      addLabelsToLabelable: {
        discussion: {
          number
        }
      }
    }
  }
  return mockGraphQL(data, `addLabels-${labelId}`, `"${labelId}"`, token)
}

export function mockFileDeletion(options?: {
  url?: string
  sha?: string
  token?: string
  path?: string
  publishedUrl?: string
}): { getMock: Route; deleteMock: Route } {
  const defaults = {
    url: 'https://api.github.com/repos/source-owner/source-repo/contents/.%2F__tests__%2Ffixtures%2Fdraft.md',
    sha: 'sha123',
    token: 'REPO_TOKEN',
    path: './__tests__/fixtures/draft.md',
    publishedUrl: 'https://github.com/owner/repo/discussions/1'
  }
  const { url, sha, token, path, publishedUrl } = { ...defaults, ...options }
  const message = `Delete ${path}\n\nThe post has been published as ${publishedUrl}`

  sandbox.mock(
    {
      name: 'getFile',
      url,
      method: 'GET',
      headers: {
        authorization: `token ${token}`
      }
    },
    { sha }
  )
  sandbox.mock(
    {
      name: 'deleteFile',
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

  return { getMock: route('getFile'), deleteMock: route('deleteFile') }
}

export function mockPost(options?: {
  nodes?: { id?: string; url?: string; title?: string; createdAt?: string }[]
  title?: string
  token?: string
  hasNextPage?: boolean
  endCursor?: string | null
  body?: string
}): Route {
  const defaults = {
    title: 'Draft post',
    hasNextPage: false,
    endCursor: null,
    body: 'orderBy'
  }
  const { title, token, hasNextPage, endCursor, body } = {
    ...defaults,
    ...options
  }
  const nodeDefaults = {
    id: 'post123',
    url: 'https://github.com/owner/repo/discussions/1',
    title,
    createdAt: '2024-01-02T00:00:00Z'
  }
  const nodes = (options?.nodes ?? [{}]).map(node => ({
    ...nodeDefaults,
    ...node
  }))
  const responseData = {
    data: {
      repository: {
        discussions: {
          nodes,
          pageInfo: { hasNextPage, endCursor }
        }
      }
    }
  }
  const name = `postIsPublished-${body.replace(/\W+/g, '-')}`
  return mockGraphQL(responseData, name, body, token)
}
