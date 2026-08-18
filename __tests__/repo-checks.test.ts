import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { checkLicense, checkReadme } from '../src/repo-checks.js'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-test-'))
}

describe('checkLicense', () => {
  it('errors when no LICENSE file exists', () => {
    const dir = createTempDir()
    const results = checkLicense(dir)
    expect(results.some((r) => r.severity === 'error')).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('passes when LICENSE file exists', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'MIT License...')
    const results = checkLicense(dir)
    expect(results.filter((r) => r.severity === 'error')).toHaveLength(0)
    fs.rmSync(dir, { recursive: true })
  })

  it('passes with LICENSE.md', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, 'LICENSE.md'), '# MIT License')
    const results = checkLicense(dir)
    expect(results.filter((r) => r.severity === 'error')).toHaveLength(0)
    fs.rmSync(dir, { recursive: true })
  })

  it('warns when package.json has non-OSI license', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'Some license text')
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ license: 'WTFPL' })
    )
    const results = checkLicense(dir)
    expect(
      results.some((r) => r.severity === 'warning' && r.message.includes('OSI'))
    ).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('does not warn for MIT license', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'MIT License')
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ license: 'MIT' })
    )
    const results = checkLicense(dir)
    expect(results.filter((r) => r.severity === 'warning')).toHaveLength(0)
    fs.rmSync(dir, { recursive: true })
  })
})

describe('checkReadme', () => {
  it('errors when no README exists', () => {
    const dir = createTempDir()
    const results = checkReadme(dir)
    expect(results.some((r) => r.severity === 'error')).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('errors when README is empty', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, 'README.md'), '')
    const results = checkReadme(dir)
    expect(
      results.some((r) => r.severity === 'error' && r.message.includes('empty'))
    ).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('warns when README is very short', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, 'README.md'), 'Hello world')
    const results = checkReadme(dir)
    expect(
      results.some(
        (r) => r.severity === 'warning' && r.message.includes('short')
      )
    ).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('passes for README with sufficient content', () => {
    const dir = createTempDir()
    fs.writeFileSync(
      path.join(dir, 'README.md'),
      'This is a sufficiently long README file with enough content to pass the validation check.'
    )
    const results = checkReadme(dir)
    expect(results).toHaveLength(0)
    fs.rmSync(dir, { recursive: true })
  })
})
