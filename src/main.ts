import * as core from '@actions/core'
import * as fs from 'fs'
import { Post } from './post'

function getPosts(): Post[] {
  const files = fs.readdirSync('./')
  let posts = files.filter(file => file.endsWith('.md'))
  posts = posts.filter(file => !file.match(/README\.md/i))
  core.info(`Found ${posts.length} posts`)
  return posts.map(file => new Post(file))
}

export async function run(): Promise<void> {
  try {
    const posts = getPosts()
    for (const post of posts) {
      if (post.date === undefined) {
        core.info(`Skipping post ${post.path} with no date`)
        continue
      }

      if (!post.isPast) {
        core.info(
          `Skipping post ${post.path} with date ${post.date} as it is in the future`
        )
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
