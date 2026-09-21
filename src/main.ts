import './main/userDataPath'
import * as Sentry from '@sentry/electron/main'
import { app, autoUpdater, BrowserWindow, nativeTheme } from 'electron'
import log from 'electron-log/main'
import isSquirrelStartup from 'electron-squirrel-startup'
import { updateElectronApp } from 'update-electron-app'

import { setActiveWorkspaceRoot } from '@/constants/workspace'

import * as handlers from './handlers'
import { ProxyHandler } from './handlers/proxy/types'
import { initializeDeepLinks, replayPendingDeepLink } from './main/deepLinks'
import * as mainState from './main/k6StudioState'
import { initializeLogger } from './main/logger'
import { configureApplicationMenu } from './main/menu'
import { initOpenFile, replayPendingFileOpen } from './main/openFile'
import { installProjectContext } from './main/projectContext'
import {
  cleanUpProxies,
  launchProxyAndAttachEmitter,
  stopProxyProcess,
} from './main/proxy'
import { getSettings, initSettings } from './main/settings'
import { closeWatchers } from './main/watcher'
import { createWindow } from './main/window'
import { configureSystemProxy } from './services/http'
import { initEventTracking } from './services/usageTracking'
import { ProxyStatus } from './types'
import { broadcast, getAppIcon, getPlatform } from './utils/electron'
import { setupProjectStructure } from './utils/workspace'

// stdout/stderr can be closed pipes (e.g. the launching terminal has exited);
// without an error listener every console write throws an uncaught EPIPE,
// which Electron surfaces as a crash dialog.
process.stdout?.on('error', () => {})
process.stderr?.on('error', () => {})

// Dev only: `pnpm start` runs from the project root, where a gitignored .env
// can hold local keys (TYPESAFE_API_KEY). Shell variables win over the file.
if (process.env.NODE_ENV === 'development') {
  try {
    process.loadEnvFile()
  } catch {
    // no .env — nothing to load
  }
}

if (process.env.NODE_ENV !== 'development') {
  // initialize Sentry first so the autoUpdater error listener below can report
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.electronMinidumpIntegration()],

    // conditionally send the event based on the user's settings
    beforeSend: (event) => {
      if (k6StudioState.appSettings.telemetry.errorReport) {
        return event
      }
      return null
    },
  })

  // update-electron-app swallows autoUpdater errors at info level via its
  // default logger, so we capture them directly to surface silent failures.
  autoUpdater.on('error', (err) => {
    Sentry.captureException(err, { tags: { component: 'autoUpdater' } })
  })

  // handle auto updates
  updateElectronApp({ logger: log.scope('autoUpdater') })
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (isSquirrelStartup) {
  app.quit()
}

initializeLogger()
// Before the handlers register: every registration gets wrapped so it resolves
// paths against the project of the window that called it.
installProjectContext()
handlers.initialize()
mainState.initialize()
initializeDeepLinks()
initOpenFile()

/**
 * App-level setup that must happen exactly once, no matter how many windows are
 * open: one proxy, one menu. Everything these push to the renderer is broadcast
 * to every window. The file watcher is per-window — it follows that window's
 * project.
 */
async function initializeApp() {
  const icon = getAppIcon(process.env.NODE_ENV === 'development')
  if (getPlatform() === 'mac') {
    app.dock?.setIcon(icon)
  }
  app.setName('LoadPilot')

  // clean leftover proxies if any, this might happen on windows
  await cleanUpProxies()

  configureApplicationMenu()

  k6StudioState.proxyEmitter.on('status:change', (status: ProxyStatus) => {
    k6StudioState.proxyStatus = status
    broadcast(ProxyHandler.ChangeStatus, status)
  })

  // Configure proxy settings for `fetch`.
  await configureSystemProxy()

  // Start proxy
  k6StudioState.currentProxyProcess = await launchProxyAndAttachEmitter()
}

app.whenReady().then(
  async () => {
    await initSettings()
    k6StudioState.appSettings = await getSettings()
    nativeTheme.themeSource = k6StudioState.appSettings.appearance.theme

    // Must happen before the folders are created, the watcher starts or any
    // handler resolves a path — everything downstream reads the active root.
    setActiveWorkspaceRoot(k6StudioState.appSettings.workspace.root)

    await setupProjectStructure()
    await initEventTracking()
    await initializeApp()
    await createWindow()

    replayPendingDeepLink()
    replayPendingFileOpen()
  },
  (error) => {
    log.error(error)
  }
)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    app.quit()
    return
  }

  await closeWatchers()
})

app.on('activate', async () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow()
    // Window is already shown by the 'ready-to-show' event handler
  }
})

app.on('before-quit', async () => {
  k6StudioState.appShuttingDown = true
  await closeWatchers()
  return stopProxyProcess()
})
