import { BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { spawn } from 'node:child_process'

import { getPlatform } from '../utils/electron'
import { FSWatcher, readFile, watch } from '../utils/fs'
import * as path from '../utils/path'
import { toNativePath } from '../utils/path'

let watcher: FSWatcher

/**
 * The DevTools frontend automatically issues CDP commands from domains that
 * Electron's Chromium doesn't implement (e.g. `Autofill.enable`,
 * `Autofill.setAddresses`). Each rejection is mirrored into our logs via
 * `spyRendererConsole`, adding noise with no diagnostic value. Match and drop
 * those lines.
 */
const DEVTOOLS_NOISE_PATTERNS = [/Request Autofill\.\w+ failed/]

function isDevToolsNoise(data: unknown[]): boolean {
  return data.some(
    (entry) =>
      typeof entry === 'string' &&
      DEVTOOLS_NOISE_PATTERNS.some((pattern) => pattern.test(entry))
  )
}

/**
 * Recursively unwraps an AggregateError into its constituent errors. A new line
 * will be added between each error for better readability in the logs.
 */
function unwrapAggregateError(error: unknown): unknown[] {
  if (error instanceof AggregateError) {
    return [
      error,
      ...error.errors.flatMap((err) => ['\n', ...unwrapAggregateError(err)]),
    ]
  }

  return [error]
}

export function initializeLogger() {
  // allow logs to be triggered from the renderer process
  // https://github.com/megahertz/electron-log/blob/master/docs/initialize.md
  log.initialize({
    spyRendererConsole: true,
  })

  // log electron core events
  // https://github.com/megahertz/electron-log/blob/master/docs/events.md
  log.eventLogger.startLogging()

  // log uncaught exceptions
  // https://github.com/megahertz/electron-log/blob/master/docs/errors.md
  log.errorHandler.startCatching()

  log.transports.file.fileName = 'k6-studio.log'
  log.transports.file.level = 'error'

  if (process.env.NODE_ENV === 'development') {
    log.transports.file.fileName = 'k6-studio-dev.log'
    log.transports.file.level = 'debug'
  } else {
    // In packaged builds stdout may be a closed pipe and nothing reads it
    // anyway; the file transport already persists everything at 'error' and
    // above, so writing eventLogger/info noise to the console buys nothing.
    log.transports.console.level = false
  }

  log.hooks.push((msg) => {
    if (isDevToolsNoise(msg.data)) {
      return false
    }

    const hasAggregateError = msg.data.some(
      (data) => data instanceof AggregateError
    )

    if (!hasAggregateError) {
      return msg
    }

    return {
      ...msg,
      data: msg.data.flatMap<unknown>(unwrapAggregateError),
    }
  })

  // initialize chokidar watcher to watch log file
  watcher = watch(log.transports.file.getFile().path)
  watcher.on('change', onLogChange)
}

export function openLogFolder() {
  const logFile = log.transports.file.getFile().path
  const logPath = path.dirname(logFile)

  const executable = ['mac', 'linux'].includes(getPlatform())
    ? 'open'
    : 'explorer'
  spawn(executable, [toNativePath(logPath)])
}

export async function getLogContent() {
  const path = log.transports.file.getFile().path
  return await readFile(path, 'utf8')
}

async function onLogChange() {
  const content = await getLogContent()
  const mainWindow = BrowserWindow.getAllWindows()[0]

  if (!mainWindow) {
    return
  }

  try {
    mainWindow.webContents.send('log:change', content)
  } catch {
    // ponytail: the log file keeps changing while the app tears down — quitting
    // logs the renderer's own exit — and `send` throws once the render frame is
    // disposed ("Render frame was disposed before WebFrameMain could be
    // accessed"). The window is not destroyed at that point, and every way of
    // asking about the frame (`webContents.mainFrame`) throws the same way, so
    // catching the send is the only guard. Deliberately silent: logging here
    // would write to the file this watcher watches.
  }
}
