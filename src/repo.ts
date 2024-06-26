import { octokit, repoOctokit } from './octokit'
import * as core from '@actions/core'
import { type Post } from './post'
import type { GraphQlQueryResponseData } from '@octokit/graphql'

const searchQuery = `
  query($query: String!) {
    search(type:DISCUSSION, query: $query) {
      nodes {
        ... on Discussion {
          title
          createdAt
          id
        }
      }
    }
  }
`

export class Repository {
  owner: string
  name: string

  constructor(owner: string, name: string) {
    this.owner = owner
    this.name = name
  }

  async getLabelId(name: string): Promise<string | undefined> {
    try {
      const { data: label } = await octokit.rest.issues.getLabel({
        owner: this.owner,
        repo: this.name,
        name: name
      })
      return label.node_id
    } catch (error) {
      core.setFailed(`Failed to get label: ${name}`)
      return
    }
  }

  async findDiscussion(title: string, date: Date): Promise<string | undefined> {
    const query = `repo:${this.owner}/${this.name} is:discussion in:title ${title} created:${date.toISOString()}`
    try {
      const response: GraphQlQueryResponseData = await repoOctokit.graphql(
        searchQuery,
        { query }
      )
      const results = response.search.nodes
      if (results.length === 0) {
        return
      }
      return results[0].id
    } catch (error) {
      core.setFailed(`Failed to search for discussion: ${title}`)
      return
    }
  }
}
