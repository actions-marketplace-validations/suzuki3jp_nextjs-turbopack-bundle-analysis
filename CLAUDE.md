# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (compiles src/ → dist/ via @vercel/ncc)
pnpm run build

# Type check only
pnpm run typecheck

# Create a changeset
pnpm run changeset

# Bump versions via changesets
pnpm run version

# Build + tag + push release
pnpm run release
```

## Release flow

Releases are managed with **changesets**:

1. Add a `.changeset/*.md` file (manually or via `pnpm run changeset`)
2. Push to `main` — the `release.yml` workflow runs `changesets/action`
3. Changesets action either opens a "Version Packages" PR or, if one is already merged, runs `pnpm run release`
4. `scripts/release.mjs` builds `dist/`, commits it, runs `pnpm changeset tag`, creates/force-updates the floating major tag (e.g. `v0`), and pushes

**Important:** `dist/` is committed to git as part of the release process (the action runs directly from it). Always run `pnpm run build` before releasing.

## Architecture

This is a GitHub Action written in TypeScript, bundled into a single file via `@vercel/ncc`.

```
src/
  main.ts      — entrypoint; parses inputs, orchestrates git worktrees, calls analyze/compare/comment
  analyze.ts   — reads Turbopack's binary .next/analyze/data/ format and returns BundleAnalysis
  compare.ts   — diffs base vs PR BundleAnalysis into RouteComparison[]
  comment.ts   — formats the Markdown table and upserts a PR comment (identified by COMMENT_MARKER)
  types.ts     — shared TypeScript interfaces
  utils.ts     — formatBytes, getStatusEmoji helpers
```

### Data flow

1. `main.ts` checks out both base SHA and PR SHA into separate git worktrees (`__bundle_base`, `__bundle_pr`)
2. Runs `nci` (via `@antfu/ni`) + the configured `build-command` in each worktree
3. `analyze.ts` parses `.next/analyze/data/` — binary format with a JSON header followed by packed edge data (adapted from `vercel/next.js` bundle-analyzer)
4. `compare.ts` diffs the two analyses, applying `minimumChangeThreshold` to suppress noise
5. `comment.ts` posts/updates a single PR comment identified by `<!-- nextjs-turbopack-bundle-analysis -->`

### Binary format note

`analyze.ts` parses a custom binary format output by Next.js Turbopack's `experimental-analyze` command. The file starts with a 4-byte big-endian uint32 (JSON header length), followed by a JSON header, followed by packed uint32 edge arrays. Only `[client-fs]/*.js` output files are summed to get client-side JS sizes.
