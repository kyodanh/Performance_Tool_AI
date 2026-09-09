import { ipcMain, shell } from 'electron'

import { waitForProxy } from '@/main/proxy'
import { launchBrowser } from '@/recorder/launch'
import { BrowserLaunchError } from '@/recorder/launchers/types'
import { LaunchBrowserOptions } from '@/recorder/types'
import { browserWindowFromEvent, sendToast } from '@/utils/electron'
import { validateExternalUrl } from '@/utils/url'

import { BrowserHandler } from './types'

export function initialize() {
  ipcMain.handle(
    BrowserHandler.Start,
    async (event, options: LaunchBrowserOptions) => {
      console.info(`${BrowserHandler.Start} event received`)

      const browserWindow = browserWindowFromEvent(event)

      // ponytail: one recording at a time across all windows — the recording
      // session and the proxy stream it reads are app-wide, so a second
      // recording would mix its traffic into the first one's HAR.
      if (k6StudioState.currentRecordingSession !== null) {
        sendToast(browserWindow.webContents, {
          title: 'A recording is already running',
          description: 'Stop the recording in the other window first.',
          status: 'error',
        })

        return
      }

      await waitForProxy()

      try {
        k6StudioState.currentRecordingSession = await launchBrowser(options)

        k6StudioState.currentRecordingSession.on('record', (event) => {
          browserWindow.webContents.send(
            BrowserHandler.BrowserEvent,
            event.events
          )
        })

        k6StudioState.currentRecordingSession.on('error', (error) => {
          console.error('An error occurred during recording: ', error)

          browserWindow.webContents.send(BrowserHandler.Error, {
            reason: 'recording-session',
            fatal: false,
          })
        })

        k6StudioState.currentRecordingSession.on('stop', () => {
          browserWindow.webContents.send(BrowserHandler.Closed)

          k6StudioState.currentRecordingSession = null
        })

        console.info('browser started')
      } catch (error) {
        console.error(
          'An unexpected error occurred while starting recording: ',
          error
        )

        if (error instanceof BrowserLaunchError) {
          browserWindow.webContents.send(BrowserHandler.Error, {
            reason: error.source,
            fatal: true,
          })

          return
        }

        browserWindow.webContents.send(BrowserHandler.Error, {
          reason: 'unknown',
          fatal: true,
        })
      }
    }
  )

  ipcMain.on(BrowserHandler.Stop, () => {
    console.info(`${BrowserHandler.Stop} event received`)

    k6StudioState.currentRecordingSession?.stop()
    k6StudioState.currentRecordingSession = null
  })

  // TODO: Move to app or ui. The other handlers in this file are related to recording.
  ipcMain.handle(BrowserHandler.OpenExternalLink, (_, url: string) => {
    console.info(`${BrowserHandler.OpenExternalLink} event received`)
    return shell.openExternal(validateExternalUrl(url))
  })
}
