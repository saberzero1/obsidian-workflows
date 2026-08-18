import { getMinElectronVersion } from '../src/lint.js'

describe('getMinElectronVersion', () => {
  it('returns 39 (default) when minAppVersion is undefined', () => {
    expect(getMinElectronVersion(undefined)).toBe(39)
  })

  it('returns 39 for the latest mapped version', () => {
    expect(getMinElectronVersion('1.11.4')).toBe(39)
  })

  it('returns 37 for 1.9.12', () => {
    expect(getMinElectronVersion('1.9.12')).toBe(37)
  })

  it('returns 31 for 1.7.4', () => {
    expect(getMinElectronVersion('1.7.4')).toBe(31)
  })

  it('returns 30 for 1.6.5', () => {
    expect(getMinElectronVersion('1.6.5')).toBe(30)
  })

  it('returns 28 for a version between mappings (1.6.0)', () => {
    expect(getMinElectronVersion('1.6.0')).toBe(28)
  })

  it('returns 25 for the lowest mapped version', () => {
    expect(getMinElectronVersion('1.4.5')).toBe(25)
  })

  it('returns 25 for a version below all mappings', () => {
    expect(getMinElectronVersion('1.0.0')).toBe(25)
  })

  it('returns 39 for a version above all mappings', () => {
    expect(getMinElectronVersion('99.0.0')).toBe(39)
  })
})
