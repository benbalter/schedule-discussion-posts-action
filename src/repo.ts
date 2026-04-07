import { octokit, octokitForAuthor, withRetry } from './octokit'
import * as core from '@actions/core'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphQlResponse = Record<string, any>

const searchQuery = `
  query($q: String!) {
    search(type:DISCUSSION, query: $q, last: 100) {
      nodes {
        ... on Discussion {
          url
          id
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

  constructor(owner: string, name: string, authAs?: string) {
    this.owner = owner
    this.name = name
    this.octokit = octokit

    if (authAs !== undefined && authAs !== '') {
      const authorOctokit = octokitForAuthor(authAs)

      if (authorOctokit !== undefined) {
        this.octokit = authorOctokit
      }
    }
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

  async findDiscussion(
    title: string,
    date: Date
  ): Promise<{ id: string; url: string } | undefined> {
    const formattedDate = date.toISOString().split('T')[0]
    const query = `repo:${this.owner}/${this.name} is:discussion in:title ${title} created:>=${formattedDate}`
    core.debug(`Searching for discussion: ${query}`)
    try {
      const response: GraphQlResponse = await withRetry(
        async () => this.octokit.graphql(searchQuery, { q: query }),
        `Searching for discussion "${title}"`
      )
      const results = response.search.nodes
      if (results.length === 0) {
        core.info(
          `👍🏻 No existing discussion found with title "${title}" and date ${date}`
        )
        return
      } else {
        core.setFailed(
          `🛑 Found existing discussion with title "${title}" and date ${date}: ${results[0].url}`
        )
      }
      return results[0]
    } catch (error) {
      core.setFailed(`Failed to search for discussion: ${title} (${error})`)
      return
    }
  }

  async getCategoryId(name: string): Promise<string | undefined> {
    core.debug(`Getting category: ${name}`)

    const variables = {
      owner: this.owner,
      name: this.name
    }

    let response: GraphQlResponse
    try {
      response = await this.octokit.graphql(discussionCategoryQuery, variables)
    } catch (error) {
      core.setFailed(
        `Cannot access ${this.owner}/${this.name}. Check that: (1) the repository exists, (2) your Personal Access Token has access, (3) Discussions are enabled in the repository settings.`
      )
      return
    }

    const categories: { name: string; id: string }[] =
      response.repository.discussionCategories.nodes
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
