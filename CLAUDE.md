# CLAUDE.md

A TypeScript GitHub Action that publishes Markdown drafts with front matter
(`title`, `repository`, `date`, `category`, `body`) as GitHub Discussions once
their date has passed, then deletes the draft. The [readme](README.md) covers
setup, front matter, and per-author tokens. Consumers reference
`benbalter/schedule-discussion-posts-action@v1`, so a push to `main` ships
nothing until the next release.

## Commands

- `npm ci`, then what [ci.yml](.github/workflows/ci.yml) runs:
  `npm run format:check`, `npm run lint`, `npm run ci-test` (Jest with
  `--experimental-vm-modules`, since the code is ESM). Node 24 per
  [`.node-version`](.node-version).
- `npm run package` builds `src/index.ts` into `dist/` with `ncc`.
  `npm run bundle` runs `prettier --write .` on the whole repository first, so
  don't use it in scripts or CI. `npm run all` does format, lint, test, and
  package.
- `npm run cron` runs the action locally with `tsx`, reading `INPUT_*` variables
  from a gitignored `.env`. Set `INPUT_DRY_RUN=true` unless you mean to post
  real discussions.
- [linter.yml](.github/workflows/linter.yml) runs super-linter with Prettier and
  ESLint turned off, since ci.yml owns those.

## Releases: dist/ lives only on tags

[`action.yml`](action.yml) runs `dist/index.js`, but `dist/` is gitignored and
never committed to `main`. That way Renovate bumps (shared
`benbalter/renovate-config:instant` preset, automerge on green) need no rebuild,
and nothing goes stale. CI builds `dist/` before each `uses: ./` step in
[ci.yml](.github/workflows/ci.yml) and
[lint-drafts.yml](.github/workflows/lint-drafts.yml).

To release, run [`script/release vX.Y.Z`](script/release) from a clean,
up-to-date `main`. It builds `dist/`, commits it on a detached commit on top of
`main`, tags that `vX.Y.Z`, moves the floating `v1` tag to it, and prints the
push and `gh release create` commands. The "Release tags" ruleset blocks
updating or deleting `v*` tags except for admins, so moving `v1` with
`git push --force` has to come from an admin, which is why the script runs
locally rather than in Actions. Changes on `main`, including dependency bumps,
reach users only after a release. `v1.0.0` was the last commit with `dist/` on
`main`.

## Architecture

- [`src/main.ts`](src/main.ts): finds drafts (every `*.md` under `drafts_dir`,
  skipping readmes, dotfiles, `node_modules`, `__tests__`, `dist`, `coverage`,
  or only the paths in the `files` input), processes each, and writes outputs
  and the job summary.
- [`src/draft.ts`](src/draft.ts): front matter parsing and validation,
  `chrono-node` date parsing, the GraphQL create, label, and pin mutations, and
  the already-published check (matched on title, date, and author).
- [`src/repository.ts`](src/repository.ts): target repository, category, and
  label lookups. [`src/octokit.ts`](src/octokit.ts): clients for
  `discussion_token`, `repo_token`, and per-author `discussion_token_<login>`
  inputs (hyphens become underscores), plus `withRetry`.
- Tests in [`__tests__/`](__tests__/) use `fetch-mock` through
  [`setup.ts`](__tests__/setup.ts) and [`sandbox.ts`](__tests__/sandbox.ts),
  with drafts in [`__tests__/fixtures/`](__tests__/fixtures/), so they need no
  tokens or network.

## Gotchas

- The `@actions/*` packages are ESM-only, so tests mock them with
  `jest.unstable_mockModule` in `setup.ts` rather than `jest.spyOn`.
- The CI self-test runs the action against this repository in dry-run mode, so
  any Markdown file here that isn't a readme (this one included) is read as a
  draft. Missing front matter only logs a warning.
- Prettier uses `proseWrap: always`, so Markdown, this file included, is
  hard-wrapped at 80 columns. Run `npx prettier --write` on Markdown you edit.
- Super-linter also runs textlint's `terminology` rule on Markdown prose, so
  write "repository", "readme", and "lockfile" rather than the short or two-word
  forms. Words inside code spans are exempt.
