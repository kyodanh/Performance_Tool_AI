import { app } from 'electron'

import * as path from '@/utils/path'

/**
 * The workspace root is settable so the user can keep several projects side by
 * side — `~/k6-projects/Elearning`, `~/k6-projects/Pro360` — each with its own
 * Generators / Recordings / Scripts / Data / Browser / Results folders.
 *
 * It is read at startup from `settings.workspace.root` and never changes while
 * the app runs: the file watcher, the open tabs and the recording session all
 * hold on to paths derived from it, so switching would leave them pointing at
 * the previous project. Changing the setting asks for a restart instead.
 */
let activeRoot: string | null = null

export function getDefaultWorkspaceRoot() {
  return path.join(app.getPath('documents'), 'k6-studio')
}

export function setActiveWorkspaceRoot(root: string) {
  activeRoot = root === '' ? null : path.normalize(root)
}

export function getProjectPath() {
  return activeRoot ?? getDefaultWorkspaceRoot()
}

/**
 * The subfolders a project root is made of. Named once here so creating a new
 * project and resolving a path in an existing one can never disagree.
 */
export const PROJECT_FOLDERS = {
  recordings: 'Recordings',
  generators: 'Generators',
  scripts: 'Scripts',
  data: 'Data',
  browser: 'Browser',
  results: 'Results',
} as const

export function getRecordingsPath() {
  return path.join(getProjectPath(), PROJECT_FOLDERS.recordings)
}

export function getGeneratorsPath() {
  return path.join(getProjectPath(), PROJECT_FOLDERS.generators)
}

export function getBrowserTestsPath() {
  return path.join(getProjectPath(), PROJECT_FOLDERS.browser)
}

export function getScriptsPath() {
  return path.join(getProjectPath(), PROJECT_FOLDERS.scripts)
}

export function getDataFilesPath() {
  return path.join(getProjectPath(), PROJECT_FOLDERS.data)
}

export function getResultsPath() {
  return path.join(getProjectPath(), PROJECT_FOLDERS.results)
}

export const TEMP_PATH = path.join(app.getPath('temp'), 'k6-studio')
export const TEMP_SCRIPT_SUFFIX = '__tmp-k6studio__.js'
export const TEMP_K6_ARCHIVE_PATH = path.join(TEMP_PATH, 'k6-studio-test.tar')
export const TEMP_K6_LOAD_ARCHIVE_PATH = path.join(
  TEMP_PATH,
  'k6-studio-load-test.tar'
)
