import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  validatePluginManifest,
  validateThemeManifest,
  validateVersionsJson,
  validateManifest
} from '../src/manifest.js'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-test-'))
}

describe('validatePluginManifest', () => {
  it('returns no errors for valid manifest', () => {
    const results = validatePluginManifest({
      id: 'my-plugin',
      name: 'My Plugin',
      version: '1.0.0',
      description: 'A great plugin for doing things'
    })
    expect(results.filter((r) => r.severity === 'error')).toHaveLength(0)
  })

  it('errors on missing id', () => {
    const results = validatePluginManifest({
      id: '',
      name: 'My Plugin',
      version: '1.0.0',
      description: 'A great plugin'
    })
    expect(results.some((r) => r.message.includes('id'))).toBe(true)
  })

  it('errors on invalid semver version', () => {
    const results = validatePluginManifest({
      id: 'my-plugin',
      name: 'My Plugin',
      version: 'not-semver',
      description: 'A great plugin'
    })
    expect(results.some((r) => r.message.includes('not valid semver'))).toBe(
      true
    )
  })

  it('warns when name contains "obsidian"', () => {
    const results = validatePluginManifest({
      id: 'my-plugin',
      name: 'Obsidian Helper',
      version: '1.0.0',
      description: 'A great plugin for doing things'
    })
    expect(
      results.some(
        (r) => r.severity === 'warning' && r.message.includes('obsidian')
      )
    ).toBe(true)
  })

  it('warns when name contains "plugin"', () => {
    const results = validatePluginManifest({
      id: 'my-plugin',
      name: 'Helper Plugin',
      version: '1.0.0',
      description: 'A great plugin for doing things'
    })
    expect(
      results.some(
        (r) => r.severity === 'warning' && r.message.includes('plugin')
      )
    ).toBe(true)
  })

  it('warns on short description', () => {
    const results = validatePluginManifest({
      id: 'my-plugin',
      name: 'My Tool',
      version: '1.0.0',
      description: 'Short'
    })
    expect(
      results.some(
        (r) => r.severity === 'warning' && r.message.includes('too short')
      )
    ).toBe(true)
  })

  it('errors on invalid authorUrl', () => {
    const results = validatePluginManifest({
      id: 'my-plugin',
      name: 'My Tool',
      version: '1.0.0',
      description: 'A great plugin for doing things',
      authorUrl: 'not-a-url'
    })
    expect(
      results.some(
        (r) => r.severity === 'error' && r.message.includes('authorUrl')
      )
    ).toBe(true)
  })

  it('validates object fundingUrl entries', () => {
    const results = validatePluginManifest({
      id: 'my-plugin',
      name: 'My Tool',
      version: '1.0.0',
      description: 'A great plugin for doing things',
      fundingUrl: { 'Buy Me a Coffee': 'not-a-url' }
    })
    expect(results.some((r) => r.message.includes('fundingUrl'))).toBe(true)
  })
})

describe('validateThemeManifest', () => {
  it('returns no errors for valid manifest', () => {
    const results = validateThemeManifest({
      name: 'My Theme',
      version: '1.0.0'
    })
    expect(results.filter((r) => r.severity === 'error')).toHaveLength(0)
  })

  it('errors on missing name', () => {
    const results = validateThemeManifest({ version: '1.0.0' })
    expect(results.some((r) => r.message.includes('name'))).toBe(true)
  })

  it('errors on missing version', () => {
    const results = validateThemeManifest({ name: 'My Theme' })
    expect(results.some((r) => r.message.includes('version'))).toBe(true)
  })

  it('errors on invalid semver version', () => {
    const results = validateThemeManifest({
      name: 'My Theme',
      version: 'bad'
    })
    expect(results.some((r) => r.message.includes('not valid semver'))).toBe(
      true
    )
  })
})

describe('validateVersionsJson', () => {
  it('returns empty when versions.json does not exist', () => {
    const dir = createTempDir()
    expect(validateVersionsJson(dir)).toHaveLength(0)
    fs.rmSync(dir, { recursive: true })
  })

  it('returns error for invalid JSON', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, 'versions.json'), 'not json')
    const results = validateVersionsJson(dir)
    expect(results.some((r) => r.message.includes('not valid JSON'))).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('returns error when versions.json is an array', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, 'versions.json'), '[]')
    const results = validateVersionsJson(dir)
    expect(results.some((r) => r.message.includes('JSON object'))).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('returns no warnings for valid versions.json', () => {
    const dir = createTempDir()
    fs.writeFileSync(
      path.join(dir, 'versions.json'),
      JSON.stringify({ '1.0.0': '0.15.0', '1.1.0': '0.16.0' })
    )
    expect(validateVersionsJson(dir)).toHaveLength(0)
    fs.rmSync(dir, { recursive: true })
  })

  it('warns on invalid semver keys', () => {
    const dir = createTempDir()
    fs.writeFileSync(
      path.join(dir, 'versions.json'),
      JSON.stringify({ latest: '0.15.0' })
    )
    const results = validateVersionsJson(dir)
    expect(results.some((r) => r.message.includes('"latest"'))).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })
})

describe('validateManifest', () => {
  it('errors when manifest.json is missing', () => {
    const dir = createTempDir()
    const results = validateManifest(dir, 'plugin')
    expect(results.some((r) => r.message.includes('not found'))).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('validates plugin manifest end-to-end', () => {
    const dir = createTempDir()
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: 'A sufficiently long description for testing'
      })
    )
    const results = validateManifest(dir, 'plugin')
    expect(results.filter((r) => r.severity === 'error')).toHaveLength(0)
    fs.rmSync(dir, { recursive: true })
  })

  it('validates theme manifest end-to-end', () => {
    const dir = createTempDir()
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ name: 'Test Theme', version: '1.0.0' })
    )
    const results = validateManifest(dir, 'theme')
    expect(results.filter((r) => r.severity === 'error')).toHaveLength(0)
    fs.rmSync(dir, { recursive: true })
  })
})
