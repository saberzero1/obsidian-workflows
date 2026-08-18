import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { ensureUserDeps } from './deps.js'
import { readManifest } from './detect.js'
import type { ProjectType, ValidationResult } from './types.js'

const SCANNER_STYLELINT_CONFIG = {
  plugins: ['stylelint-no-unsupported-browser-features'],
  ignoreDisables: true,
  ignoreFiles: [
    'node_modules',
    'dist',
    'build',
    'pkg',
    'test-vault',
    '.obsidian',
    '**/.obsidian/**',
    'esbuild.config.mjs',
    'version-bump.mjs',
    '**/*.test.*',
    '**/*.tests.*',
    '**/*.spec.*',
    '**/*.specs.*',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '**/mocks/**',
    '**/__mocks__/**',
    '**/*.cjs',
    '**/*.mjs',
    '**/*.cts',
    '**/*.mts',
    '**/vite*',
    '**/scripts/**',
    '**/docs/**',
    '**/i18n/**',
    '**/i18next/**',
    '**/locale/**',
    '**/locales/**',
    '**/translations/**',
    '**/l10n/**',
    '.pnpm-store',
    '**/*.spec.ts',
    '**/testUtils**',
    'automation/**',
    'e2e-tests/**'
  ],
  rules: {
    'function-url-scheme-disallowed-list': [
      ['http', 'https', 'file'],
      {
        severity: 'error',
        message:
          'External URLs are not allowed in themes. To embed images & fonts encode them as base64 <https://docs.obsidian.md/Themes/App+themes/Embed+fonts+and+images+in+your+theme>'
      }
    ],
    'function-url-scheme-allowed-list': ['data'],
    'declaration-no-important': [
      true,
      {
        severity: 'warning',
        message:
          'Avoid !important — override styles by increasing selector specificity or using CSS variables instead.'
      }
    ],
    'color-named': [
      'never',
      {
        ignoreKeywords: ['transparent', 'currentColor'],
        severity: 'warning',
        message:
          'Use hex colors or Obsidian CSS variables instead of named colors to ensure proper light/dark theme support. <https://docs.obsidian.md/Reference/CSS+variables/CSS+variables>'
      }
    ],
    'custom-property-no-missing-var-function': false,
    'no-duplicate-selectors': false,
    'no-duplicate-at-import-rules': false,
    'declaration-block-no-duplicate-properties': [
      true,
      { severity: 'warning' }
    ],
    'shorthand-property-no-redundant-values': false,
    'plugin/no-unsupported-browser-features': [
      true,
      {
        severity: 'warning',
        browsers: ['electron >= 39'],
        ignore: ['css-nesting', 'css-cascade-layers']
      }
    ],
    'selector-pseudo-class-disallowed-list': [
      ['has'],
      {
        severity: 'warning',
        message:
          'Avoid :has() — it can cause significant performance issues due to broad selector invalidation.'
      }
    ],
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['global', 'local'],
        severity: 'warning'
      }
    ],
    'selector-pseudo-element-no-unknown': [true, { severity: 'warning' }],
    'selector-type-no-unknown': [
      true,
      { ignoreTypes: [], severity: 'warning' }
    ],
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['layer', 'property', 'container'],
        severity: 'warning'
      }
    ],
    'unit-no-unknown': [true, { severity: 'warning' }],
    'property-disallowed-list': [['all'], { severity: 'warning' }]
  }
}

// Source: community-workers/src/worker/electronVersions.json
const ELECTRON_VERSIONS: Record<number, string> = {
  25: '1.4.5',
  28: '1.5.8',
  30: '1.6.5',
  31: '1.7.4',
  37: '1.9.12',
  39: '1.11.4'
}

const DEFAULT_ELECTRON = 39

function semverToNum(v: string): number {
  const [major = 0, minor = 0, patch = 0] = v.split('.').map(Number)
  return major * 100_000 + minor * 1_000 + patch
}

export function getMinElectronVersion(
  minAppVersion: string | undefined
): number {
  if (!minAppVersion) return DEFAULT_ELECTRON

  const target = semverToNum(minAppVersion)
  let result = Math.min(...Object.keys(ELECTRON_VERSIONS).map(Number))

  for (const [electronStr, obsidianVersion] of Object.entries(
    ELECTRON_VERSIONS
  )) {
    const electron = Number(electronStr)
    if (semverToNum(obsidianVersion) <= target) {
      result = Math.max(result, electron)
    }
  }

  return result
}

function buildStylelintConfig(minAppVersion: string | undefined): object {
  const minElectron = getMinElectronVersion(minAppVersion)
  const config = JSON.parse(JSON.stringify(SCANNER_STYLELINT_CONFIG))
  config.rules['plugin/no-unsupported-browser-features'][1].browsers = [
    `electron >= ${minElectron}`
  ]
  return config
}

const SCANNER_STYLELINT_DEPS: Record<string, string> = {
  stylelint: '17.6.0',
  'stylelint-no-unsupported-browser-features': '8.1.1'
}

