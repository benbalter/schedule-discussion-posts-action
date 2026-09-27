import { octokit, withRetry } from './octokit'
import * as core from '@actions/core'

export interface Discussion {
  id: string
  url: string
  title: string
  createdAt: string
}

interface DiscussionsResponse {
  repository: {
    discussions: {
      nodes: Discussion[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    }
  }
}

interface CategoriesResponse {
  repository: {
    discussionCategories: { nodes: { id: string; name: string }[] }
  }
}

// Max pages of recent discussions to scan when checking for duplicates
const MAX_DISCUSSION_PAGES = 10

// Lists discussions directly rather than using search, which is fuzzy and
// lags behind newly created discussions
const discussionsQuery = `
  query($owner: String!, $name: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      discussions(first: 50, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes {
          id
          url
          title
          createdAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`

const discussionCategoryQuery = `
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      discussionCategories(first: 100) {
        nodes {
          id
          name
        }
      }
    }
  }
`

const pinDiscussionMutation = `
  mutation($discussionId: ID!) {
    pinDiscussion(input: {discussionId: $discussionId}) {
      discussion {
        id
      }
    }
  }
`

export class Repository {
  owner: string
  name: string
  octokit: typeof octokit

  constructor(owner: string, name: string, client: typeof octokit = octokit) {
    this.owner = owner
    this.name = name
    this.octokit = client
  }

  async getLabelId(name: string): Promise<string | undefined> {
    try {
      core.debug(`Getting label: ${name}`)
      const { data: label } = await this.octokit.rest.issues.getLabel({
        owner: this.owner,
        repo: this.name,
        name
      })
      return label.node_id
    } catch (error) {
      core.setFailed(
        `Label "${name}" was not found in ${this.owner}/${this.name}. Create it in the repository's Labels settings, or remove it from the draft metadata.`
      )
      return
    }
  }

  /**
   * Finds a discussion with exactly the given title created on or after the
   * (UTC) day of the given date. Throws if the lookup fails, so callers never
   * mistake an API error for "not published".
   */
  async findDiscussion(
    title: string,
    date: Date
  ): Promise<Discussion | undefined> {
    const cutoff = new Date(date.toISOString().split('T')[0])
    let after: string | null = null

    core.debug(
      `Looking for discussion "${title}" in ${this.owner}/${this.name} created since ${cutoff.toISOString()}`
    )

    for (let page = 0; page < MAX_DISCUSSION_PAGES; page++) {
      const variables = { owner: this.owner, name: this.name, after }
      const response: DiscussionsResponse = await withRetry(
        async () => this.octokit.graphql(discussionsQuery, variables),
        `Searching for discussion "${title}"`
      )
      const { nodes, pageInfo } = response.repository.discussions

      for (const discussion of nodes) {
        // Results are newest first, so everything after this is older
        if (new Date(discussion.createdAt) < cutoff) {
          return this.notFound(title, date)
        }

        if (discussion.title === title) {
          core.info(
            `Found existing discussion with title "${title}" and date ${date}: ${discussion.url}`
          )
          return discussion
        }
      }

      if (!pageInfo.hasNextPage) {
        return this.notFound(title, date)
      }
      after = pageInfo.endCursor
    }

    core.warning(
      `Stopped looking for "${title}" after ${MAX_DISCUSSION_PAGES} pages of discussions in ${this.owner}/${this.name}`
    )
    return this.notFound(title, date)
  }

  private notFound(title: string, date: Date): undefined {
    core.info(
      `👍🏻 No existing discussion found with title "${title}" and date ${date}`
    )
    return
  }

  async getCategoryId(name: string): Promise<string | undefined> {
    core.debug(`Getting category: ${name}`)

    const variables = {
      owner: this.owner,
      name: this.name
    }

    let response: CategoriesResponse
    try {
      response = await this.octokit.graphql(discussionCategoryQuery, variables)
    } catch (error) {
      core.setFailed(
        `Cannot access ${this.owner}/${this.name}. Check that: (1) the repository exists, (2) your Personal Access Token has access, (3) Discussions are enabled in the repository settings.`
      )
      return
    }

    const categories = response.repository.discussionCategories.nodes
    const category = categories.find(cat => cat.name === name)
    const availableNames = categories.map(cat => cat.name).join(', ')

    if (category === undefined) {
      core.setFailed(
        `Category "${name}" does not exist in ${this.owner}/${this.name}. Available categories: ${availableNames}`
      )
      return
    }

    return category.id
  }

  async getId(): Promise<string | undefined> {
    try {
      core.debug(`Getting repository: ${this.name}`)
      const { data: repo } = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.name
      })
      return repo.node_id
    } catch (error) {
      core.setFailed(
        `Unable to access repository ${this.owner}/${this.name}. Check that the repository exists and your Personal Access Token has access to it.`
      )
      return
    }
  }

  async pinDiscussion(discussionId: string): Promise<void> {
    try {
      core.info(`Pinning discussion: ${discussionId}`)
      await this.octokit.graphql(pinDiscussionMutation, { discussionId })
      core.info('Discussion pinned successfully')
    } catch (error) {
      core.warning(
        `Could not pin the discussion. This may require additional permissions on your Personal Access Token. The post was still published successfully.`
      )
    }
  }

  async validate(): Promise<boolean> {
    let valid = true

    try {
      await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.name
      })
      core.info(
        `✅ Repository ${this.owner}/${this.name} exists and is accessible`
      )
    } catch (error) {
      core.setFailed(
        `❌ Cannot access repository ${this.owner}/${this.name}. Check that: (1) the repository exists, (2) your Personal Access Token has access, (3) Discussions are enabled.`
      )
      valid = false
    }

    return valid
  }
}
