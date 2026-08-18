import * as fs from 'node:fs'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import type { ProjectType, ValidationResult } from './types.js'

const SCANNER_STYLELINT_CONFIG = {
  plugins: ['stylelint-no-unsupported-browser-features'],
  ignoreDisables: true,
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
} as const

const SCANNER_STYLELINT_DEPS = [
  'stylelint@17',
  'stylelint-no-unsupported-browser-features@8'
]

const SCANNER_ESLINT_DEPS = ['eslint@9', 'eslint-plugin-obsidianmd@latest']

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
    [
      'stylelint',
      ...existingFiles,
      '--config',
      configPath,
      '--ignore-path',
      '/dev/null',
      '--ignore-pattern',
      'node_modules',
      '--ignore-pattern',
      'dist'
    ],
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

async function runScannerEslint(
  workspacePath: string
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  const hasTsconfig = fs.existsSync(path.join(workspacePath, 'tsconfig.json'))

  core.info('Installing scanner ESLint dependencies...')
  const deps = [...SCANNER_ESLINT_DEPS]
  if (hasTsconfig) {
    deps.push('typescript-eslint@8')
  }

  const installed = await installLintDeps(deps, workspacePath)
  if (!installed) {
    results.push({
      message: 'Failed to install scanner ESLint dependencies.',
      severity: 'error',
      check: 'lint'
    })
    return results
  }

  const configContent = hasTsconfig
    ? `import obsidianmd from "eslint-plugin-obsidianmd";
export default [...obsidianmd.configs.recommended];
`
    : `import obsidianmd from "eslint-plugin-obsidianmd";
export default [
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