const SCANNER_ESLINT_DEPS: Record<string, string> = {
  eslint: '9.37.0',
  'eslint-plugin-obsidianmd': '0.4.1',
  'typescript-eslint': '8.61.1'
}

async function createScannerDepsDir(
  deps: Record<string, string>
): Promise<string> {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'obsidian-scanner-lint-')
  )
  const pkg = {
    name: 'obsidian-scanner-lint',
    private: true,
    dependencies: deps
  }
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg))

  const exitCode = await exec.exec('npm', ['install'], {
    cwd: tempDir,
    ignoreReturnCode: true
  })

  if (exitCode !== 0) {
    fs.rmSync(tempDir, { recursive: true, force: true })
    throw new Error('Failed to install scanner lint dependencies.')
  }

  return tempDir
}

async function runUserLint(workspacePath: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  const pkgPath = path.join(workspacePath, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    core.info('No package.json found. Skipping user lint.')
    return results
  }

  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as Record<string, unknown>
    const scripts = pkg.scripts as Record<string, string> | undefined
    if (!scripts?.lint) {
      core.info('No "lint" script in package.json. Skipping user lint.')
      return results
    }
  } catch {
    return results
  }

  core.info('Running user lint script...')
  const exitCode = await exec.exec('npm', ['run', 'lint'], {
    cwd: workspacePath,
    ignoreReturnCode: true
  })

  if (exitCode !== 0) {
    results.push({
      message: `User lint script failed (exit code ${exitCode}).`,
      severity: 'warning',
      check: 'lint'
    })
  }

  return results
}

async function runScannerStylelint(
  workspacePath: string,
  projectType: ProjectType,
  minAppVersion: string | undefined
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  core.info('Installing scanner stylelint dependencies...')
  let scannerDir: string
  try {
    scannerDir = await createScannerDepsDir(SCANNER_STYLELINT_DEPS)
  } catch {
    results.push({
      message: 'Failed to install scanner stylelint dependencies.',
      severity: 'error',
      check: 'lint'
    })
    return results
  }

  const configPath = path.join(workspacePath, '.stylelintrc.scanner.json')
  const config = buildStylelintConfig(minAppVersion)
  fs.writeFileSync(configPath, JSON.stringify(config))

  try {
    const targetFiles =
      projectType === 'theme'
        ? [path.join(workspacePath, 'theme.css')]
        : ['**/*.css']

    const existingFiles = targetFiles.filter((f) => {
      if (f.includes('*')) return true
      return fs.existsSync(f)
    })

    if (existingFiles.length === 0) {
      core.info('No CSS files found to lint.')
      return results
    }

    core.info('Running scanner stylelint...')
    const exitCode = await exec.exec(
      'npx',
      [
        '--prefix',
        scannerDir,
        'stylelint',
        ...existingFiles,
        '--config',
        configPath
      ],
      {
        cwd: workspacePath,
        ignoreReturnCode: true,
        env: {
          ...process.env,
          NODE_PATH: path.join(scannerDir, 'node_modules')
        }
      }
    )

    if (exitCode !== 0 && exitCode !== 2) {
      results.push({
        message: `Scanner stylelint failed (exit code ${exitCode}).`,
        severity: 'error',
        check: 'lint'
      })
    } else if (exitCode === 2) {
      results.push({
        message:
          'Scanner stylelint found issues. Review the output above for details.',
        severity: 'warning',
        check: 'lint'
      })
    }
  } finally {
    fs.rmSync(scannerDir, { recursive: true, force: true })
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath)
  }

  return results
}

