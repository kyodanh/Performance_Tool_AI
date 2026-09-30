import { ipcRenderer } from 'electron'

import { DataFileHandler } from './types'

export function importFile() {
  return ipcRenderer.invoke(DataFileHandler.Import) as Promise<
    string | undefined
  >
}

/** Any file, copied into the Data folder for a multipart upload. */
export function importUploadFile() {
  return ipcRenderer.invoke(DataFileHandler.ImportUpload) as Promise<
    string | undefined
  >
}

/** The Data folder path of a file already imported under that name, if any. */
export function findUploadFile(fileName: string) {
  return ipcRenderer.invoke(DataFileHandler.FindUpload, fileName) as Promise<
    string | null
  >
}

export function openFile() {
  return ipcRenderer.invoke(DataFileHandler.Open) as Promise<string | undefined>
}
