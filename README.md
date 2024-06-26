# Schedule Discussion Post Action

This action will create a discussion post in a repository at a scheduled time.

## Usage

1. Set up this action (see below)
1. Add a Personal Access Token to the repository secrets (optional, see below)
1. Create one or more discussion posts (see below)

## Set up this action

Create a `.github/workflows/schedule-discussion-post.yml` file in your
repository with the following content:

```yaml
name: Schedule Discussion Post

on:
  schedule:
    - cron: '0 0 * * *'

permissions:
  contents: write

jobs:
  schedule-discussion-post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: benbalter/schedule-discussion-post-action@main
        with:
          discussion_token: ${{ secrets.DISCUSSION_TOKEN }}
```

## Add a Personal Access Token to the repository secrets

For the Action to work, the intended author will need to create a Personal
Access Token:

1. Navigate to
   [`github.com/settings/tokens`](https://github.com/settings/tokens?type=beta).
1. Click "Generate new token".
1. Give the token a descriptive name.
1. Set a long expiration date (e.g., 1 year)
1. Choose "only select repositories" and choose one or more repositories that
   you want to post to.
1. Under repository permissions choose "Discussions" and grant "read and write"
   access
1. Click "Generate token" and copy the token
1. Save the token as a secret (`DISCUSSION_TOKEN`) in the repository where you
   set up the Action.

Note: You can optionally create a legacy PAT which would not have an expiration
date, but that would grant discussion read/write access to all repositories that
the author has access to.

Pro-tip: Set a calendar reminder to roll the token prior to the expiration date.

## Create a discussion post

Discussion posts start as `.md` files in the root of the repository where you
set up the Action. You can schedule as many posts as you'd like. Posts are
standard Markdown files, with a few extra "front matter" fields at the top.
Here's an example:

```markdown
---
title: An important post
date: 2021-10-01T12:00:00Z
repositotry: github/schedule-discussion-post-action
category: General
labels: announcement, engineering
---

Body of the post here
```

The following front matter fields are supported:

- `title` (required): The title of the discussion post
- `date` (required): The date and time to post the discussion post. The Action
  will do its best to parse most common formats. When in doubt, ISO 8601 is your
  friend.
- `repository` (required): The repository where the discussion post will be
  created. Must be in the format `owner/repo`.
- `category`: The category of the discussion post.
- `labels`: A comma-separated list of labels to apply to the discussion post.
  (optional)
