# CLAUDE.md

GitHub Action that publishes Markdown drafts with front matter as GitHub
Discussions posts once their date passes. TypeScript in [`src/`](src/), tests in
[`__tests__/`](__tests__/), bundled to [`dist/`](dist/) with ncc.

## Commands

- `npm run all` formats with Prettier (rewriting files), lints, tests, and
  packages. Run it before committing, then commit any changes it made, including
  `dist/`.
- [`linter.yml`](.github/workflows/linter.yml) runs super-linter, which also
  lints Markdown with markdownlint, Prettier, textlint, and codespell.

## Generated files

- `dist/` is the bundle the Action runs.
  [`check-dist.yml`](.github/workflows/check-dist.yml) runs `npm run bundle` and
  fails if `dist/` changed, so commit the rebuilt bundle with any change to
  `src/` or dependencies.

## Releasing

There are no release tags: the usage examples in [`README.md`](README.md) tell
users to reference `@main`, so merging to main ships to every workflow that uses
the action. Treat merges as releases and wait for the owner's go-ahead.

## Gotchas

- [`.prettierrc.json`](.prettierrc.json) sets `proseWrap: "always"`, so Prettier
  hard-wraps Markdown at 80 columns. Run `npx prettier --write` on Markdown you
  edit.
- [`lint-drafts.yml`](.github/workflows/lint-drafts.yml) runs this action in
  dry-run mode on every Markdown file a PR changes, except `README.md`. Files
  that aren't drafts, like this one, only log an "invalid draft" warning.
