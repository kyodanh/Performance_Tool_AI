import {
  getBrowserTestsPath,
  getDataFilesPath,
  getGeneratorsPath,
  getProjectPath,
  getRecordingsPath,
  getScriptsPath,
  PROJECT_FOLDERS,
  TEMP_PATH,
} from '../constants/workspace'

import { mkdir } from './fs'
import * as path from './path'

/**
 * Lays out a project at `root`. Used both for the workspace being opened and
 * for a brand new project the user creates from the File menu, so the two can
 * never drift apart.
 */
export async function createWorkspaceFolders(root: string) {
  await mkdir(root, { recursive: true })

  for (const folder of Object.values(PROJECT_FOLDERS)) {
    await mkdir(path.join(root, folder), { recursive: true })
  }
}

/**
 * Resolved on every call, not once at import: the workspace root is only known
 * after the settings file has been read, which happens later than module load.
 */
export const setupProjectStructure = async () => {
  await createWorkspaceFolders(getProjectPath())
  await mkdir(TEMP_PATH, { recursive: true })
}

export function isExternalScript(scriptPath: string) {
  return !path.equal(path.dirname(scriptPath), getScriptsPath())
}

export function isExternalRecording(recordingPath: string) {
  return !path.equal(path.dirname(recordingPath), getRecordingsPath())
}

export function isExternalGenerator(filePath: string) {
  return !path.equal(path.dirname(filePath), getGeneratorsPath())
}

export function isExternalBrowserTest(filePath: string) {
  return !path.equal(path.dirname(filePath), getBrowserTestsPath())
}

export function isExternalDataFile(filePath: string) {
  return !path.equal(path.dirname(filePath), getDataFilesPath())
}
