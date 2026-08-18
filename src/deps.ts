import * as fs from 'node:fs'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

export function hasPackageJson(workspacePath: string): boolean {
  return fs.existsSync(path.join(workspacePath, 'package.json'))
}

export async function ensureUserDeps(workspacePath: string): Promise<boolean> {
  if (!hasPackageJson(workspacePath)) return true

  if (fs.existsSync(path.join(workspacePath, 'node_modules'))) return true

  core.info('Installing user dependencies for type resolution...')
  const hasLockfile = fs.existsSync(
    path.join(workspacePath, 'package-lock.json')
  )
  const installCmd = hasLockfile ? 'npm ci' : 'npm install'
  const exitCode = await exec.exec(installCmd, [], {
    cwd: workspacePath,
    ignoreReturnCode: true
  })

  return exitCode === 0
}
