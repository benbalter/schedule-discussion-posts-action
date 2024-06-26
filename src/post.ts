import * as fs from 'fs'
import * as core from '@actions/core'
import { parse } from 'yaml'
import { octokit } from './octokit'
import { Repository } from './repo'
import type { GraphQlQueryResponseData } from '@octokit/graphql'
import * as yaml from 'yaml'
import * as chrono from 'chrono-node'

const createMutation = `
  mutation($repositoryId: ID!, $body: String!, $title: String!, $categoryId: ID! ) {
    createDiscussion(input: {repositoryId: $repositoryId, body: $body, title: $title, categoryId: $categoryId}) {
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
  category: string | undefined

  requiredFrontMatter = ['title', 'repository', 'date', 'category']

  constructor(path: string) {
    console.info(`Reading post: ${path}`)

    this.path = path
    this.contents = this.readContents()
    const parsed = this.parseFrontMatter()

    if (parsed === undefined) {
      core.setFailed(`Failed to parse front matter in file: ${this.path}`)
      return
    }

    for (const field of this.requiredFrontMatter) {
      if (parsed[field] === undefined) {
        core.setFailed(`Post ${this.path} is missing required field: ${field}`)
        return
      }
    }

    const repoParts = parsed.repository.split('/')
    const parsedDate = chrono.parseDate(parsed.date)

    if (parsedDate === null) {
      core.setFailed(`Failed to parse date in file: ${this.path}`)
      return
    }
    core.debug(`Parsed date: ${parsedDate}`)

    this.repository = new Repository(repoParts[0], repoParts[1])
    this.title = parsed.title
    this.body = parsed.body
    this.date = parsedDate
    this.path = path
    this.category = parsed.category

    if (parsed.labels !== undefined) {
      this.labels = parsed.labels
        .split(',')
        .map((label: string) => label.trim())
    } else {
      this.labels = []
    }

    console.info(
      `Front Matter for post ${this.path}: \n${yaml.stringify(parsed)}`
    )
  }

  readContents(): string | undefined {
    try {
      core.debug(`Reading file: ${this.path}`)
      return fs.readFileSync(this.path, 'utf8')
    } catch (error) {
      core.setFailed(`Failed to read file: ${this.path} (${error})`)
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

  async delete(): Promise<void> {
    core.debug(`Deleting post: ${this.path}`)

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
      core.setFailed(`Failed to get SHA for file: ${this.path} (${error})`)
      return
    }

    const message = `Delete ${this.path}
    
    The post has been published as ${this.url}`

    try {
      octokit.rest.repos.deleteFile({
        owner: this.repository.owner,
        repo: this.repository.name,
        path: this.path,
        message,
        sha
      })
    } catch (error) {
      core.setFailed(`Failed to delete file: ${this.path} (${error})`)
    }
  }

  async addLabels(): Promise<void> {
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
      labelIds
    }

    try {
      core.info(`Setting labels for post ${this.title} as ${this.labels}`)
      await octokit.graphql(labelMutation, variables)
    } catch (error) {
      core.setFailed(`Failed to set labels for post: ${this.title} (${error})`)
    }
  }

  async publish(): Promise<string | undefined> {
    if (this.category === undefined) {
      core.setFailed('Category is undefined. Cannot publish post.')
      return
    }

    const categoryId = await this.repository?.getCategoryId(this.category)
    if (categoryId === undefined) {
      return
    }
    core.debug(`Category ID: ${categoryId}`)

    const repoId = await this.repository?.getId()
    if (repoId === undefined) {
      core.setFailed('Repository ID is undefined. Cannot publish post.')
      return
    }
    core.debug(`Repository ID: ${repoId}`)

    core.info(`Publishing post: ${this.title}`)
    const variables = {
      repositoryId: repoId,
      title: this.title,
      body: this.body,
      categoryId
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

  get isPast(): boolean {
    if (this.date === undefined) {
      return false
    }

    return this.date < new Date()
  }

  async isPublished(): Promise<boolean | undefined> {
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

    const discussion = await this.repository.findDiscussion(
      this.title,
      this.date
    )
    if (discussion === undefined) {
      return false
    }

    this.id = discussion.id

    return true
  }
}
