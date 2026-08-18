/**
 * Shared types for Obsidian plugin and theme validation.
 */

/** Project type — plugin or theme. */
export type ProjectType = 'plugin' | 'theme'

/** Run mode — PR checks or full release validation. */
export type RunMode = 'pr' | 'release'

/** Severity level for validation results. */
export type Severity = 'error' | 'warning' | 'info'

/** A single validation result item. */
export interface ValidationResult {
  /** Human-readable message describing the finding. */
  message: string
  /** Severity of the finding. */
  severity: Severity
  /** The check that produced this result (e.g., "manifest", "license"). */
  check: string
}

/** Parsed action inputs. */
export interface ActionInputs {
  type: 'plugin' | 'theme' | 'auto'
  mode: RunMode
  build: string
  lint: boolean
  scannerLint: boolean
  nodeVersion: string
}

/**
 * Plugin manifest.json schema.
 *
 * Based on the community directory's PluginManifest interface.
 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  minAppVersion?: string
  author?: string
  authorUrl?: string
  fundingUrl?: string | Record<string, string>
  isDesktopOnly?: boolean
}

/**
 * Theme manifest.json schema.
 *
 * Based on the community directory's ThemeManifest interface.
 */
export interface ThemeManifest {
  name: string
  version: string
  minAppVersion?: string
  author?: string
  authorUrl?: string
}
