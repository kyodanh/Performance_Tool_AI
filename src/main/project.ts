import { app, BrowserWindow } from 'electron'
import log from 'electron-log/main'

import { getDefaultWorkspaceRoot, getProjectPath } from '@/constants/workspace'
import { showMessageBox, showOpenDialog, showSaveDialog } from '@/utils/dialog'
import { exists } from '@/utils/fs'
import * as path from '@/utils/path'
import { createWorkspaceFolders } from '@/utils/workspace'

import { saveSettings } from './settings'

/**
 * Switching project cannot be done in place: the file watcher, every open tab
 * and any running recording hold paths derived from the current root. The
 * setting is written now and the new root is picked up on the next launch.
 */
async function switchToProject(browserWindow: BrowserWindow, root: string) {
  const isDefault = path.equal(root, getDefaultWorkspaceRoot())

  await saveSettings({ workspace: { root: isDefault ? '' : root } })

  const { response } = await showMessageBox(browserWindow, {
    type: 'question',
    message: `Open "${path.basename(root)}"?`,
    detail:
      'k6 Studio needs to restart to open the project. Unsaved changes will be lost.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })

  if (response !== 0) {
    return
  }

  // `exit` rather than `quit`: the unsaved-changes guard on window close must
  // not be able to cancel a restart the user has just confirmed.
  app.relaunch()
  app.exit(0)
}

export async function createProject(browserWindow: BrowserWindow) {
  const { filePath } = await showSaveDialog(browserWindow, {
    title: 'New project',
    // Alongside the current project rather than inside it — projects are
    // siblings, never nested.
    defaultPath: path.join(path.dirname(getProjectPath()), 'New project'),
    buttonLabel: 'Create',
    nameFieldLabel: 'Project name',
    properties: ['createDirectory'],
  })

  if (!filePath) {
    return
  }

  try {
    await createWorkspaceFolders(filePath)
  } catch (error) {
    log.error(error)

    await showMessageBox(browserWindow, {
      type: 'error',
      message: 'Failed to create the project',
      detail: error instanceof Error ? error.message : String(error),
      buttons: ['OK'],
    })

    return
  }

  await switchToProject(browserWindow, filePath)
}

export async function openProject(browserWindow: BrowserWindow) {
  const {
    filePaths: [folder],
  } = await showOpenDialog(browserWindow, {
    title: 'Open project',
    defaultPath: path.dirname(getProjectPath()),
    buttonLabel: 'Open',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (!folder) {
    return
  }

  // A folder with none of the expected subfolders is more likely a mis-click
  // than a project — say so before restarting into an empty workspace.
  if (!(await exists(path.join(folder, 'Generators')))) {
    const { response } = await showMessageBox(browserWindow, {
      type: 'warning',
      message: `"${path.basename(folder)}" is not a k6 Studio project`,
      detail:
        'It has no Generators folder. Opening it creates the project folders and starts with an empty workspace.',
      buttons: ['Open anyway', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    })

    if (response !== 0) {
      return
    }
  }

  await switchToProject(browserWindow, folder)
}
