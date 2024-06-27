import { octokit, octokitForAuthor } from './octokit'
import * as core from '@actions/core'
import type { GraphQlQueryResponseData } from '@octokit/graphql'

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
      core.setFailed(`Failed to get label: ${name} (${error})`)
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
      const response: GraphQlQueryResponseData = await this.octokit.graphql(
        searchQuery,
        { q: query }
      )
      const results = response.search.nodes
      if (results.length === 0) {
        core.info(
          `👍🏻 No existing discussion found with title "${title}" and date ${date}`
        )
        return
      } else {
        core.info(
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
    const response: GraphQlQueryResponseData = await this.octokit.graphql(
      discussionCategoryQuery,
      variables
    )

    const categories: { name: string; id: string }[] =
      response.repository.discussionCategories.nodes
    const category = categories.find(cat => cat.name === name)

    if (category === undefined) {
      core.setFailed(`Failed to find category: ${name}`)
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
      core.setFailed(`Failed to get repository: ${this.name} (${error})`)
      return
    }
  }
}
