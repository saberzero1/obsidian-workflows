import * as fs from 'node:fs'
import * as path from 'node:path'
import { isPluginManifest, isThemeManifest, readManifest } from './detect.js'
import type { ProjectType, PluginManifest, ValidationResult } from './types.js'

const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?$/

const DISALLOWED_NAME_WORDS = ['obsidian', 'plugin']

function validateSemver(version: string, field: string): ValidationResult[] {
  if (!SEMVER_REGEX.test(version)) {
    return [
      {
        message: `${field} "${version}" is not valid semver (expected X.Y.Z).`,
        severity: 'error',
        check: 'manifest'
      }
    ]
  }
  return []
}

function validateName(name: string): ValidationResult[] {
  const results: ValidationResult[] = []
  const lower = name.toLowerCase()

  for (const word of DISALLOWED_NAME_WORDS) {
    if (lower.includes(word)) {
      results.push({
        message: `Plugin name should not contain "${word}". Found in: "${name}".`,
        severity: 'warning',
        check: 'manifest'
      })
    }
  }

  return results
}

function validateDescription(description: string): ValidationResult[] {
  const results: ValidationResult[] = []
  const trimmed = description.trim()

  if (trimmed.length < 10) {
    results.push({
      message: `Description is too short (${trimmed.length} chars). Provide a meaningful description (10+ chars).`,
      severity: 'warning',
      check: 'manifest'
    })
  }

  return results
}

function validateUrl(
  url: string | undefined,
  field: string
): ValidationResult[] {
  if (url === undefined) return []
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return [
        {
          message: `${field} must be an HTTP or HTTPS URL. Got: "${url}".`,
          severity: 'error',
          check: 'manifest'
        }
      ]
    }
  } catch {
    return [
      {
        message: `${field} is not a valid URL: "${url}".`,
        severity: 'error',
        check: 'manifest'
      }
    ]
  }
  return []
}

export function validatePluginManifest(
  manifest: PluginManifest
): ValidationResult[] {
  const results: ValidationResult[] = []

  if (!manifest.id || manifest.id.trim().length === 0) {
    results.push({
      message: 'Plugin manifest is missing required field: id.',
      severity: 'error',
      check: 'manifest'
    })
  }

  if (!manifest.name || manifest.name.trim().length === 0) {
    results.push({
      message: 'Plugin manifest is missing required field: name.',
      severity: 'error',
      check: 'manifest'
    })
  } else {
    results.push(...validateName(manifest.name))
  }

  if (!manifest.version || manifest.version.trim().length === 0) {
    results.push({
      message: 'Plugin manifest is missing required field: version.',
      severity: 'error',
      check: 'manifest'
    })
  } else {
    results.push(...validateSemver(manifest.version, 'version'))
  }

  if (!manifest.description || manifest.description.trim().length === 0) {
    results.push({
      message: 'Plugin manifest is missing required field: description.',
      severity: 'error',
      check: 'manifest'
    })
  } else {
    results.push(...validateDescription(manifest.description))
  }

  if (manifest.minAppVersion) {
    results.push(...validateSemver(manifest.minAppVersion, 'minAppVersion'))
  }

  results.push(...validateUrl(manifest.authorUrl, 'authorUrl'))

  if (typeof manifest.fundingUrl === 'string') {
    results.push(...validateUrl(manifest.fundingUrl, 'fundingUrl'))
  } else if (
    typeof manifest.fundingUrl === 'object' &&
    manifest.fundingUrl !== null
  ) {
    for (const [platform, url] of Object.entries(manifest.fundingUrl)) {
      results.push(...validateUrl(url, `fundingUrl.${platform}`))
    }
  }

  return results
}

export function validateThemeManifest(
  manifest: Record<string, unknown>
): ValidationResult[] {
  const results: ValidationResult[] = []

  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
    results.push({
      message: 'Theme manifest is missing required field: name.',
      severity: 'error',
      check: 'manifest'
    })
  }

  if (
    typeof manifest.version !== 'string' ||
    manifest.version.trim().length === 0
  ) {
    results.push({
      message: 'Theme manifest is missing required field: version.',
      severity: 'error',
      check: 'manifest'
    })
  } else {
    results.push(...validateSemver(manifest.version as string, 'version'))
  }

  if (manifest.minAppVersion !== undefined) {
    if (typeof manifest.minAppVersion !== 'string') {
      results.push({
        message: 'Theme manifest field minAppVersion must be a string.',
        severity: 'error',
        check: 'manifest'
      })
    } else {
      results.push(...validateSemver(manifest.minAppVersion, 'minAppVersion'))
    }
  }

  if (manifest.authorUrl !== undefined) {
    results.push(
      ...validateUrl(manifest.authorUrl as string | undefined, 'authorUrl')
    )
  }

  return results
}

export function validateVersionsJson(
  workspacePath: string
): ValidationResult[] {
  const versionsPath = path.join(workspacePath, 'versions.json')
  if (!fs.existsSync(versionsPath)) return []

  const results: ValidationResult[] = []
  let data: unknown

  try {
    const raw = fs.readFileSync(versionsPath, 'utf-8')
    data = JSON.parse(raw)
  } catch {
    results.push({
      message: 'versions.json is not valid JSON.',
      severity: 'error',
      check: 'versions'
    })
    return results
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    results.push({
      message:
        'versions.json must be a JSON object mapping plugin versions to minimum app versions.',
      severity: 'error',
      check: 'versions'
    })
    return results
  }

  for (const [pluginVersion, minApp] of Object.entries(
    data as Record<string, unknown>
  )) {
    if (!SEMVER_REGEX.test(pluginVersion)) {
      results.push({
        message: `versions.json key "${pluginVersion}" is not valid semver.`,
        severity: 'warning',
        check: 'versions'
      })
    }
    if (typeof minApp !== 'string' || !SEMVER_REGEX.test(minApp)) {
      results.push({
        message: `versions.json value for "${pluginVersion}" is not a valid semver string.`,
        severity: 'warning',
        check: 'versions'
      })
    }
  }

  return results
}

export function validateManifest(
  workspacePath: string,
  projectType: ProjectType
): ValidationResult[] {
  const manifest = readManifest(workspacePath)

  if (manifest === null) {
    return [
      {
        message: 'manifest.json not found or is not valid JSON.',
        severity: 'error',
        check: 'manifest'
      }
    ]
  }

  const obj = manifest as Record<string, unknown>

  if (projectType === 'plugin') {
    if (!isPluginManifest(obj)) {
      return [
        {
          message:
            'manifest.json does not match the plugin schema. ' +
            'Required fields: id (string), name (string), version (string), description (string).',
          severity: 'error',
          check: 'manifest'
        }
      ]
    }
    return [
      ...validatePluginManifest(obj),
      ...validateVersionsJson(workspacePath)
    ]
  }

  if (!isThemeManifest(obj)) {
    return [
      {
        message:
          'manifest.json does not match the theme schema. ' +
          'Required fields: name (string), version (string).',
        severity: 'error',
        check: 'manifest'
      }
    ]
  }

  return validateThemeManifest(obj)
}
