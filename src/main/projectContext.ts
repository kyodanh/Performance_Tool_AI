import { BrowserWindow, ipcMain } from 'electron'
import { EventEmitter } from 'node:events'

import { runInProject } from '@/constants/workspace'

import { getWindowRoot } from './window'

type IpcEvent = Electron.IpcMainEvent | Electron.IpcMainInvokeEvent

type Listener = (event: never, ...args: unknown[]) => unknown

function rootForEvent(event: IpcEvent) {
  return getWindowRoot(BrowserWindow.fromWebContents(event.sender)?.id)
}

function withProjectContext(listener: Listener) {
  const wrapper = (event: IpcEvent, ...args: unknown[]) =>
    runInProject(rootForEvent(event), () => listener(event as never, ...args))

  // Same convention `once` uses for its own wrapper, and the one
  // `removeListener` looks for: without it, a caller that removes a listener by
  // reference (see `handlers/utils.ts`) would never match ours and leak it.
  wrapper.listener =
    (listener as Listener & { listener?: Listener }).listener ?? listener

  return wrapper
}

/**
 * Bind every IPC call to the project of the window that made it, so a handler
 * calling `getGeneratorsPath()` gets that window's Generators folder instead of
 * being handed a root it would then have to pass on to everything it calls.
 *
 * Patched here, once, rather than at each of the ~85 `ipcMain.handle`/`on`
 * registrations spread over eighteen handler modules. Must run before
 * `handlers.initialize()`.
 */
export function installProjectContext() {
  const handle = ipcMain.handle.bind(ipcMain)
  const on = ipcMain.on.bind(ipcMain)

  ipcMain.handle = (channel: string, listener: Listener) =>
    handle(channel, withProjectContext(listener))

  ipcMain.on = (channel: string, listener: Listener) =>
    on(channel, withProjectContext(listener))

  // `once` inherits from EventEmitter, which registers through `on` — already
  // covered. Wrapping it as well would nest two wrappers and break removal by
  // reference, so only patch it if Electron ever stops delegating.
  if (ipcMain.once !== EventEmitter.prototype.once) {
    const once = ipcMain.once.bind(ipcMain)

    ipcMain.once = (channel: string, listener: Listener) =>
      once(channel, withProjectContext(listener))
  }
}
