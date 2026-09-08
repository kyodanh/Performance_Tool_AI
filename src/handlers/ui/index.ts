import { ipcMain, Menu, nativeTheme, shell } from 'electron'
import log from 'electron-log/main'
import invariant from 'tiny-invariant'

import { INVALID_FILENAME_CHARS } from '@/constants/files'
import {
  getRecordingsPath,
  getGeneratorsPath,
  getScriptsPath,
  TEMP_SCRIPT_SUFFIX,
  getDataFilesPath,
  getBrowserTestsPath,
} from '@/constants/workspace'
import { getStudioFileFromPath } from '@/main/file'
import { StudioFile } from '@/types'
import { getBrowserPath } from '@/utils/browser'
import { reportNewIssue } from '@/utils/bugReport'
import { browserWindowFromEvent, sendToast } from '@/utils/electron'
import { exists, readdir, rename } from '@/utils/fs'
import { RunStats } from '@/utils/k6/stats'
import * as path from '@/utils/path'

import { exportReport } from './report'
import {
  deleteRunResults,
  listRunResults,
  readRunResult,
  saveRunResult,
} from './results'
import { EditAction, ExportReportPayload, MenuState, UIHandler } from './types'

export function initialize() {
  ipcMain.on(UIHandler.ToggleTheme, () => {
    console.info(`${UIHandler.ToggleTheme} event received`)
    nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? 'light' : 'dark'
  })

  ipcMain.handle(UIHandler.DetectBrowser, async () => {
    console.info(`${UIHandler.DetectBrowser} event received`)
    try {
      const browserPath = await getBrowserPath(
        k6StudioState.appSettings.recorder
      )
      return browserPath !== ''
    } catch {
      log.error('Failed to find browser executable')
    }

    return false
  })

  ipcMain.on(UIHandler.NativeEdit, (event, action: EditAction) => {
    if (action === 'undo') {
      event.sender.undo()
      return
    }

    event.sender.redo()
  })

  ipcMain.handle(
    UIHandler.ExportReport,
    async (event, payload: ExportReportPayload) => {
      console.info(`${UIHandler.ExportReport} event received`)

      return exportReport(browserWindowFromEvent(event), payload)
    }
  )

  ipcMain.handle(UIHandler.ListResults, async () => {
    console.info(`${UIHandler.ListResults} event received`)

    return listRunResults()
  })

  ipcMain.handle(
    UIHandler.SaveResult,
    async (_, testName: string, stats: RunStats, label?: string) => {
      console.info(`${UIHandler.SaveResult} event received`)

      const filePath = await saveRunResult(testName, stats, label)

      return filePath === null ? null : path.basename(filePath)
    }
  )

  ipcMain.handle(UIHandler.DeleteResults, async (_, ids: string[]) => {
    console.info(`${UIHandler.DeleteResults} event received`)

    return deleteRunResults(ids)
  })

  ipcMain.handle(UIHandler.ReadResult, async (_, id: string) => {
    console.info(`${UIHandler.ReadResult} event received`)

    return readRunResult(id)
  })

  ipcMain.handle(UIHandler.TrashFile, async (_, file: StudioFile) => {
    console.info(`${UIHandler.TrashFile} event received`)

    return shell.trashItem(path.toNativePath(file.path))
  })

  ipcMain.on(UIHandler.OpenFolder, (_, file: StudioFile) => {
    console.info(`${UIHandler.OpenFolder} event received`)

    return shell.showItemInFolder(path.toNativePath(file.path))
  })

  ipcMain.handle(UIHandler.OpenFileInDefaultApp, (_, file: StudioFile) => {
    console.info(`${UIHandler.OpenFileInDefaultApp} event received`)

    return shell.openPath(path.toNativePath(file.path))
  })

  ipcMain.handle(UIHandler.GetFiles, async () => {
    console.info(`${UIHandler.GetFiles} event received`)
    const recordings = (await readdir(getRecordingsPath()))
      .filter((f) => f.isFile())
      .map((f) => getStudioFileFromPath(path.join(getRecordingsPath(), f.name)))
      .filter((f) => typeof f !== 'undefined')

    const generators = (await readdir(getGeneratorsPath()))
      .filter((f) => f.isFile())
      .map((f) => getStudioFileFromPath(path.join(getGeneratorsPath(), f.name)))
      .filter((f) => typeof f !== 'undefined')

    const browserTests = (await readdir(getBrowserTestsPath()))
      .filter((f) => f.isFile())
      .map((f) =>
        getStudioFileFromPath(path.join(getBrowserTestsPath(), f.name))
      )
      .filter((f) => typeof f !== 'undefined')

    const scripts = (await readdir(getScriptsPath()))
      .filter((f) => f.isFile() && !f.name.endsWith(TEMP_SCRIPT_SUFFIX))
      .map((f) => getStudioFileFromPath(path.join(getScriptsPath(), f.name)))
      .filter((f) => typeof f !== 'undefined')

    const dataFiles = (await readdir(getDataFilesPath()))
      .filter((f) => f.isFile())
      .map((f) => getStudioFileFromPath(path.join(getDataFilesPath(), f.name)))
      .filter((f) => typeof f !== 'undefined')

    return {
      recordings,
      generators,
      browserTests,
      scripts,
      dataFiles,
    }
  })

  ipcMain.handle(UIHandler.ReportIssue, () => {
    console.info(`${UIHandler.ReportIssue} event received`)
    return reportNewIssue()
  })

  ipcMain.handle(
    UIHandler.RenameFile,
    async (e, file: StudioFile, newFileName: string) => {
      console.info(`${UIHandler.RenameFile} event received`)
      const browserWindow = browserWindowFromEvent(e)

      try {
        invariant(
          !INVALID_FILENAME_CHARS.test(newFileName),
          'Invalid file name'
        )

        const newPath = path.join(path.dirname(file.path), newFileName)

        if (await exists(newPath)) {
          throw new Error(`File with name ${newFileName} already exists`)
        }

        await rename(file.path, newPath)
      } catch (e) {
        log.error(e)

        sendToast(browserWindow.webContents, {
          title: 'Failed to rename file',
          description: e instanceof Error ? e.message : undefined,
          status: 'error',
        })

        throw e
      }
    }
  )

  ipcMain.on(UIHandler.SetMenuState, (_, state: MenuState) => {
    console.info(`${UIHandler.SetMenuState} event received`)

    const menu = Menu.getApplicationMenu()

    if (!menu) {
      return
    }

    for (const [item, enabled] of Object.entries(state)) {
      const menuItem = menu.getMenuItemById(item)

      if (!menuItem) {
        console.error(`Menu item with id ${item} not found`)

        continue
      }

      menuItem.enabled = enabled
    }
  })
}
