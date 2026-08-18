# Scanner Parity: Fix 4 Discrepancies

## Goal

Align our GitHub Action's ESLint and stylelint execution with the
community-workers scanner behavior.

## Phase 1: Revert `null` → `false` in stylelint config

**Risk: LOW | Files: `src/lint.ts`**

- Change lines 75, 76, 77, 82 in `src/lint.ts` from `null` to `false`
- Scanner uses `false` in `stylelintrc.json`, works with pinned 17.6.0
- Remove `as const` assertion on line 121 (type incompatibility with `false`)
- Verify: `npm test && npm run package`

## Phase 2: Extract shared dep-installation utility

**Risk: LOW | Files: `src/build.ts`, new `src/deps.ts`**

Prerequisite for Phases 3 and 5.

- Extract from `src/build.ts` (lines 27-31, 66-87):
  - `hasPackageJson(workspacePath)` (already exists, line 27)
  - `ensureUserDeps(workspacePath)` — checks `node_modules` existence, detects
    lockfile, runs `npm ci` or `npm install`
- Create `src/deps.ts` with these exports
- Update `src/build.ts` to import from `deps.ts`
- Verify: `npm test && npm run package`

## Phase 3: Ensure user deps before ESLint

**Risk: MEDIUM | Files: `src/lint.ts`**

- In `runScannerEslint()`, call `ensureUserDeps(workspacePath)` before scanner
  dep installation
- Ensures TypeScript types available for type-aware ESLint rules even when
  `build: 'false'`
- Only for plugins (ESLint doesn't run for themes)
- Idempotent — `ensureUserDeps` skips if `node_modules` already exists
- Verify: `npm test && npm run package`

## Phase 4: minAppVersion → browser target mapping

**Risk: MEDIUM | Files: `src/lint.ts`, `src/detect.ts`, `__tests__/lint.test.ts`
(new)**

- Add `ELECTRON_VERSIONS` constant:
  ```
  {25: '1.4.5', 28: '1.5.8', 30: '1.6.5', 31: '1.7.4', 37: '1.9.12', 39: '1.11.4'}
  ```
  Source: `community-workers/src/worker/electronVersions.json`
- Add `getMinElectronVersion(minAppVersion: string | undefined): number`
  - Returns 39 if undefined or above all mappings
  - Finds highest electron where obsidian version ≤ minAppVersion
  - Returns 25 if below all mappings
  - Uses numeric semver comparison (split on `.`, compare major/minor/patch)
- Modify `runScannerStylelint` signature: add
  `minAppVersion: string | undefined`
- Build stylelint config dynamically: deep-clone base config, patch `browsers`
  array
- Plumb `minAppVersion` from manifest through `runLint` → `runScannerStylelint`
- Read manifest in `runLint` using existing `readManifest()` from `detect.ts`
- Add unit tests for `getMinElectronVersion()`
- Verify: `npm test && npm run package`

## Phase 5: Dependency isolation via temp directory

**Risk: HIGH | Files: `src/lint.ts`**

Mirror the scanner's isolation model: scanner deps in isolated temp dir, user
deps in workspace.

- Create temp dir:
  `fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-scanner-lint-'))`
- Write minimal `package.json` to temp dir with scanner deps
- Run `npm install` in temp dir (isolated from user's package manager)
- For stylelint execution:
  - Command: `npx --prefix <tempDir> stylelint ...`
  - Env: `NODE_PATH=<tempDir>/node_modules`
- For ESLint execution:
  - Command: `npx --prefix <tempDir> eslint ...`
  - Env: `NODE_PATH=<tempDir>/node_modules:<workspacePath>/node_modules`
  - Temp dir first (scanner plugins), workspace second (user's TS types)
- Config files still written to `workspacePath`
- Clean up temp dir in `finally` block (both success and failure)
- Remove old `installLintDeps` function
- Verify: `npm test && npm run package`

## Phase 6: Final verification

- Run full test suite
- Bundle with `npm run package`
- Run `npm run lint` and `npm run format:check`
- Commit, push, update v1/v1.0.0 tags
