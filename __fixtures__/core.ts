import type * as core from '@actions/core'
import { jest } from '@jest/globals'

export const debug = jest.fn<typeof core.debug>()
export const error = jest.fn<typeof core.error>()
export const info = jest.fn<typeof core.info>()
export const getInput = jest.fn<typeof core.getInput>()
export const setOutput = jest.fn<typeof core.setOutput>()
export const setFailed = jest.fn<typeof core.setFailed>()
export const warning = jest.fn<typeof core.warning>()
export const startGroup = jest.fn<typeof core.startGroup>()
export const endGroup = jest.fn<typeof core.endGroup>()
export const getIDToken = jest.fn<typeof core.getIDToken>()
export const getBooleanInput = jest.fn<typeof core.getBooleanInput>()
export const getMultilineInput = jest.fn<typeof core.getMultilineInput>()
export const exportVariable = jest.fn<typeof core.exportVariable>()
export const setSecret = jest.fn<typeof core.setSecret>()
export const addPath = jest.fn<typeof core.addPath>()
export const setCommandEcho = jest.fn<typeof core.setCommandEcho>()
export const isDebug = jest.fn<typeof core.isDebug>().mockReturnValue(false)
export const notice = jest.fn<typeof core.notice>()
export const saveState = jest.fn<typeof core.saveState>()
export const getState = jest.fn<typeof core.getState>()
export const group = jest.fn<typeof core.group>()
export const summary = {
  addRaw: jest.fn().mockReturnThis(),
  addHeading: jest.fn().mockReturnThis(),
  addTable: jest.fn().mockReturnThis(),
  addList: jest.fn().mockReturnThis(),
  write: jest.fn().mockResolvedValue(undefined)
}
