import { app, ipcMain, FileFilter } from 'electron'

import {
  K6_BROWSER_TEST_FILE_EXTENSION,
  K6_GENERATOR_FILE_EXTENSION,
} from '@/constants/files'
import {
  getBrowserTestsPath,
  getGeneratorsPath,
  getProjectPath,
  getRecordingsPath,
  getScriptsPath,
} from '@/constants/workspace'
import { getStudioFileFromPath } from '@/main/file'
import { getTempScriptName } from '@/main/script'
import { trackEvent } from '@/services/usageTracking'
import { UsageEventName } from '@/services/usageTracking/types'
import { showOpenDialog, showSaveDialog } from '@/utils/dialog'
import { browserWindowFromEvent } from '@/utils/electron'
import { exists, readFile, writeFile } from '@/utils/fs'
import * as path from '@/utils/path'
import { isExternalScript } from '@/utils/workspace'

import { deserializeContent, serializeContent } from './serialization'
import { FileContent, FileLocation, FsHandler, StorageLocation } from './types'

function getDefaultPath(location: StorageLocation) {
  if (location.type === 'file') {
    return location.path
  }

  if (path.isAbsolute(location.hint)) {
    return location.hint
  }

  switch (path.extname(location.hint)) {
    case '.har':
      return path.join(getRecordingsPath(), location.hint)

    case K6_GENERATOR_FILE_EXTENSION:
      return path.join(getGeneratorsPath(), location.hint)

    case K6_BROWSER_TEST_FILE_EXTENSION:
      return path.join(getBrowserTestsPath(), location.hint)

    case '.js':
    case '.ts':
      return path.join(getScriptsPath(), location.hint)

    default:
      return getProjectPath()
  }
}

export function initialize() {
  ipcMain.handle(FsHandler.GetTempScriptPath, () => {
    return path.join(app.getPath('temp'), getTempScriptName())
  })

  ipcMain.handle(
    FsHandler.ShowOpenDialog,
    async (event, filters: FileFilter[]) => {
      const browserWindow = browserWindowFromEvent(event)

      const result = await showOpenDialog(browserWindow, {
        properties: ['openFile'],
        filters,
      })

      if (result.canceled || !result.filePaths[0]) {
        return undefined
      }

      return result.filePaths[0]
    }
  )

  ipcMain.handle(
    FsHandler.ShowSaveAsDialog,
    async (event, location: StorageLocation, filters: FileFilter[]) => {
      const browserWindow = browserWindowFromEvent(event)

      const result = await showSaveDialog(browserWindow, {
        defaultPath: getDefaultPath(location),
        filters,
      })

      if (result.canceled || !result.filePath) {
        return
      }

      return { type: 'file' as const, path: result.filePath }
    }
  )

  ipcMain.handle(
    FsHandler.SaveFile,
    async (_, location: FileLocation, content: FileContent) => {
      const serializedContent = serializeContent(location.path, content)

      await writeFile(location.path, serializedContent)

      switch (content.type) {
        case 'generator':
          trackEvent({
            event: UsageEventName.GeneratorUpdated,
            payload: {
              rules: {
                correlation: content.data.rules.filter(
                  (rule) => rule.type === 'correlation'
                ).length,
                parameterization: content.data.rules.filter(
                  (rule) => rule.type === 'parameterization'
                ).length,
                verification: content.data.rules.filter(
                  (rule) => rule.type === 'verification'
                ).length,
                customCode: content.data.rules.filter(
                  (rule) => rule.type === 'customCode'
                ).length,
                disabled: content.data.rules.filter((rule) => !rule.enabled)
                  .length,
              },
            },
          })
          break

        case 'browser-test':
          trackEvent({
            event: UsageEventName.BrowserTestUpdated,
          })
          break

        case 'script':
          trackEvent({
            event: UsageEventName.ScriptExported,
            payload: {
              isExternal: isExternalScript(location.path),
            },
          })
          break
      }

      return location
    }
  )

  ipcMain.handle(
    FsHandler.OpenFile,
    async (_, filePath: string): Promise<FileContent> => {
      const file = getStudioFileFromPath(filePath)

      if (!file) {
        return { type: 'unsupported', isExternal: true }
      }

      const raw = await readFile(filePath, { encoding: 'utf-8', flag: 'r' })

      return deserializeContent(filePath, raw, file.type)
    }
  )

  ipcMain.handle(
    FsHandler.Exists,
    async (_, filePath: string): Promise<boolean> => {
      return exists(filePath)
    }
  )
}
