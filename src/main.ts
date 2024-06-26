import * as core from '@actions/core'
import * as fs from 'fs'
import { Post } from './post'

function getPosts() {
  const files = fs.readdirSync('./')
  const posts = files.filter(file => file.endsWith('.md'))
  core.info(`Found ${posts.length} posts`)
  return posts.map(file => new Post(file))
}

export async function run(): Promise<void> {
  try {
    const posts = getPosts()
    for (const post of posts) {
      if (post.isFuture) {
        core.info(`Skipping future post: ${post.title} with date ${post.date}`)
        continue
      }

      if (await post.isPublished()) {
        core.info(`Post ${post.title} is already published`)
        continue
      }

      await post.publish()
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
