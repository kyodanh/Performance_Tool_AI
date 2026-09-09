import { BrowserWindow } from 'electron'

import {
  getRecordingsPath,
  getGeneratorsPath,
  getScriptsPath,
  getDataFilesPath,
  TEMP_SCRIPT_SUFFIX,
  getBrowserTestsPath,
  runInProject,
} from '@/constants/workspace'
import { UIHandler } from '@/handlers/ui/types'
import { FSWatcher, watch } from '@/utils/fs'

import { getStudioFileFromPath } from './file'

/**
 * One watcher per window, not per app: two windows can sit on two projects, and
 * a file appearing in one must not show up in the other's sidebar.
 */
const watchers = new Map<number, FSWatcher>()

export function configureWatcher(browserWindow: BrowserWindow, root: string) {
  const watcher = runInProject(root, () =>
    watch(
      [
        getRecordingsPath(),
        getGeneratorsPath(),
        getBrowserTestsPath(),
        getScriptsPath(),
        getDataFilesPath(),
      ],
      {
        ignoreInitial: true,
      }
    )
  )

  watchers.set(browserWindow.id, watcher)

  const send = (channel: string, filePath: string) => {
    const file = getStudioFileFromPath(filePath)

    if (!file || filePath.endsWith(TEMP_SCRIPT_SUFFIX)) {
      return
    }

    if (browserWindow.isDestroyed()) {
      return
    }

    browserWindow.webContents.send(channel, file)
  }

  watcher.on('add', (filePath) => send(UIHandler.AddFile, filePath))
  watcher.on('unlink', (filePath) => send(UIHandler.RemoveFile, filePath))
}

export async function closeWatcher(windowId: number) {
  const watcher = watchers.get(windowId)

  if (!watcher) {
    return
  }

  watchers.delete(windowId)

  // stop watching files to avoid crash on exit
  await watcher.close()
}

export async function closeWatchers() {
  await Promise.all([...watchers.keys()].map(closeWatcher))
}
