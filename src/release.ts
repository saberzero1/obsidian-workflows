import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { attestProvenance } from '@actions/attest'
import { readManifest } from './detect.js'
import type { ProjectType, ValidationResult } from './types.js'

function getTagFromRef(): string | null {
  const ref = process.env.GITHUB_REF ?? ''
  if (ref.startsWith('refs/tags/')) return ref.replace('refs/tags/', '')
  return null
}

function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function validateReleaseAssets(
  workspacePath: string,
  projectType: ProjectType
): ValidationResult[] {
  const results: ValidationResult[] = []

  if (projectType === 'plugin') {
    if (!fs.existsSync(path.join(workspacePath, 'main.js'))) {
      results.push({
        message:
          'Release asset main.js not found. Did the build step complete successfully?',
        severity: 'error',
        check: 'release'
      })
    }

    if (!fs.existsSync(path.join(workspacePath, 'manifest.json'))) {
      results.push({
        message: 'Release asset manifest.json not found.',
        severity: 'error',
        check: 'release'
      })
    }
  }

  if (projectType === 'theme') {
    if (!fs.existsSync(path.join(workspacePath, 'theme.css'))) {
      results.push({
        message: 'Release asset theme.css not found.',
        severity: 'error',
        check: 'release'
      })
    }

    if (!fs.existsSync(path.join(workspacePath, 'manifest.json'))) {
      results.push({
        message: 'Release asset manifest.json not found.',
        severity: 'error',
        check: 'release'
      })
    }
  }

  return results
}

export function validateManifestConsistency(
  workspacePath: string
): ValidationResult[] {
  const results: ValidationResult[] = []
  const tag = getTagFromRef()

  if (!tag) return results

  const manifest = readManifest(workspacePath)
  if (!manifest || typeof manifest !== 'object') return results

  const obj = manifest as Record<string, unknown>
  const manifestVersion = obj.version as string | undefined

  if (manifestVersion && manifestVersion !== tag) {
    results.push({
      message: `manifest.json version "${manifestVersion}" does not match the release tag "${tag}".`,
      severity: 'warning',
      check: 'release'
    })
  }

  return results
}

interface ArtifactSubject {
  name: string
  filePath: string
}

function collectSubjects(
  workspacePath: string,
  projectType: ProjectType
): ArtifactSubject[] {
  const subjects: ArtifactSubject[] = []

  if (projectType === 'plugin') {
    const mainJs = path.join(workspacePath, 'main.js')
    if (fs.existsSync(mainJs))
      subjects.push({ name: 'main.js', filePath: mainJs })

    const stylesCss = path.join(workspacePath, 'styles.css')
    if (fs.existsSync(stylesCss))
      subjects.push({ name: 'styles.css', filePath: stylesCss })
  }

  if (projectType === 'theme') {
    const themeCss = path.join(workspacePath, 'theme.css')
    if (fs.existsSync(themeCss))
      subjects.push({ name: 'theme.css', filePath: themeCss })
  }

  return subjects
}

export async function attestBuildArtifacts(
  workspacePath: string,
  projectType: ProjectType
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []
  const subjects = collectSubjects(workspacePath, projectType)

  if (subjects.length === 0) {
    results.push({
      message: 'No artifacts found to attest.',
      severity: 'warning',
      check: 'release'
    })
    return results
  }

  const token = process.env.GITHUB_TOKEN ?? ''
  if (!token) {
    results.push({
      message:
        'GITHUB_TOKEN not set. Attestation requires a token with id-token:write and attestations:write permissions.',
      severity: 'warning',
      check: 'release'
    })
    return results
  }

  for (const subject of subjects) {
    const digest = computeSha256(subject.filePath)
    core.info(`Attesting ${subject.name} (sha256:${digest})...`)

    try {
      const attestation = await attestProvenance({
        subjectName: subject.name,
        subjectDigest: { sha256: digest },
        token,
        sigstore: 'public-good'
      })

      core.info(
        `Attestation created for ${subject.name} (ID: ${attestation.attestationID})`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({
        message: `Attestation failed for ${subject.name}: ${message}. Ensure the workflow has id-token:write and attestations:write permissions.`,
        severity: 'warning',
        check: 'release'
      })
    }
  }

  return results
}

export async function createDraftRelease(
  workspacePath: string,
  projectType: ProjectType
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []
  const tag = getTagFromRef()

  if (!tag) {
    results.push({
      message:
        'Cannot create release: not triggered by a tag push (GITHUB_REF does not start with refs/tags/).',
      severity: 'error',
      check: 'release'
    })
    return results
  }

  const releaseAssets: string[] = ['manifest.json']

  if (projectType === 'plugin') {
    releaseAssets.push('main.js')
    if (fs.existsSync(path.join(workspacePath, 'styles.css'))) {
      releaseAssets.push('styles.css')
    }
  }

  if (projectType === 'theme') {
    releaseAssets.push('theme.css')
  }

  core.info(`Creating draft release for tag "${tag}"...`)

  let releaseUrl = ''
  const exitCode = await exec.exec(
    'gh',
    ['release', 'create', tag, '--title', tag, '--draft', ...releaseAssets],
    {
      cwd: workspacePath,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          releaseUrl += data.toString()
        }
      }
    }
  )

  if (exitCode !== 0) {
    results.push({
      message: `Failed to create draft release (exit code ${exitCode}).`,
      severity: 'error',
      check: 'release'
    })
  } else {
    const url = releaseUrl.trim()
    if (url) {
      core.setOutput('release-url', url)
      core.info(`Draft release created: ${url}`)
    }
  }

  return results
}
