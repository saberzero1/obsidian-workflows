import * as fs from 'node:fs'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
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
    'custom-property-no-missing-var-function': null,
    'no-duplicate-selectors': null,
    'no-duplicate-at-import-rules': null,
    'declaration-block-no-duplicate-properties': [
      true,
      { severity: 'warning' }
    ],
    'shorthand-property-no-redundant-values': null,
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
} as const

const SCANNER_STYLELINT_DEPS = [
  'stylelint@17.6.0',
  'stylelint-no-unsupported-browser-features@8.1.1'
]

const SCANNER_ESLINT_DEPS = [
  'eslint@9',
  'eslint-plugin-obsidianmd@0.4.1',
  'typescript-eslint@8'
]

async function installLintDeps(
  deps: string[],
  workspacePath: string
): Promise<boolean> {
  const exitCode = await exec.exec('npm', ['install', '--no-save', ...deps], {
    cwd: workspacePath,
    ignoreReturnCode: true
  })
  return exitCode === 0
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
  projectType: ProjectType
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  core.info('Installing scanner stylelint dependencies...')
  const installed = await installLintDeps(SCANNER_STYLELINT_DEPS, workspacePath)
  if (!installed) {
    results.push({
      message: 'Failed to install scanner stylelint dependencies.',
      severity: 'error',
      check: 'lint'
    })
    return results
  }

  const configPath = path.join(workspacePath, '.stylelintrc.scanner.json')
  fs.writeFileSync(configPath, JSON.stringify(SCANNER_STYLELINT_CONFIG))

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
    fs.unlinkSync(configPath)
    return results
  }

  core.info('Running scanner stylelint...')
  const exitCode = await exec.exec(
    'npx',
    ['stylelint', ...existingFiles, '--config', configPath],
    {
      cwd: workspacePath,
      ignoreReturnCode: true
    }
  )

  fs.unlinkSync(configPath)

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

  return results
}

function buildScannerEslintConfig(hasTsconfig: boolean): string {
  if (!hasTsconfig) {
    return `import obsidianmd from "eslint-plugin-obsidianmd";
import { globalIgnores } from "eslint/config";

const IGNORES = ${JSON.stringify(SCANNER_STYLELINT_CONFIG.ignoreFiles)};

export default [
  globalIgnores(IGNORES),
  { ignores: ["eslint.config.scanner.mjs"] },
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
  { ignores: ["eslint.config.scanner.mjs"] },
];
`
}

async function runScannerEslint(
  workspacePath: string
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  const hasTsconfig = fs.existsSync(path.join(workspacePath, 'tsconfig.json'))

  core.info('Installing scanner ESLint dependencies...')
  const installed = await installLintDeps(SCANNER_ESLINT_DEPS, workspacePath)
  if (!installed) {
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

  core.info(
    hasTsconfig
      ? 'Running scanner ESLint with type-aware rules...'
      : 'Running scanner ESLint without type-aware rules (no tsconfig.json)...'
  )

  const exitCode = await exec.exec(
    'npx',
    ['eslint', '--config', configPath, '--no-error-on-unmatched-pattern', '.'],
    {
      cwd: workspacePath,
      ignoreReturnCode: true
    }
  )

  fs.unlinkSync(configPath)

  if (exitCode !== 0) {
    results.push({
      message: `Scanner ESLint found issues (exit code ${exitCode}). Review the output above.`,
      severity: 'warning',
      check: 'lint'
    })
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

  results.push(...(await runScannerStylelint(workspacePath, projectType)))

  if (projectType === 'plugin') {
    results.push(...(await runScannerEslint(workspacePath)))
  }

  return results
}
