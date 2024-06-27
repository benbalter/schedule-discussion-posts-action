import * as fs from 'fs'
import * as core from '@actions/core'
import { parse } from 'yaml'
import { octokit, repoOctokit } from './octokit'
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
    addLabelsToLabelable(input: {labelableId: $discussionId, labelIds: $labelIds}) {
      labelable {
        ... on Discussion {
          number
        }
      }
    }
  }
`

export class Draft {
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

  requiredFrontMatter = ['title', 'repository', 'date', 'category', 'body']

  constructor(path: string) {
    console.info(`Reading draft: ${path}`)

    this.path = path
    this.contents = this.readContents()
    const parsed = this.parseFrontMatter()

    if (parsed === undefined) {
      core.setFailed(`Failed to parse front matter in file: ${this.path}`)
      return
    }

    let hasRequiredFrontMatter = true
    for (const field of this.requiredFrontMatter) {
      if (parsed[field] === undefined) {
        hasRequiredFrontMatter = false
        core.setFailed(`Draft ${this.path} is missing required field: ${field}`)
      }
    }

    if (!hasRequiredFrontMatter) {
      return
    }

    const repoParts = parsed.repository.split('/')
    const parsedDate = chrono.parseDate(parsed.date)

    if (parsedDate === null) {
      core.setFailed(`Failed to parse date in draft: ${this.path}`)
      return
    }
    core.info(`${this.path} has date: ${parsedDate}`)

    this.repository = new Repository(repoParts[0], repoParts[1])
    this.title = parsed.title
    this.body = parsed.body.trim()
    this.date = parsedDate
    this.path = path
    this.category = parsed.category

    if (parsed.labels !== undefined) {
      this.labels = (parsed.label || parsed.labels)
        .split(',')
        .map((label: string) => label.trim())
    } else {
      this.labels = []
    }

    console.info(
      `Front Matter for draft ${this.path}: \n${yaml.stringify(parsed)}`
    )
  }

  readContents(): string | undefined {
    try {
      core.debug(`Reading draft: ${this.path}`)
      return fs.readFileSync(this.path, 'utf8')
    } catch (error) {
      core.setFailed(`Failed to read draft: ${this.path} (${error})`)
    }
  }

  parseFrontMatter(): { [key: string]: string } | undefined {
    if (this.contents === undefined) {
      return
    }

    const frontMatter = this.contents.match(/^---\n([\s\S]+?)\n---\n/)
    if (!frontMatter) {
      core.setFailed(`Failed to parse front matter in draft: ${this.path}`)
      return
    }

    const parsed = parse(frontMatter[1])
    const body = this.contents.replace(frontMatter[0], '')

    return { ...parsed, body }
  }

  async delete(): Promise<void> {
    core.debug(`Deleting draft: ${this.path}`)

    if (this.repository === undefined) {
      core.setFailed('Repository is undefined. Cannot delete draft.')
      return
    }

    let sha: string

    try {
      const response = await repoOctokit.rest.repos.getContent({
        owner: this.repository.owner,
        repo: this.repository.name,
        path: this.path
      })

      sha = Array.isArray(response.data)
        ? response.data[0].sha
        : response.data.sha

      core.debug(`SHA for draft: ${this.path} is ${sha}`)
    } catch (error) {
      core.setFailed(`Failed to get SHA for draft: ${this.path} (${error})`)
      return
    }

    const message = `Delete ${this.path}
    
    The post has been published as ${this.url}`

    if (core.getInput('dry_run') === 'true') {
      core.info(`Dry run enabled. Skipping deleting draft: ${this.path}`)
      return
    }

    try {
      await repoOctokit.rest.repos.deleteFile({
        owner: this.repository.owner,
        repo: this.repository.name,
        path: this.path,
        message,
        sha
      })
      core.debug(`Deleted draft: ${this.path}`)
    } catch (error) {
      core.setFailed(`Failed to delete draft: ${this.path} (${error})`)
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

    if (this.labels.length === 0) {
      core.info('No labels to set')
      return
    }

    const labelIds = await Promise.all(
      this.labels.map(async label => {
        return await this.repository?.getLabelId(label)
      })
    )

    if (core.getInput('dry_run') === 'true') {
      core.info(
        'Dry run enabled. Skipping setting labels. Would have set: ${this.labels}'
      )
      return
    }

    // eslint-disable-next-line no-unreachable
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

    if (core.getInput('dry_run') !== 'true') {
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
    } else {
      core.info(`Dry run enabled. Skipping publishing post: ${this.title}`)
    }

    await this.addLabels()
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
