# Schedule Discussion Post Action

This action will create a discussion post in a repository at a scheduled time.

## Why would I use this?

1. You want to schedule a Discusion post to go live at a specific time in the
   future (examples: announcements, weekly updates, when you're out of office,
   etc.)
1. You want to post a Discussion post on behalf of someone else (example:
   posting on behalf of an executive)
1. You want to coordinate a "comms cascade" creation of a post across multiple
   repositories (example: a cross-organizational announcement made my multiple
   authors in multiple repos, with messages tailored to each audience)

## Usage

Setting up the action requires three steps (described in detail below):

1. Set up this action
1. Add a Personal Access Token to the repository secrets
1. Create one or more draft discussion posts

## Concepts

The Action is intended to be used with two or more repositories:

- The first repository is the "**source**" repository. This repository contains
  the GitHub Action configuration as well as one or more "draft" discussion
  posts. You'll likely want to lock this repoisotry down to those that are part
  of the drafting process.
- The second repository (or third, or forth) is the "**target**" repository.
  This repository is where the discussion posts will be created. The repository
  can be set per draft, and will likely have a wider audience (e.g., those that
  you want to be able to read the published discussion posts)

Draft discussion posts live as `.md` files in the root of the source repository.
When the action runs (on a regular basis), it will look for any draft posts that
are scheduled to be published (publication date in the past) and will create a
coresponding discussion post in the target repository. You can schedule as many
draft discussion posts as you'd like. Once published, the draft post will be
deleted. to keep things tidy in the source repository.

## Step 1: Set up this action

Create a `.github/workflows/schedule-discussion-post.yml` file in your
repository with the following content:

```yaml
name: Schedule Discussion Posts

on:
  # Check for drafts to post every hour at the top of the hour
  schedule:
    - cron: '0 0 * * *'

  # Optional, allows you to post on demand
  push:
    branches:
      - 'main'
    paths:
      - '**.md'

permissions:
  contents: write

jobs:
  schedule-discussion-posts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: benbalter/schedule-discussion-post-action@main
        with:
          discussion_token: ${{ secrets.DISCUSSION_TOKEN }}
```

This will run approximately on the top of the hour, every hour to check for
posts to pubish. You can use tools like `crontab.guru` to adjust the schedule to
your liking.

Pro-tip: If this is a new repository, be sure to enable Discussions via the
settings.

## Step 2: Add a Personal Access Token to the repository secrets

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

## Step 3: Create a draft discussion post

Discussion posts start as `.md` files in the root of the repository where you
set up the Action (the source repository). You can schedule as many posts as
you'd like. Posts are standard Markdown files, with a few extra "front matter"
fields at the top. Here's an example:

```markdown
---
title: An important post
date: 2021-10-01T12:00:00Z
repository: github/schedule-discussion-post-action
category: General
labels: announcement, engineering
---

Body of the post here in standard Markdown.
```

Note: You do not (and should not) include the title in the body of the draft as
an H1. Instead, add it to the front matter so that it can be set appropriately.

The following front matter fields are supported:

- `title` (required): The title of the discussion post
- `date` (required): The date and time to post the discussion post. The Action
  will do its best to parse most common formats. When in doubt, ISO 8601 is your
  friend.
- `repository` (required): The target repository where the discussion post will
  be created. Must be in the format `owner/repository`.
- `category` (required): The category of the discussion post.
- `labels` (optional): A comma-separated list of labels to apply to the
  discussion post.
- `author` (optional): The GitHub handle of the author of the post. Defaults to
  the owner of the `DISCUSSION_TOKEN`.

Note: Setting labels is not yet implemented due to restrictions with the GitHub
API.

## But what if I did something wrong? (Optional)

For additional peace of mind, you can set up a "linter" to check your drafts.
Create a `.github/workflows/lint-drafts.yml` file in your source repository with
the following content:

```yaml
name: Lint drafts

on:
  pull_request:
    branches:
      - main

permissions:
  contents: read

jobs:
  changed_files:
    runs-on: ubuntu-latest

    name: Test changed-files
    steps:
      - uses: actions/checkout@v4

      - name: Get all changed markdown files
        id: changed-markdown-files
        uses: tj-actions/changed-files@v44
        with:
          json: true
          escape_json: false
          files: |
            **.md

      - name: Lint markdown files
        uses: benbalter/schedule-discussion-posts-action@main
        if: steps.changed-markdown-files.outputs.any_changed == 'true'
        with:
          dry_run: true
          files: ${{ steps.changed-markdown-files.outputs.all_changed_files }}
          discussion_token: ${{ secrets.DISCUSSION_TOKEN }}
```

This will run through the entire process of parsing and validating any changed
draft in a pull request, but stop shot of actually creating the discussion post.
If there are any issues, the Action will fail and provide feedback on what needs
to be fixed. This should catch most issues giving you confidence that the post
will be created as expected.

Note: This Workflow file assumes you're using a pull request workflow. If you're
not, adjust the `on` trigger accordingly (example: on push to `main`).

Example Lint output:

![Lint output](https://github.com/user-attachments/assets/379064bd-d445-4d0f-aa94-07f75e86ec30)

## Advanced Usage

The Action accepts the following `with:` parameters:

- `discussion_token` (required): The Personal Access Token to use to create the
  discussion post. Must have read/write access to the target repository.
- `repo_token` (optional): The Personal Access Token to use to read the draft
  discussion posts. Must have read access to the source repository. Defaults to
  the `github.token` provided by the GitHub Actions runtime.
- `dry_run` (optional): If set to `true`, the Action will parse the draft
  discussion posts, but will not create the discussion posts. Defaults to
  `false`.
- `files` (optional): A JSON-formatted array of files to parse. Defaults to all
  `.md` files in the repository root.

### Multiple authors

By default, the action will use the `DISCUSSION_TOKEN` secret to create the
discussion post (which will be authored by the user who created the token). If
you want to specify a different author, you can add an `author` field to the
front matter of the draft post with their handle. For example:

```markdown
---
title: Another important post, authored by someone else
date: 2021-10-01T12:00:00Z
repositotry: github/schedule-discussion-post-action
category: General
author: hubot
---
```

You will then need to follow the instructions above to create a Personal Access
Token for that user and add it to the repository secrets as
`DISCUSSION_TOKEN_$HANDLE` (in this case, `DISCUSSION_TOKEN_HUBOT`).

Finally, you will need to update the Action configuration to pass the additional
token. For example:

```yaml
jobs:
  schedule-discussion-posts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: benbalter/schedule-discussion-posts-action@main
        with:
          # The default token used when no author is specified
          discussion_token: ${{ secrets.DISCUSSION_TOKEN }}

          # The token to use when the author is hubot
          discussion_token_hubot: ${{ secrets.DISCUSSION_TOKEN_HUBOT }}
```

You may add as many authors to a repository as you'd like, each with their own
token. The Action will use the appropriate token based on the author specified
in the draft post. If the author specified does not have a corresponding token,
the Action will try to use the default token, but will warn you that the author
is not set up correctly when you do a dry run.

Note: If the author's handle has `-` in it, replace the `-` with `_` when naming
the secret as GitHub Actions does not allow `-`s in secret names.

## Troubleshooting

If you encounter any issues, please check the following:

1. Re-run the action with debug logging enabled
1. Ensure branch protection rules / rulesets are not preventing the action from
   deleting the post once published
