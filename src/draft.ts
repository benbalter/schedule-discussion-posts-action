import * as fs from 'fs'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as yaml from 'yaml'
import * as chrono from 'chrono-node'
import { octokit, repoOctokit, octokitForAuthor, withRetry } from './octokit'
import { Repository } from './repo'
import { isDryRun } from './inputs'

interface CreateDiscussionResponse {
  createDiscussion: { discussion: { id: string; url: string } }
}

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
  author: string | undefined
  // The author this draft actually posts as. Unset when the author has no
  // token and the draft falls back to the default one, since the discussion
  // then belongs to the token's user, not the author.
  postingAs: string | undefined
  pin = false
  octokit: typeof octokit
  valid = false

  requiredFrontMatter = ['title', 'repository', 'date', 'category', 'body']

  constructor(path: string) {
    core.info(`Reading draft: ${path}`)

    this.path = path
    this.octokit = octokit
    this.contents = this.readContents()
    const parsed = this.parseFrontMatter()

    if (parsed === undefined) {
      core.warning(
        `Could not parse the metadata block in ${this.path}. Ensure the file starts with --- on its own line, followed by the metadata fields, followed by --- on its own line.`
      )
      return
    }

    let hasRequiredFrontMatter = true
    for (const field of this.requiredFrontMatter) {
      if (parsed[field] === undefined) {
        hasRequiredFrontMatter = false
        core.warning(
          `Draft ${this.path} is missing required field: "${field}". Add it to the metadata block at the top of the file.`
        )
      }
    }

    if (!hasRequiredFrontMatter) {
      return
    }

    const parsedDate = chrono.parseDate(parsed.date as string)

    if (parsedDate === null) {
      core.warning(
        `Could not understand the date "${parsed.date}" in ${this.path}. Try ISO 8601 format (e.g., 2024-01-15T14:30:00Z) or plain English (e.g., "January 15, 2024 at 2:30 PM EST").`
      )
      return
    }
    core.info(`${this.path} has date: ${parsedDate}`)

    const repoParts = parsed.repository?.split('/')
    if (repoParts === undefined || repoParts.length !== 2) {
      core.warning(
        `Invalid repository format in ${this.path}: "${parsed.repository}". Use the format "owner/name" (e.g., "github/docs").`
      )
      return
    }

    const author =
      parsed.author === undefined || parsed.author === null
        ? ''
        : String(parsed.author).trim().replace(/^@/, '')

    if (author !== '') {
      this.author = author
      const authorOctokit = octokitForAuthor(author)

      if (authorOctokit !== undefined) {
        this.octokit = authorOctokit
        this.postingAs = author
        core.info(`Masquerading as ${author}`)
      }
    }

    this.repository = new Repository(repoParts[0], repoParts[1], this.octokit)
    this.title = parsed.title
    this.date = parsedDate
    this.category = parsed.category

    const rawLabels = parsed.labels ?? parsed.label
    if (rawLabels !== undefined && rawLabels !== null) {
      const labels = Array.isArray(rawLabels)
        ? rawLabels
        : String(rawLabels).split(',')
      this.labels = labels
        .map((label: unknown) => String(label).trim())
        .filter((label: string) => label !== '')
    }

    if (parsed.pin === true || parsed.pin === 'true') {
      this.pin = true
    }

    // Interpolate last, so every variable is populated
    this.body = this.interpolateVariables(parsed.body?.trim())

    core.info(
      `Front Matter for draft ${this.path}: \n${yaml.stringify(parsed)}`
    )
    this.valid = true
  }

  readContents(): string | undefined {
    try {
      core.debug(`Reading draft: ${this.path}`)
      return fs.readFileSync(this.path, 'utf8')
    } catch {
      core.warning(
        `Cannot find or read file "${this.path}". Check that the filename is spelled correctly and exists in the repository.`
      )
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseFrontMatter(): { [key: string]: any } | undefined {
    if (this.contents === undefined) {
      return
    }

    const frontMatter = this.contents.match(
      /^---[ \t]*\r?\n([\s\S]+?)\r?\n---[ \t]*\r?\n/
    )
    if (!frontMatter) {
      core.warning(
        `Could not find a metadata block in ${this.path}. The file must start with "---" on the first line, followed by metadata fields (title, date, repository, category), and closed with "---" on its own line.`
      )
      return
    }

    const parsed = yaml.parse(frontMatter[1])
    const body = this.contents.replace(frontMatter[0], '')

    return { ...parsed, body }
  }

  interpolateVariables(body: string | undefined): string | undefined {
    if (body === undefined) return undefined

    const variables: Record<string, string> = {
      title: this.title || '',
      date: this.date?.toISOString() || '',
      author: this.author || '',
      category: this.category || '',
      repository: this.repository
        ? `${this.repository.owner}/${this.repository.name}`
        : ''
    }

    return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match
    })
  }

  async delete(): Promise<void> {
    core.debug(`Deleting draft: ${this.path}`)

    const { owner, repo } = github.context.repo

    let sha: string

    try {
      const response = await repoOctokit.rest.repos.getContent({
        owner,
        repo,
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

    const message = `Delete ${this.path}\n\nThe post has been published as ${this.url}`

    if (isDryRun()) {
      core.info(`Dry run enabled. Skipping deleting draft: ${this.path}`)
      return
    }

    try {
      await repoOctokit.rest.repos.deleteFile({
        owner,
        repo,
        path: this.path,
        message,
        sha
      })
      core.info(`Deleted draft: ${this.path}`)
    } catch (error) {
      core.setFailed(`Failed to delete draft: ${this.path} (${error})`)
    }
  }

  async addLabels(): Promise<void> {
    if (this.repository === undefined) {
      core.setFailed('Repository is undefined. Cannot set labels.')
      return
    }

    if (this.labels.length === 0) {
      core.info('No labels to set')
      return
    }

    if (isDryRun()) {
      core.info(
        `Dry run enabled. Skipping setting labels. Would have set: ${this.labels}`
      )
      return
    }

    if (this.id === undefined) {
      core.setFailed('Discussion ID is undefined. Cannot set labels.')
      return
    }

    const labelIds = (
      await Promise.all(
        this.labels.map(async label => {
          return await this.repository?.getLabelId(label)
        })
      )
    ).filter((id): id is string => id !== undefined)

    if (labelIds.length === 0) {
      core.warning('No valid label IDs found. Skipping label assignment.')
      return
    }

    const variables = {
      discussionId: this.id,
      labelIds
    }

    try {
      core.info(`Setting labels for post ${this.title} as ${this.labels}`)
      await this.octokit.graphql(labelMutation, variables)
    } catch (error) {
      core.setFailed(`Failed to set labels for post: ${this.title} (${error})`)
    }
  }

  async publish(): Promise<string | undefined> {
    if (this.category === undefined) {
      core.setFailed(
        `No category specified for "${this.title}". Add a "category" field to the metadata block.`
      )
      return
    }

    const categoryId = await this.repository?.getCategoryId(this.category)
    if (categoryId === undefined) {
      core.setFailed(
        `Category "${this.category}" was not found in ${this.repository?.owner}/${this.repository?.name}. Go to the target repository's Discussions tab to see available categories.`
      )
      return
    }
    core.debug(`Category ID: ${categoryId}`)

    const repoId = await this.repository?.getId()
    if (repoId === undefined) {
      core.setFailed(
        `Unable to access repository ${this.repository?.owner}/${this.repository?.name}. Check that the repository exists, your Personal Access Token has access to it, and Discussions are enabled.`
      )
      return
    }
    core.debug(`Repository ID: ${repoId}`)

    if (!isDryRun()) {
      core.info(`Publishing post: ${this.title}`)
      const variables = {
        repositoryId: repoId,
        title: this.title,
        body: this.body,
        categoryId
      }

      // createDiscussion isn't idempotent: a request can succeed on GitHub's
      // side but still error (e.g., a timeout). Before retrying, check whether
      // the previous attempt actually created the discussion.
      let attempt = 0
      const discussion = await withRetry(async () => {
        if (attempt++ > 0 && this.title && this.date && this.repository) {
          const existing = await this.repository.findDiscussion(
            this.title,
            this.date,
            this.postingAs
          )
          if (existing !== undefined) {
            core.info('Previous attempt created the discussion. Not retrying.')
            return existing
          }
        }

        const result = await this.octokit.graphql<CreateDiscussionResponse>(
          createMutation,
          variables
        )
        return result.createDiscussion.discussion
      }, `Publishing discussion "${this.title}"`)

      core.notice(`Published post: ${this.title} at ${discussion.url}`)
      this.id = discussion.id
      this.url = discussion.url

      if (this.pin && this.repository) {
        await this.repository.pinDiscussion(this.id)
      }

      await this.addLabels()
      await this.delete()
    } else {
      core.info(`Dry run enabled. Skipping publishing post: ${this.title}`)
      if (this.pin) {
        core.info('Post is configured to be pinned after publishing')
      }

      // Validate target repo accessibility during dry run
      if (this.repository) {
        await this.repository.validate()
      }

      // Validate labels exist during dry run
      await this.addLabels()
    }

    return this.id
  }

  get isPast(): boolean {
    if (this.date === undefined) {
      return false
    }

    return this.date < new Date()
  }

  /**
   * Whether this draft has already been posted to the target repository. If
   * so, records the existing discussion's ID and URL. Throws if the lookup
   * fails.
   */
  async isPublished(): Promise<boolean> {
    if (
      this.repository === undefined ||
      this.title === undefined ||
      this.date === undefined
    ) {
      throw new Error(
        `Cannot check if ${this.path} is published: repository, title, or date is missing.`
      )
    }

    const discussion = await this.repository.findDiscussion(
      this.title,
      this.date,
      this.postingAs
    )
    if (discussion === undefined) {
      return false
    }

    this.id = discussion.id
    this.url = discussion.url

    return true
  }
}
