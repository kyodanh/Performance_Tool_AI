import { BrowserWindow, ipcMain } from 'electron'

import { pool } from '@/main/loadGenerator/pool'
import { startEnrollmentServer } from '@/main/loadGenerator/server'
import { LoadGenerator } from '@/types/loadGenerator'

import { EnrollmentDetails, LoadGeneratorHandler } from './types'

export function initialize() {
  // Generators arrive over HTTP rather than through a window, so the update goes
  // to every open window instead of replying to whoever asked last.
  pool.on('change', () => {
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      browserWindow.webContents.send(LoadGeneratorHandler.Changed, pool.list())
    }
  })

  ipcMain.handle(
    LoadGeneratorHandler.Enroll,
    async (): Promise<EnrollmentDetails> => {
      console.info(`${LoadGeneratorHandler.Enroll} event received`)

      const { url, key, expiresAt } = await startEnrollmentServer()
      const joiner = `${url}/lg/${key}`

      return {
        url,
        key,
        expiresAt,
        posixCommand: `curl -fsSL ${joiner} | sh`,
        // `irm | iex` needs no file on disk, so PowerShell's file-based
        // execution policy does not come into it.
        windowsCommand: `powershell -c "irm ${joiner}?os=windows|iex"`,
      }
    }
  )

  ipcMain.handle(LoadGeneratorHandler.List, (): LoadGenerator[] => {
    return pool.list()
  })

  ipcMain.on(LoadGeneratorHandler.Disconnect, (_event, id: string) => {
    pool.disconnect(id)
  })

  ipcMain.on(
    LoadGeneratorHandler.SetWeight,
    (_event, id: string, weight: number) => {
      pool.setWeight(id, weight)
    }
  )
}