function buildScannerEslintConfig(hasTsconfig: boolean): string {
  if (!hasTsconfig) {
    return `import obsidianmd from "eslint-plugin-obsidianmd";
import { globalIgnores } from "eslint/config";

const IGNORES = ${JSON.stringify(SCANNER_STYLELINT_CONFIG.ignoreFiles)};

export default [
  globalIgnores(IGNORES),
  { ignores: ["eslint.config.scanner.mjs", "main.js", "styles.css"] },
  ...obsidianmd.configs.recommended.map(config => {
    if (config.rules) {
      const filtered = { ...config.rules };
      delete filtered["obsidianmd/no-plugin-as-component"];
      delete filtered["obsidianmd/no-view-references-in-plugin"];
      delete filtered["obsidianmd/no-unsupported-api"];
      delete filtered["obsidianmd/prefer-create-el"];
      delete filtered["obsidianmd/prefer-file-manager-trash-file"];
      delete filtered["obsidianmd/prefer-instanceof"];
      return { ...config, rules: filtered };
    }
    return config;
  })
];
`
  }

  return `import { cwd } from "node:process";
import { globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

const IGNORES = ${JSON.stringify(SCANNER_STYLELINT_CONFIG.ignoreFiles)};

function toWarns(config) {
  if (!config) return config;
  if (!Array.isArray(config) && typeof config[Symbol.iterator] === "function") {
    return [...config].map(toWarns);
  }
  if (Array.isArray(config)) return config.map(toWarns);
  const result = { ...config };
  if (result.extends) result.extends = toWarns(result.extends);
  if (result.rules) {
    result.rules = Object.fromEntries(
      Object.entries(result.rules).map(([key, value]) => {
        if (key.startsWith("eslint-comments/")) return [key, value];
        if (value === "error" || value === 2) return [key, "warn"];
        if (Array.isArray(value) && (value[0] === "error" || value[0] === 2)) return [key, ["warn", ...value.slice(1)]];
        return [key, value];
      })
    );
  }
  return result;
}

export default [
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.js",
            "eslint.config.mjs",
            "eslint.config.mts",
            "manifest.json",
            "main.js",
          ]
        },
        tsconfigRootDir: cwd(),
        extraFileExtensions: [".json"]
      },
    },
  },
  ...toWarns(obsidianmd.configs.recommended),
  {
    linterOptions: {
      noInlineConfig: false,
      reportUnusedDisableDirectives: "off",
      reportUnusedInlineConfigs: "off",
    },
  },
  {
    files: ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"],
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      "obsidianmd/regex-lookbehind": "error",
      "obsidianmd/no-forbidden-elements": "error",

      "no-undef": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "import/no-unresolved": "off",

      "obsidianmd/validate-manifest": "off",
      "obsidianmd/validate-license": "off",

      "obsidianmd/commands/no-command-in-command-id": "off",
      "obsidianmd/commands/no-plugin-id-in-command-id": "off",
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "manifest.json"],
    rules: {
      "obsidianmd/ui/sentence-case": "off",
      "obsidianmd/ui/sentence-case-json": "off",
      "obsidianmd/ui/sentence-case-locale-module": "off",
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      "eslint-comments/require-description": "error",
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "obsidianmd": obsidianmd,
    },
    rules: {
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",

      "obsidianmd/commands/no-command-in-command-id": "warn",
      "obsidianmd/commands/no-plugin-id-in-command-id": "warn",

      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
      "obsidianmd/sample-names": "error",
      "obsidianmd/no-sample-code": "error",
      "obsidianmd/platform": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-view-references-in-plugin": "error",
      "obsidianmd/no-unsupported-api": "error",
    }
  },
  globalIgnores(IGNORES),
  { ignores: ["eslint.config.scanner.mjs", "main.js", "styles.css"] },
];
`
}

async function runScannerEslint(
  workspacePath: string
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  const hasTsconfig = fs.existsSync(path.join(workspacePath, 'tsconfig.json'))

  await ensureUserDeps(workspacePath)

  core.info('Installing scanner ESLint dependencies...')
  let scannerDir: string
  try {
    scannerDir = await createScannerDepsDir(SCANNER_ESLINT_DEPS)
  } catch {
    results.push({
      message: 'Failed to install scanner ESLint dependencies.',
      severity: 'error',
      check: 'lint'
    })
    return results
  }

  const configContent = buildScannerEslintConfig(hasTsconfig)
  const configPath = path.join(workspacePath, 'eslint.config.scanner.mjs')
  fs.writeFileSync(configPath, configContent)

  try {
    core.info(
      hasTsconfig
        ? 'Running scanner ESLint with type-aware rules...'
        : 'Running scanner ESLint without type-aware rules (no tsconfig.json)...'
    )

    const nodePath = [
      path.join(scannerDir, 'node_modules'),
      path.join(workspacePath, 'node_modules')
    ].join(path.delimiter)

    const exitCode = await exec.exec(
      'npx',
      [
        '--prefix',
        scannerDir,
        'eslint',
        '--config',
        configPath,
        '--no-error-on-unmatched-pattern',
        '.'
      ],
      {
        cwd: workspacePath,
        ignoreReturnCode: true,
        env: {
          ...process.env,
          NODE_PATH: nodePath
        }
      }
    )

    if (exitCode !== 0) {
      results.push({
        message: `Scanner ESLint found issues (exit code ${exitCode}). Review the output above.`,
        severity: 'warning',
        check: 'lint'
      })
    }
  } finally {
    fs.rmSync(scannerDir, { recursive: true, force: true })
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath)
  }

  return results
}

export async function runLint(
  workspacePath: string,
  projectType: ProjectType,
  useScannerLint: boolean,
  mode: string
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []
  const effectiveScannerLint = mode === 'release' || useScannerLint

  if (!effectiveScannerLint) {
    results.push(...(await runUserLint(workspacePath)))
    return results
  }

  const manifest = readManifest(workspacePath)
  const minAppVersion =
    manifest && typeof manifest === 'object'
      ? ((manifest as Record<string, unknown>).minAppVersion as
          string | undefined)
      : undefined

  results.push(
    ...(await runScannerStylelint(workspacePath, projectType, minAppVersion))
  )

  if (projectType === 'plugin') {
    results.push(...(await runScannerEslint(workspacePath)))
  }

  return results
}
