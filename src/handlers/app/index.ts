import { ipcMain, app } from 'electron'

import { getWindowState } from '@/main/window'
import { trackEvent } from '@/services/usageTracking'
import { UsageEvent } from '@/services/usageTracking/types'
import { browserWindowFromEvent } from '@/utils/electron'

import { getSystemMetrics } from './systemMetrics'
import { AppHandler } from './types'

export function initialize() {
  ipcMain.on(AppHandler.ChangeRoute, (event, route: string) => {
    getWindowState(browserWindowFromEvent(event).id).route = route
  })

  ipcMain.on(AppHandler.Close, (event) => {
    console.log(`${AppHandler.Close} event received`)

    const browserWindow = browserWindowFromEvent(event)
    getWindowState(browserWindow.id).closedByClient = true

    if (k6StudioState.appShuttingDown) {
      app.quit()
      return
    }

    browserWindow.close()
  })

  ipcMain.on(AppHandler.TrackEvent, (_, event: UsageEvent) => {
    trackEvent(event)
  })

  ipcMain.handle(AppHandler.SystemMetrics, () => getSystemMetrics())
}
