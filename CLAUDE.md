# CLAUDE.md

A TypeScript GitHub Action that publishes Markdown drafts with front matter
(`title`, `repository`, `date`, `category`, `body`) as GitHub Discussions once
their date has passed, then deletes the draft. The [README](README.md) covers
setup, front matter, and per-author tokens. There are no releases or tags:
consumers reference `benbalter/schedule-discussion-posts-action@main`, so every
push to `main` ships immediately.

## Commands

- `npm ci`, then what [ci.yml](.github/workflows/ci.yml) runs:
  `npm run format:check`, `npm run lint`, `npm run ci-test` (Jest with
  `--experimental-vm-modules`, since the code is ESM). Node 24 per
  [`.node-version`](.node-version).
- `npm run bundle` runs `prettier --write .` on the whole repo, then `ncc`
  builds `src/index.ts` into [`dist/`](dist/). `npm run all` does format, lint,
  test, and package.
- `npm run cron` runs the action locally with `tsx`, reading `INPUT_*` variables
  from a gitignored `.env`. Set `INPUT_DRY_RUN=true` unless you mean to post
  real discussions.
- [linter.yml](.github/workflows/linter.yml) runs super-linter with Prettier and
  ESLint turned off, since ci.yml owns those.

## dist/ is committed, and it ships

[`action.yml`](action.yml) runs `dist/index.js`, and
[check-dist.yml](.github/workflows/check-dist.yml) ("Check Transpiled
JavaScript") rebuilds it and fails on any diff. After any change to `src/` or to
a runtime dependency, including a Renovate bump or lock file maintenance, run
`npm run bundle` and commit `dist/` in the same push, or that check goes red and
`@main` users run stale code.

Renovate (shared `benbalter/renovate-config:instant` preset, automerge on green)
can't do this for you: `postUpgradeTasks` is disabled on the hosted Renovate
app, and pushes made with `GITHUB_TOKEN` don't trigger CI, so a bot rebuild
wouldn't be checked anyway. Rebuild by hand after merging those PRs, as in
`Rebuild dist/ for the chrono-node bump`.

## Architecture

- [`src/main.ts`](src/main.ts): finds drafts (every `*.md` under `drafts_dir`,
  skipping READMEs, dotfiles, `node_modules`, `__tests__`, `dist`, `coverage`,
  or only the paths in the `files` input), processes each, and writes outputs
  and the job summary.
- [`src/draft.ts`](src/draft.ts): front matter parsing and validation,
  `chrono-node` date parsing, the GraphQL create, label, and pin mutations, and
  the already-published check (matched on title, date, and author).
- [`src/repo.ts`](src/repo.ts): target repo, category, and label lookups.
  [`src/octokit.ts`](src/octokit.ts): clients for `discussion_token`,
  `repo_token`, and per-author `discussion_token_<login>` inputs (hyphens become
  underscores), plus `withRetry`.
- Tests in [`__tests__/`](__tests__/) use `fetch-mock` through
  [`setup.ts`](__tests__/setup.ts) and [`sandbox.ts`](__tests__/sandbox.ts),
  with drafts in [`__tests__/fixtures/`](__tests__/fixtures/), so they need no
  tokens or network.

## Gotchas

- The `@actions/*` packages are ESM-only, so tests mock them with
  `jest.unstable_mockModule` in `setup.ts` rather than `jest.spyOn`.
- The CI self-test runs the action against this repo in dry-run mode, so any
  Markdown file here that isn't a README (this one included) is read as a draft.
  Missing front matter only logs a warning.
- Prettier uses `proseWrap: always`, so Markdown, this file included, is
  hard-wrapped at 80 columns. Run `npx prettier --write` on Markdown you edit.
