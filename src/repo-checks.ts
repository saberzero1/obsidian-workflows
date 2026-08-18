import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ValidationResult } from './types.js'

const OSI_APPROVED_SPDX = new Set([
  '0BSD',
  'AAL',
  'AFL-3.0',
  'AGPL-1.0-only',
  'AGPL-1.0-or-later',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'Apache-1.1',
  'Apache-2.0',
  'APSL-1.0',
  'APSL-1.1',
  'APSL-2.0',
  'Artistic-1.0',
  'Artistic-2.0',
  'BlueOak-1.0.0',
  'BSD-1-Clause',
  'BSD-2-Clause',
  'BSD-2-Clause-Patent',
  'BSD-3-Clause',
  'BSD-3-Clause-LBNL',
  'BSL-1.0',
  'CAL-1.0',
  'CAL-1.0-Combined-Work-Exception',
  'CATOSL-1.1',
  'CERN-OHL-P-2.0',
  'CERN-OHL-S-2.0',
  'CERN-OHL-W-2.0',
  'CNRI-Python',
  'CPAL-1.0',
  'CUA-OPL-1.0',
  'ECL-1.0',
  'ECL-2.0',
  'EFL-1.0',
  'EFL-2.0',
  'Entessa',
  'EPL-1.0',
  'EPL-2.0',
  'EUDatagrid',
  'EUPL-1.1',
  'EUPL-1.2',
  'Fair',
  'Frameworx-1.0',
  'FSFAP',
  'FTLL',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'HPND',
  'Intel',
  'IPA',
  'IPL-1.0',
  'ISC',
  'JAM',
  'JSON',
  'LAL-1.2',
  'LAL-1.3',
  'LGPL-2.0-only',
  'LGPL-2.0-or-later',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'LiLiQ-P-1.1',
  'LiLiQ-R-1.1',
  'LiLiQ-Rplus-1.1',
  'LPL-1.0',
  'LPL-1.02',
  'LPPL-1.0',
  'LPPL-1.1',
  'LPPL-1.2',
  'LPPL-1.3a',
  'LPPL-1.3c',
  'MIT',
  'MIT-0',
  'Motosoto',
  'MPL-1.0',
  'MPL-1.1',
  'MPL-2.0',
  'MPL-2.0-no-copyleft-exception',
  'MS-PL',
  'MS-RL',
  'MulanPSL-2.0',
  'Multics',
  'NASA-1.3',
  'NCSA',
  'NGPL',
  'Nokia',
  'NPOSL-3.0',
  'NTP',
  'OCLC-2.0',
  'OFL-1.0',
  'OFL-1.1',
  'OFL-1.1-no-RFN',
  'OFL-1.1-RFN',
  'OGTSL',
  'OLDAP-2.8',
  'OSET-PL-2.1',
  'OSL-1.0',
  'OSL-1.1',
  'OSL-2.0',
  'OSL-2.1',
  'OSL-3.0',
  'PHP-3.0',
  'PHP-3.01',
  'PostgreSQL',
  'Python-2.0',
  'QPL-1.0',
  'RPL-1.1',
  'RPL-1.5',
  'RPSL-1.0',
  'RSCPL',
  'SimPL-2.0',
  'SISSL',
  'Sleepycat',
  'SPL-1.0',
  'UCL-1.0',
  'Unicode-3.0',
  'Unicode-DFS-2016',
  'Unlicense',
  'UPL-1.0',
  'VSL-1.0',
  'W3C',
  'Watcom-1.0',
  'Xnet',
  'Zlib',
  'ZPL-2.0',
  'ZPL-2.1'
])

const LICENSE_FILE_NAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENCE.txt',
  'license',
  'license.md',
  'license.txt'
]

function findLicenseFile(workspacePath: string): string | null {
  for (const name of LICENSE_FILE_NAMES) {
    const filePath = path.join(workspacePath, name)
    if (fs.existsSync(filePath)) return filePath
  }
  return null
}

function detectSpdxFromPackageJson(workspacePath: string): string | null {
  const pkgPath = path.join(workspacePath, 'package.json')
  if (!fs.existsSync(pkgPath)) return null

  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as Record<string, unknown>
    if (typeof pkg.license === 'string') return pkg.license
  } catch {
    /* intentionally empty — invalid package.json is handled by missing spdx */
  }
  return null
}

export function checkLicense(workspacePath: string): ValidationResult[] {
  const results: ValidationResult[] = []
  const licenseFile = findLicenseFile(workspacePath)

  if (!licenseFile) {
    results.push({
      message: 'No LICENSE file found in the repository root.',
      severity: 'error',
      check: 'license'
    })
    return results
  }

  const spdx = detectSpdxFromPackageJson(workspacePath)

  if (spdx && !OSI_APPROVED_SPDX.has(spdx)) {
    results.push({
      message: `License "${spdx}" in package.json is not an OSI-approved license.`,
      severity: 'warning',
      check: 'license'
    })
  }

  return results
}

const README_FILE_NAMES = [
  'README.md',
  'readme.md',
  'README.txt',
  'README',
  'Readme.md'
]

export function checkReadme(workspacePath: string): ValidationResult[] {
  const results: ValidationResult[] = []

  let readmePath: string | null = null
  for (const name of README_FILE_NAMES) {
    const candidate = path.join(workspacePath, name)
    if (fs.existsSync(candidate)) {
      readmePath = candidate
      break
    }
  }

  if (!readmePath) {
    results.push({
      message: 'No README file found in the repository root.',
      severity: 'error',
      check: 'readme'
    })
    return results
  }

  const content = fs.readFileSync(readmePath, 'utf-8').trim()

  if (content.length === 0) {
    results.push({
      message: 'README file is empty.',
      severity: 'error',
      check: 'readme'
    })
  } else if (content.length < 50) {
    results.push({
      message: `README is very short (${content.length} chars). Consider adding more documentation.`,
      severity: 'warning',
      check: 'readme'
    })
  }

  return results
}
