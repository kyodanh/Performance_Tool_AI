import { ipcRenderer } from 'electron'

import { StudioFile } from '@/types'
import { AddToastPayload } from '@/types/toast'
import { RunStats } from '@/utils/k6/stats'

import { createListener } from '../utils'

import {
  ExportReportPayload,
  GetFilesResponse,
  MenuItem,
  MenuState,
  RunResult,
  RunResultSummary,
  UIHandler,
} from './types'

export function toggleTheme() {
  ipcRenderer.send(UIHandler.ToggleTheme)
}

export function detectBrowser() {
  return ipcRenderer.invoke(UIHandler.DetectBrowser) as Promise<boolean>
}

export function openContainingFolder(file: StudioFile) {
  ipcRenderer.send(UIHandler.OpenFolder, file)
}

export function openFileInDefaultApp(file: StudioFile) {
  return ipcRenderer.invoke(
    UIHandler.OpenFileInDefaultApp,
    file
  ) as Promise<string>
}

export function trashFile(file: StudioFile) {
  return ipcRenderer.invoke(UIHandler.TrashFile, file) as Promise<void>
}

export function getFiles() {
  return ipcRenderer.invoke(UIHandler.GetFiles) as Promise<GetFilesResponse>
}

export function renameFile(file: StudioFile, newFileName: string) {
  return ipcRenderer.invoke(
    UIHandler.RenameFile,
    file,
    newFileName
  ) as Promise<void>
}

/** Prints a report to PDF. Resolves with the path written, or null on cancel. */
export function exportReport(payload: ExportReportPayload) {
  return ipcRenderer.invoke(UIHandler.ExportReport, payload) as Promise<
    string | null
  >
}

/** Saved load test runs, newest first. */
export function listResults() {
  return ipcRenderer.invoke(UIHandler.ListResults) as Promise<
    RunResultSummary[]
  >
}

/**
 * Saves the current run to the Results folder. Re-saving the same run
 * overwrites it, so it lands in Analysis once. Resolves with the id to read it
 * back by, or null when the write failed.
 */
export function saveResult(testName: string, stats: RunStats, label?: string) {
  return ipcRenderer.invoke(
    UIHandler.SaveResult,
    testName,
    stats,
    label
  ) as Promise<string | null>
}

/** Moves saved runs to the OS trash. Rejects when one cannot be trashed. */
export function deleteResults(ids: string[]) {
  return ipcRenderer.invoke(UIHandler.DeleteResults, ids) as Promise<void>
}

/** Reads one saved run. Resolves with null when it cannot be read. */
export function readResult(id: string) {
  return ipcRenderer.invoke(
    UIHandler.ReadResult,
    id
  ) as Promise<RunResult | null>
}

export function reportIssue() {
  return ipcRenderer.invoke(UIHandler.ReportIssue) as Promise<void>
}

export function setMenuState(state: MenuState) {
  ipcRenderer.send(UIHandler.SetMenuState, state)
}

export function onAddFile(callback: (file: StudioFile) => void) {
  return createListener(UIHandler.AddFile, callback)
}

export function onRemoveFile(callback: (file: StudioFile) => void) {
  return createListener(UIHandler.RemoveFile, callback)
}

export function onToast(callback: (toast: AddToastPayload) => void) {
  return createListener(UIHandler.Toast, callback)
}

export function onRequestSave(
  callback: (options: { menuItem: MenuItem; saveAs: boolean }) => void
) {
  return createListener(UIHandler.RequestSave, callback)
}
