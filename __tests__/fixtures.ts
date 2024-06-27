import { sandbox } from '../src/octokit'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mockGraphQL(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>,
  name: string,
  body?: string
) {
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
      functionMatcher: matcher
    },
    response,
    { sendAsJson: true }
  )
}

export function mockLabel(options?: { label?: string; id?: string }) {
  const defaults = { label: 'question', id: 'label123' }
  const { label, id } = { ...defaults, ...options }

  return sandbox.mock(
    `https://api.github.com/repos/owner/repo/labels/${label}`,
    {
      node_id: id
    }
  )
}

export function mockRepo(options?: {
  owner?: string
  name?: string
  id?: string
}) {
  const defaults = { owner: 'owner', name: 'repo', id: 'id123' }
  const { owner, name, id } = { ...defaults, ...options }

  return sandbox.mock(`https://api.github.com/repos/${owner}/${name}`, {
    node_id: id
  })
}

export function mockCreateDiscussion(options?: { id?: string; url?: string }) {
  const defaults = {
    id: 'id123',
    url: 'https://github.com/owner/repo/discussions/1'
  }
  const { id, url } = { ...defaults, ...options }

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

  return mockGraphQL(postData, 'publish', 'createDiscussion')
}

export function mockCategory(options?: {
  categories?: { id: string; name: string }[]
}) {
  const defaults = {
    categories: [
      { id: '123', name: 'General' },
      { id: '456', name: 'Other' }
    ]
  }
  const { categories } = { ...defaults, ...options }
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
    'discussionCategories'
  )
}

export function mockLabelCreation(options?: { number?: number }) {
  const defaults = { number: 1 }
  const { number } = { ...defaults, ...options }
  const data = {
    data: {
      addLabelsToLabelable: {
        discussion: {
          number
        }
      }
    }
  }
  return mockGraphQL(data, 'addLabels', 'label123')
}

export function mockFileDeletion(options?: { url?: string; sha?: string }) {
  const defaults = {
    url: 'https://api.github.com/repos/owner/repo/contents/.%2F__tests__%2Ffixtures%2Fdraft.md',
    sha: 'sha123'
  }
  const { url, sha } = { ...defaults, ...options }

  const getMock = sandbox.mock(
    {
      url,
      method: 'GET'
    },
    { sha }
  )
  const deleteMock = sandbox.mock(
    {
      url,
      //TODO: Validate SHA and message
      method: 'DELETE'
    },
    200
  )

  return { getMock, deleteMock }
}

export function mockPost(options?: { nodes: { id?: string; url?: string }[] }) {
  const defaults = {
    nodes: [
      { id: 'post123', url: 'https://github.com/owner./repo/discussions/1' }
    ]
  }
  const { nodes } = { ...defaults, ...options }
  const responseData = {
    data: {
      search: {
        nodes
      }
    }
  }
  return mockGraphQL(responseData, 'postIsPublished', 'search')
}
