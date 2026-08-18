import * as core from '@actions/core'
import { detectProjectType } from './detect.js'
import { validateManifest } from './manifest.js'
import { checkLicense, checkReadme } from './repo-checks.js'
import { runBuild } from './build.js'
import { runLint } from './lint.js'
import {
  validateReleaseAssets,
  validateManifestConsistency,
  attestBuildArtifacts,
  createDraftRelease
} from './release.js'
import type { ActionInputs, RunMode, ValidationResult } from './types.js'

function parseInputs(): ActionInputs {
  const typeRaw = core.getInput('type') || 'auto'
  if (typeRaw !== 'plugin' && typeRaw !== 'theme' && typeRaw !== 'auto') {
    throw new Error(
      `Invalid type input: "${typeRaw}". Must be "plugin", "theme", or "auto".`
    )
  }

  const modeRaw = core.getInput('mode') || 'pr'
  if (modeRaw !== 'pr' && modeRaw !== 'release') {
    throw new Error(
      `Invalid mode input: "${modeRaw}". Must be "pr" or "release".`
    )
  }

  const nodeVersion = core.getInput('node-version') || '24'
  const nodeVersionNum = parseInt(nodeVersion, 10)
  if (isNaN(nodeVersionNum) || nodeVersionNum < 20) {
    throw new Error(
      `Node version "${nodeVersion}" is below the minimum required version (20).`
    )
  }

  return {
    type: typeRaw as 'plugin' | 'theme' | 'auto',
    mode: modeRaw as RunMode,
    build: core.getInput('build') || '',
    lint: core.getInput('lint') !== 'false',
    scannerLint: core.getInput('scanner-lint') === 'true',
    nodeVersion
  }
}

export async function run(): Promise<void> {
  try {
    const inputs = parseInputs()
    const workspacePath = process.env.GITHUB_WORKSPACE ?? process.cwd()
    const allResults: ValidationResult[] = []

    const projectType = detectProjectType(workspacePath, inputs.type)
    core.setOutput('type', projectType)
    core.info(`Project type: ${projectType}`)

    core.startGroup('Manifest validation')
    allResults.push(...validateManifest(workspacePath, projectType))
    core.endGroup()

    core.startGroup('Repository checks')
    allResults.push(...checkReadme(workspacePath))
    allResults.push(...checkLicense(workspacePath))
    core.endGroup()

    core.startGroup('Build')
    allResults.push(
      ...(await runBuild(workspacePath, projectType, inputs.build))
    )
    core.endGroup()

    if (inputs.lint) {
      core.startGroup('Lint')
      allResults.push(
        ...(await runLint(
          workspacePath,
          projectType,
          inputs.scannerLint,
          inputs.mode
        ))
      )
      core.endGroup()
    }

    if (inputs.mode === 'release') {
      core.startGroup('Release validation')
      allResults.push(...validateReleaseAssets(workspacePath, projectType))
      allResults.push(...validateManifestConsistency(workspacePath))
      core.endGroup()

      const hasErrors = allResults.some((r) => r.severity === 'error')
      if (hasErrors) {
        core.error(
          'Validation errors found. Skipping attestation and release creation.'
        )
      } else {
        core.startGroup('Attestation')
        allResults.push(
          ...(await attestBuildArtifacts(workspacePath, projectType))
        )
        core.endGroup()

        core.startGroup('Draft release')
        allResults.push(
          ...(await createDraftRelease(workspacePath, projectType))
        )
        core.endGroup()
      }
    }

    reportResults(allResults)

    const hasErrors = allResults.some((r) => r.severity === 'error')
    core.setOutput('validation-passed', (!hasErrors).toString())

    if (hasErrors) {
      core.setFailed('Validation failed. See the errors above for details.')
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

function reportResults(results: ValidationResult[]): void {
  if (results.length === 0) {
    core.info('All checks passed.')
    return
  }

  for (const result of results) {
    switch (result.severity) {
      case 'error':
        core.error(`[${result.check}] ${result.message}`)
        break
      case 'warning':
        core.warning(`[${result.check}] ${result.message}`)
        break
      case 'info':
        core.info(`[${result.check}] ${result.message}`)
        break
    }
  }

  const errors = results.filter((r) => r.severity === 'error').length
  const warnings = results.filter((r) => r.severity === 'warning').length
  core.info(`Summary: ${errors} error(s), ${warnings} warning(s)`)
}
