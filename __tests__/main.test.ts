import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => ({
  exec: jest.fn().mockResolvedValue(0)
}))

const { run } = await import('../src/main.js')

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-test-'))
}

describe('main.ts', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
    process.env.GITHUB_WORKSPACE = tempDir

    core.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        type: 'plugin',
        mode: 'pr',
        build: 'false',
        lint: 'false',
        'scanner-lint': 'false',
        'node-version': '24'
      }
      return inputs[name] ?? ''
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
    fs.rmSync(tempDir, { recursive: true, force: true })
    delete process.env.GITHUB_WORKSPACE
  })

  it('fails when manifest.json is missing', async () => {
    fs.writeFileSync(path.join(tempDir, 'LICENSE'), 'MIT')
    fs.writeFileSync(
      path.join(tempDir, 'README.md'),
      'This is a valid readme with enough text to pass.'
    )

    await run()

    expect(core.setFailed).toHaveBeenCalled()
  })

  it('passes with valid plugin structure', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify({
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: 'A sufficiently long description'
      })
    )
    fs.writeFileSync(path.join(tempDir, 'LICENSE'), 'MIT')
    fs.writeFileSync(
      path.join(tempDir, 'README.md'),
      'This is a valid readme with enough text to pass.'
    )

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('type', 'plugin')
    expect(core.setOutput).toHaveBeenCalledWith('validation-passed', 'true')
  })

  it('fails with invalid type input', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'type') return 'invalid'
      return ''
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid type input')
    )
  })

  it('fails with invalid mode input', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'mode') return 'invalid'
      if (name === 'type') return 'plugin'
      return ''
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid mode input')
    )
  })

  it('fails when node version is below minimum', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'node-version') return '18'
      if (name === 'type') return 'plugin'
      return ''
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('below the minimum')
    )
  })
})
