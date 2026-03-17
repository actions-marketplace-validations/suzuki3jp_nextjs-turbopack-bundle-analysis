# Next.js Turbopack Bundle Analysis

A GitHub Action that analyzes Next.js Turbopack bundle size changes in pull requests and posts a comment with the results.

> **Note:** Inspired by [hashicorp/nextjs-bundle-analysis](https://github.com/hashicorp/nextjs-bundle-analysis) and designed to be compatible with it. If you are on webpack, use that project. If you are on Turbopack, this action is the alternative — it uses `next experimental-analyze` to report bundle size changes in pull requests.
>
> **Warning:** `next experimental-analyze` is an experimental Next.js feature. Its output format may change in future Next.js releases and could break this action.
>
> **Requires Next.js 16.1.0 or later.**

## Usage

```yaml
# .github/workflows/bundle-analysis.yml
name: Bundle Analysis
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  analyze:
    runs-on: ubuntu-latest
    if: github.event.pull_request.draft == false
    permissions:
      pull-requests: write   # Required to post PR comments
      contents: read         # Required to checkout code
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # Required to fetch base SHA
      - uses: suzuki3jp/nextjs-turbopack-bundle-analysis@v1
```

### Monorepo

```yaml
- uses: suzuki3jp/nextjs-turbopack-bundle-analysis@v1
  with:
    working-directory: apps/web
```

## Example Comment

The action posts a comment like this on pull requests:

| Route    | Base (gzip) | PR (gzip)   | +/-       | %       |
| -------- | ----------- | ----------- | --------- | ------- |
| 🟢 /      | 100.00 kB   | 95.00 kB    | -5.00 kB  | -5.00%  |
| 🟡 /about | 50.00 kB    | 52.00 kB    | +2.00 kB  | +4.00%  |
| 🔴 /heavy | 200.00 kB   | 250.00 kB ⚠️ | +50.00 kB | +25.00% |
| ✨ /new   | —           | 80.00 kB    | +80.00 kB | new     |
| 🗑️ /old   | 60.00 kB    | —           | —         | removed |

**Status indicators:**
- 🔴 Size increased by `budget-percent-increase-red`% or more (default: 20%)
- 🟡 Size increased by less than `budget-percent-increase-red`%
- 🟢 Size decreased by 1% or more
- ✨ New route added
- 🗑️ Route removed
- ⚠️ Route exceeds the `budget` size limit

## Inputs

| Input                         | Description                                                                      | Required | Default                         |
| ----------------------------- | -------------------------------------------------------------------------------- | -------- | ------------------------------- |
| `working-directory`           | Working directory of the Next.js project (for monorepos)                         | No       | `.`                             |
| `build-output-directory`      | Next.js build output directory                                                   | No       | `.next`                         |
| `build-command`               | Command to build and analyze the bundle                                          | No       | `npx next experimental-analyze` |
| `budget`                      | First-page load JS size budget in bytes. Routes exceeding this are marked with ⚠️ | No       | —                               |
| `budget-percent-increase-red` | Percentage increase threshold to mark route as 🔴                                 | No       | `20`                            |
| `minimum-change-threshold`    | Ignore routes with absolute size change smaller than this value in bytes         | No       | `0`                             |
| `skip-comment-if-empty`       | Skip posting PR comment if no changed routes are detected                        | No       | `false`                         |

## Permissions

The action requires the following permissions:

```yaml
permissions:
  pull-requests: write   # To post/update PR comments
  contents: read         # To checkout code
```

## License

MIT
