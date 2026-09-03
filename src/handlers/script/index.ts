import { ipcMain } from 'electron'
import log from 'electron-log/main'

import { SCRIPTS_PATH } from '@/constants/workspace'
import { waitForProxy } from '@/main/proxy'
import {
  analyzeScript,
  showScriptSelectDialog,
  runScript,
  runLoadTest,
} from '@/main/script'
import { trackEvent } from '@/services/usageTracking'
import { UsageEventName } from '@/services/usageTracking/types'
import { browserWindowFromEvent } from '@/utils/electron'
import { unlink, writeFile } from '@/utils/fs'
import { ArchiveError } from '@/utils/k6/client'
import { TestRun } from '@/utils/k6/testRun'
import * as path from '@/utils/path'
import { isExternalScript } from '@/utils/workspace'

import {
  RunLoadTestOptions,
  RunScriptFromGeneratorOptions,
  RunScriptOptions,
  ScriptHandler,
} from './types'

export function initialize() {
  let currentTestRun: TestRun | null = null

  /**
   * Only one run is tracked at a time, so starting a second without stopping
   * the first orphans it: it keeps loading the target with nothing left to stop
   * it from the UI.
   */
  async function stopCurrentTestRun() {
    const run = currentTestRun

    currentTestRun = null

    await run?.stop().catch((error) => {
      log.error('Failed to stop the test run', error)
    })
  }

  ipcMain.handle(ScriptHandler.Select, async (event) => {
    console.info(`${ScriptHandler.Select} event received`)
    const browserWindow = browserWindowFromEvent(event)
    const scriptPath = await showScriptSelectDialog(browserWindow)

    if (scriptPath) {
      trackEvent({
        event: UsageEventName.ScriptOpenedExternal,
      })
    }

    return scriptPath
  })

  ipcMain.handle(ScriptHandler.Analyze, async (_, scriptPath: string) => {
    console.info(`${ScriptHandler.Analyze} event received`)

    return analyzeScript(scriptPath)
  })

  ipcMain.handle(
    ScriptHandler.Run,
    async (event, { path: scriptPath, scenario }: RunScriptOptions) => {
      console.info(`${ScriptHandler.Run} event received`)

      const browserWindow = browserWindowFromEvent(event)

      try {
        await stopCurrentTestRun()
        await waitForProxy()

        const absolute = path.isAbsolute(scriptPath)
        const resolvedScriptPath = absolute
          ? scriptPath
          : path.join(SCRIPTS_PATH, scriptPath)

        currentTestRun = await runScript({
          browserWindow,
          scriptPath: resolvedScriptPath,
          proxySettings: k6StudioState.appSettings.proxy,
          usageReport: k6StudioState.appSettings.telemetry.usageReport,
          scenarioName: scenario,
        })

        trackEvent({
          event: UsageEventName.ScriptValidated,
          payload: {
            isExternal: isExternalScript(resolvedScriptPath),
          },
        })
      } catch (error) {
        browserWindow.webContents.send(ScriptHandler.Failed)

        if (error instanceof ArchiveError) {
          for (const logEntry of error.stderr) {
            browserWindow.webContents.send(ScriptHandler.Log, logEntry)
          }
        }

        throw error
      }
    }
  )

  ipcMain.handle(
    ScriptHandler.RunLoad,
    async (
      event,
      {
        path: scriptPath,
        content,
        name,
        vus,
        iterations,
        stages,
        verbose,
        httpDebug,
        useLocalGenerator,
      }: RunLoadTestOptions
    ) => {
      console.info(`${ScriptHandler.RunLoad} event received`)

      const browserWindow = browserWindowFromEvent(event)

      try {
        await stopCurrentTestRun()

        const absolute = path.isAbsolute(scriptPath)
        const resolvedScriptPath = absolute
          ? scriptPath
          : path.join(SCRIPTS_PATH, scriptPath)

        if (content !== undefined) {
          await writeFile(resolvedScriptPath, content)
        }

        currentTestRun = await runLoadTest({
          browserWindow,
          scriptPath: resolvedScriptPath,
          usageReport: k6StudioState.appSettings.telemetry.usageReport,
          name,
          vus,
          iterations,
          stages,
          verbose,
          httpDebug,
          useLocalGenerator,
        })
      } catch (error) {
        browserWindow.webContents.send(ScriptHandler.Failed)

        if (error instanceof ArchiveError) {
          for (const logEntry of error.stderr) {
            browserWindow.webContents.send(ScriptHandler.Log, logEntry)
          }
        }

        throw error
      } finally {
        if (content !== undefined) {
          // The archive is self-contained by the time `runLoadTest` resolves.
          await unlink(scriptPath).catch(() => {
            // Best case effort cleanup.
          })
        }
      }
    }
  )

  ipcMain.handle(
    ScriptHandler.RunFromGenerator,
    async (
      event,
      {
        content,
        path,
        scenario,
        shouldTrack = true,
      }: RunScriptFromGeneratorOptions
    ) => {
      console.info(`${ScriptHandler.RunFromGenerator} event received`)

      const browserWindow = browserWindowFromEvent(event)

      try {
        // The run is proxied through the studio proxy (`HTTP_PROXY` in
        // `runScript`), so starting before it is online sends every request to
        // a dead port: `resp.body` is null and `resp.json()` throws a GoError
        // that names no request.
        await stopCurrentTestRun()
        await waitForProxy()

        await writeFile(path, content)

        currentTestRun = await runScript({
          browserWindow,
          scriptPath: path,
          scenarioName: scenario,
          proxySettings: k6StudioState.appSettings.proxy,
          usageReport: k6StudioState.appSettings.telemetry.usageReport,
        })

        if (shouldTrack) {
          trackEvent({
            event: UsageEventName.ScriptValidated,
            payload: {
              isExternal: false,
            },
          })
        }
      } catch (error) {
        browserWindow.webContents.send(ScriptHandler.Failed)

        if (error instanceof ArchiveError) {
          for (const logEntry of error.stderr) {
            browserWindow.webContents.send(ScriptHandler.Log, logEntry)
          }
        }

        throw error
      } finally {
        await unlink(path).catch(() => {
          // Best case effort cleanup.
        })
      }
    }
  )

  ipcMain.on(ScriptHandler.Stop, () => {
    console.info(`${ScriptHandler.Stop} event received`)

    void stopCurrentTestRun()
  })

  ipcMain.handle(
    ScriptHandler.Save,
    async (_, scriptPath: string, script: string) => {
      console.info(`${ScriptHandler.Save} event received`)
      try {
        await writeFile(scriptPath, script)

        trackEvent({
          event: UsageEventName.ScriptExported,
          payload: {
            isExternal: isExternalScript(scriptPath),
          },
        })

        return scriptPath
      } catch (error) {
        log.error(error)

        throw error
      }
    }
  )
}
