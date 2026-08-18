# Obsidian Workflows

![CI](https://github.com/saberzero1/obsidian-workflows/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/saberzero1/obsidian-workflows/actions/workflows/check-dist.yml/badge.svg)
![Coverage](./badges/coverage.svg)

A GitHub Action that validates, lints, builds, and releases Obsidian plugins and
themes. Matches the community directory's validation and scanner expectations so
your submissions pass on the first try.

## Quick Start

### PR Checks (CI)

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: saberzero1/obsidian-workflows@v1
```

The action auto-detects whether your project is a plugin or theme.

### Release

```yaml
name: Release
on:
  push:
    tags: ['*']

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
      attestations: write
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - uses: saberzero1/obsidian-workflows@v1
        with:
          mode: release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Or use the reusable release workflow for a single-file setup:

```yaml
name: Release
on:
  push:
    tags: ['*']

jobs:
  release:
    uses: saberzero1/obsidian-workflows/.github/workflows/release.yml@v1
    permissions:
      contents: write
      id-token: write
      attestations: write
```

## Inputs

| Input          | Default   | Description                                                                                                                   |
| -------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `type`         | `auto`    | Project type: `plugin`, `theme`, or `auto`. Auto-detection checks `manifest.json` for an `id` field and `theme.css` presence. |
| `mode`         | `pr`      | Run mode: `pr` (CI checks) or `release` (full release validation, attestation, draft release).                                |
| `build`        | _(empty)_ | Explicit build command override. For plugins, auto-detects `build`/`build:plugin`/`compile`. Set to `false` to disable.       |
| `lint`         | `true`    | Whether to run linting.                                                                                                       |
| `scanner-lint` | `false`   | Use community scanner lint rulesets instead of project config. Always forced `true` in release mode.                          |
| `node-version` | `24`      | Node.js version. Minimum enforced: 20.                                                                                        |

## Outputs

| Output              | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `type`              | Detected or specified project type (`plugin`/`theme`). |
| `validation-passed` | Whether all validation checks passed (`true`/`false`). |
| `release-url`       | URL of the created draft release (release mode only).  |

## What It Checks

| Check                                       | PR Mode    | Release Mode |
| ------------------------------------------- | ---------- | ------------ |
| `manifest.json` schema                      | Yes        | Yes          |
| `versions.json` format                      | If present | If present   |
| Readme exists and non-empty                 | Yes        | Yes          |
| License (error if missing, warn if non-OSI) | Yes        | Yes          |
| Build (auto-detect or explicit)             | Plugins    | Plugins      |
| Lint (user's config)                        | Default    | No           |
| Lint (scanner rulesets)                     | Opt-in     | Always       |
| Release assets present                      | No         | Yes          |
| Manifest consistency (HEAD vs tag)          | No         | Yes          |
| Build artifact attestation                  | No         | Yes          |
| Draft release creation                      | No         | Yes          |

### Type Detection

The action detects your project type automatically:

1. `manifest.json` has an `id` field (string) → **plugin**
1. `manifest.json` has no `id` field and `theme.css` exists → **theme**
1. Neither condition met → error with instructions to set `type` explicitly

### Scanner Lint Rulesets

In release mode (or when `scanner-lint: true`), the action installs and runs the
same lint configurations used by the Obsidian community directory scanner:

- **Stylelint** with the scanner's ruleset (both plugins and themes)
- **ESLint** with `eslint-plugin-obsidianmd` (plugins only, with type-aware
  rules when `tsconfig.json` is present)

This ensures your release will pass the community directory's automated checks.

### Build Auto-Detection

For plugins, the action checks `package.json` for the first available script:

1. `build`
1. `build:plugin`
1. `compile`

If found, it runs `npm ci` (or `npm install`) followed by the detected script.
Set `build: false` to skip, or `build: <command>` to override.

## Development

```bash
npm install
npm test
npm run bundle
```

## License

MIT
