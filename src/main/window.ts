import { app, BrowserWindow, nativeTheme } from 'electron'
import log from 'electron-log/main'

import { getDefaultWorkspaceRoot, getProjectPath } from '@/constants/workspace'
import { getAppIcon } from '@/utils/electron'
import * as path from '@/utils/path'

import { saveSettings } from './settings'
import { closeWatcher, configureWatcher } from './watcher'

/**
 * Anything the main process tracks about "the current view" belongs to one
 * window, not to the app — two windows have two routes and two independent
 * unsaved-changes confirmations.
 */
interface WindowState {
  root: string
  route: string
  closedByClient: boolean
}

const windowStates = new Map<number, WindowState>()

export function getWindowState(windowId: number): WindowState {
  const state = windowStates.get(windowId) ?? {
    root: getProjectPath(),
    route: '/',
    closedByClient: false,
  }

  windowStates.set(windowId, state)

  return state
}

/**
 * The project a window is showing. Everything that window asks the main process
 * for resolves against this root — see `runInProject`.
 */
export function getWindowRoot(windowId: number | undefined) {
  if (windowId === undefined) {
    return getProjectPath()
  }

  return getWindowState(windowId).root
}

function getFocusedRoot() {
  return getWindowRoot(BrowserWindow.getFocusedWindow()?.id)
}

/**
 * The project name is part of the title so several projects open in sequence
 * stay tellable apart — the default workspace shows no name, there is only one.
 */
function buildWindowTitle(root: string) {
  const base = DEV_GIT_BRANCH
    ? `Grafana k6 Studio [${DEV_GIT_BRANCH}]`
    : 'Grafana k6 Studio'

  if (path.equal(root, getDefaultWorkspaceRoot())) {
    return base
  }

  return `${path.basename(root)} — ${base}`
}

// Extra windows cascade off the one they were opened from instead of landing
// exactly on top of it — an invisible window is indistinguishable from one that
// failed to open.
const CASCADE_OFFSET = 32

function getInitialBounds() {
  const { width, height, x, y } = k6StudioState.appSettings.windowState
  const openedFrom =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().at(-1)

  if (!openedFrom) {
    return { width, height, x, y }
  }

  const bounds = openedFrom.getBounds()

  return {
    width,
    height,
    x: bounds.x + CASCADE_OFFSET,
    y: bounds.y + CASCADE_OFFSET,
  }
}

/**
 * A window is bound to one project for its lifetime. Opening another project
 * opens another window rather than swapping the root under the open tabs, the
 * file watcher and any running recording.
 */
export async function createWindow(root: string = getFocusedRoot()) {
  const { width, height, x, y } = getInitialBounds()

  const browserWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    // Keeps the narrowest view row (with the sidebar at its max) above the
    // header's fully collapsed floor; see GeneratorControls' breakpoints.
    minWidth: 1000,
    minHeight: 600,
    show: false,
    icon: getAppIcon(process.env.NODE_ENV === 'development'),
    title: buildWindowTitle(root),
    backgroundColor: nativeTheme.themeSource === 'light' ? '#fff' : '#111110',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: process.env.NODE_ENV === 'development',
    },
  })

  windowStates.set(browserWindow.id, {
    root,
    route: '/',
    closedByClient: false,
  })

  configureWatcher(browserWindow, root)

  browserWindow.once('ready-to-show', () => {
    showWindow(browserWindow)
  })

  browserWindow.on('moved', () => trackWindowState(browserWindow))
  browserWindow.on('resized', () => trackWindowState(browserWindow))
  browserWindow.on('close', (event) => guardWindowClose(browserWindow, event))
  browserWindow.on('closed', () => {
    windowStates.delete(browserWindow.id)
    void closeWatcher(browserWindow.id)
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await browserWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    await browserWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    )
  }

  if (process.env.NODE_ENV === 'development') {
    browserWindow.webContents.openDevTools()
  }

  return browserWindow
}

/**
 * Cancel the close and let the renderer ask about unsaved work; it closes the
 * window again through `app:close` once the user has decided.
 */
function guardWindowClose(browserWindow: BrowserWindow, event: Electron.Event) {
  browserWindow.webContents.send('app:close')

  const { route, closedByClient } = getWindowState(browserWindow.id)

  const fileExtension =
    route.startsWith('/file/') &&
    path.extname(decodeURIComponent(route.slice('/file/'.length)))

  if (
    fileExtension &&
    ['.k6g', '.k6b', '.js', '.ts'].includes(fileExtension) &&
    !closedByClient
  ) {
    event.preventDefault()
  }

  if (
    route.startsWith('/recorder') &&
    k6StudioState.currentRecordingSession !== null
  ) {
    event.preventDefault()
  }
}

export function showWindow(browserWindow: BrowserWindow) {
  const { isMaximized } = k6StudioState.appSettings.windowState
  if (isMaximized) {
    browserWindow.maximize()
  } else {
    browserWindow.show()
  }
  app.focus({ steal: true })
}

export async function trackWindowState(browserWindow: BrowserWindow) {
  const { width, height, x, y } = browserWindow.getBounds()
  const isMaximized = browserWindow.isMaximized()
  k6StudioState.appSettings.windowState = {
    width,
    height,
    x,
    y,
    isMaximized,
  }
  try {
    await saveSettings(k6StudioState.appSettings)
  } catch (error) {
    log.error(error)
  }
}
