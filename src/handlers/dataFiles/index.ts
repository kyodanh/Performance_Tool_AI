import { IpcMainInvokeEvent, OpenDialogOptions, ipcMain } from 'electron'
import invariant from 'tiny-invariant'

import { MAX_DATA_FILE_SIZE } from '@/constants/files'
import { getDataFilesPath } from '@/constants/workspace'
import { showMessageBox, showOpenDialog } from '@/utils/dialog'
import { browserWindowFromEvent } from '@/utils/electron'
import { copyFile, exists, stat } from '@/utils/fs'
import * as path from '@/utils/path'

import { DataFileHandler } from './types'

export function initialize() {
  ipcMain.handle(DataFileHandler.Import, (event) =>
    importIntoDataFolder(event, {
      message: 'Import data file',
      filters: [{ name: 'Supported data files', extensions: ['csv', 'json'] }],
    })
  )

  ipcMain.handle(DataFileHandler.ImportUpload, (event) =>
    importIntoDataFolder(event, { message: 'Choose file to upload' })
  )

  ipcMain.handle(
    DataFileHandler.FindUpload,
    async (_event, fileName: string) => {
      // The name comes from an imported script: keep it inside Data.
      const filePath = path.join(getDataFilesPath(), path.basename(fileName))

      return fileName !== '' && (await exists(filePath)) ? filePath : null
    }
  )

  ipcMain.handle(DataFileHandler.Open, async (event) => {
    const browserWindow = browserWindowFromEvent(event)

    const dialogResult = await showOpenDialog(browserWindow, {
      message: 'Open data file',
      properties: ['openFile'],
      filters: [{ name: 'Supported data files', extensions: ['csv', 'json'] }],
    })

    const filePath = dialogResult.filePaths[0]

    if (dialogResult.canceled || !filePath) {
      return
    }

    return filePath
  })
}

/** Copies a picked file into the project's Data folder and returns its path. */
async function importIntoDataFolder(
  event: IpcMainInvokeEvent,
  options: Pick<OpenDialogOptions, 'message' | 'filters'>
) {
  const browserWindow = browserWindowFromEvent(event)

  const dialogResult = await showOpenDialog(browserWindow, {
    ...options,
    properties: ['openFile'],
  })

  const filePath = dialogResult.filePaths[0]

  if (dialogResult.canceled || !filePath) {
    return
  }

  const { size } = await stat(filePath)
  invariant(size <= MAX_DATA_FILE_SIZE, 'File is too large')

  const destinationPath = path.join(getDataFilesPath(), path.basename(filePath))

  if (await exists(destinationPath)) {
    const { response } = await showMessageBox(browserWindow, {
      type: 'question',
      buttons: ['Cancel', 'Overwrite'],
      defaultId: 0,
      cancelId: 0,
      message: `"${path.basename(filePath)}" already exists. Do you want to overwrite it?`,
    })

    if (response === 0) {
      return
    }
  }

  await copyFile(filePath, destinationPath)

  return destinationPath
}
