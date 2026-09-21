import { BrowserWindow } from 'electron'
import log from 'electron-log/main'

import { getDefaultWorkspaceRoot } from '@/constants/workspace'
import { showMessageBox, showOpenDialog, showSaveDialog } from '@/utils/dialog'
import { exists } from '@/utils/fs'
import * as path from '@/utils/path'
import { createWorkspaceFolders } from '@/utils/workspace'

import { saveSettings } from './settings'
import { createWindow, getWindowRoot } from './window'

/**
 * A project is opened in a window of its own: the open tabs, the file watcher
 * and any running recording all hold paths derived from the root, so a window
 * keeps the root it was created with. The setting is written too, so the next
 * launch starts on the project last opened.
 */
async function openProjectWindow(root: string) {
  const isDefault = path.equal(root, getDefaultWorkspaceRoot())
  const workspace = { root: isDefault ? '' : root }

  // A project opened for the first time may be missing some of the folders the
  // handlers read from; lay out whatever is not there yet.
  await createWorkspaceFolders(root)

  // The in-memory copy too, not just the file: `trackWindowState` writes the
  // whole of `appSettings` back on the next move or resize and would otherwise
  // restore the root we just replaced.
  k6StudioState.appSettings.workspace = workspace

  await saveSettings({ workspace })

  await createWindow(root)
}

export async function createProject(browserWindow: BrowserWindow) {
  const { filePath } = await showSaveDialog(browserWindow, {
    title: 'New project',
    // Alongside the current project rather than inside it — projects are
    // siblings, never nested.
    defaultPath: path.join(
      path.dirname(getWindowRoot(browserWindow.id)),
      'New project'
    ),
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

  await openProjectWindow(filePath)
}

export async function openProject(browserWindow: BrowserWindow) {
  const {
    filePaths: [folder],
  } = await showOpenDialog(browserWindow, {
    title: 'Open project',
    defaultPath: path.dirname(getWindowRoot(browserWindow.id)),
    buttonLabel: 'Open',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (!folder) {
    return
  }

  // A folder with none of the expected subfolders is more likely a mis-click
  // than a project — say so before opening an empty workspace.
  if (!(await exists(path.join(folder, 'Generators')))) {
    const { response } = await showMessageBox(browserWindow, {
      type: 'warning',
      message: `"${path.basename(folder)}" is not a LoadPilot project`,
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

  await openProjectWindow(folder)
}
