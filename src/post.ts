import * as fs from 'fs'
import * as core from '@actions/core'
import { parse } from 'yaml'
import { octokit } from './octokit'
import { Repository } from './repo'
import type { GraphQlQueryResponseData } from '@octokit/graphql'

const createMutation = `
  mutation($repositoryId: ID!, $body: String!, $title: String! ) {
    createDiscussion(input: {repositoryId: $repositoryId, body: $body, title: $title}) {
      discussion {
        id
        url
      }
    }
  }
`

const labelMutation = `
  mutation($discussionId: ID!, $labelIds: [ID!]!) {
    setLabelsForLabelable(input: {labelableId: $discussionId, labelIds: $labelIds}) {
      labelable {
        ... on Discussion {
          number
        }
      }
    }
  }
`

export class Post {
  contents: string | undefined
  repository: Repository | undefined
  title: string | undefined
  body: string | undefined
  date: Date | undefined
  path: string
  id: string | undefined
  labels: string[] = []
  url: string | undefined
  // TODO Category

  constructor(path: string) {
    this.path = path
    this.contents = this.readContents()
    const parsed = this.parseFrontMatter()

    if (parsed === undefined) {
      return
    }

    const repoParts = parsed.repository.split('/')
    this.repository = new Repository(repoParts[0], repoParts[1])
    this.title = parsed.title
    this.body = parsed.body
    this.date = new Date(parsed.date)
    this.path = path
    this.labels = parsed.labels.split(',').map((label: string) => label.trim())
  }

  readContents() {
    try {
      return fs.readFileSync(this.path, 'utf8')
    } catch (error) {
      core.setFailed(`Failed to read file: ${this.path}`)
    }
  }

  parseFrontMatter(): { [key: string]: string } | undefined {
    if (this.contents === undefined) {
      return
    }

    const frontMatter = this.contents.match(/^---\n([\s\S]+?)\n---\n/)
    if (!frontMatter) {
      core.setFailed(`Failed to parse front matter in file: ${this.path}`)
      return
    }

    const parsed = parse(frontMatter[1])
    const body = this.contents.replace(frontMatter[0], '')

    return { ...parsed, body }
  }

  async delete() {
    if (this.repository === undefined) {
      core.setFailed('Repository is undefined. Cannot delete post.')
      return
    }

    let sha: string

    try {
      const response = await octokit.rest.repos.getContent({
        owner: this.repository.owner,
        repo: this.repository.name,
        path: this.path
      })

      sha = Array.isArray(response.data)
        ? response.data[0].sha
        : response.data.sha
    } catch (error) {
      core.setFailed(`Failed to get SHA for file: ${this.path}`)
      return
    }

    const message = `Delete ${this.path}
    
    The post has been published as ${this.url}`

    return octokit.rest.repos.deleteFile({
      owner: this.repository.owner,
      repo: this.repository.name,
      path: this.path,
      message,
      sha
    })
  }

  async addLabels() {
    if (this.repository === undefined) {
      core.setFailed('Repository is undefined. Cannot set labels.')
      return
    }

    if (this.id === undefined) {
      core.setFailed('Discussion ID is undefined. Cannot set labels.')
      return
    }

    const labelIds = await Promise.all(
      this.labels.map(async label => {
        return await this.repository?.getLabelId(label)
      })
    )

    const variables = {
      discussionId: this.id,
      labelIds: labelIds
    }

    try {
      core.info(`Setting labels for post ${this.title} as ${this.labels}`)
      await octokit.graphql(labelMutation, variables)
    } catch (error) {
      core.setFailed(`Failed to set labels for post: ${this.title}`)
    }
  }

  async publish() {
    core.info(`Publishing post: ${this.title}`)
    const variables = {
      repositoryId: this.repository,
      title: this.title,
      body: this.body
    }
    const result: GraphQlQueryResponseData = await octokit.graphql(
      createMutation,
      variables
    )
    core.info(
      `Published post: ${this.title} at ${result.createDiscussion.discussion.url}`
    )
    this.id = result.createDiscussion.discussion.id
    this.url = result.createDiscussion.discussion.url

    if (this.labels.length > 0) {
      await this.addLabels()
    }

    await this.delete()

    return this.id
  }

  get isFuture() {
    if (this.date === undefined) {
      return false
    }

    return this.date > new Date()
  }

  async isPublished() {
    if (this.repository === undefined) {
      core.setFailed(
        'Repository is undefined. Cannot check if post is published.'
      )
      return
    }

    if (this.title === undefined) {
      core.setFailed('Title is undefined. Cannot check if post is published.')
      return
    }

    if (this.date === undefined) {
      core.setFailed('Date is undefined. Cannot check if post is published.')
      return
    }

    const discussionId = await this.repository.findDiscussion(
      this.title,
      this.date
    )
    if (discussionId === undefined) {
      return false
    }

    return true
  }
}
