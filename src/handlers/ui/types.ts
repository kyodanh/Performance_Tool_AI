import { StudioFile } from '@/types'
import { RunStats } from '@/utils/k6/stats'

export interface ExportReportPayload {
  /** The full HTML document to print. */
  html: string
  /** Suggested file name, without the `.pdf` extension. */
  fileName: string
  /** Stamped on every page, the way an analysis report does. */
  header: string
  footer: string
}

/** A finished load test, as saved for the Analysis view. */
export interface RunResult {
  /** The test the run came from. */
  testName: string
  /** ISO timestamp of when the run finished. */
  ranAt: string
  stats: RunStats
}

/** One saved run, as listed by the Analysis view. */
export interface RunResultSummary {
  /** File name inside the Results folder, used to read the run back. */
  id: string
  label: string
}

export interface GetFilesResponse {
  recordings: StudioFile[]
  generators: StudioFile[]
  scripts: StudioFile[]
  dataFiles: StudioFile[]
  browserTests: StudioFile[]
}

export enum UIHandler {
  ToggleTheme = 'ui:toggle-theme',
  DetectBrowser = 'ui:detect-browser',
  OpenFolder = 'ui:open-folder',
  OpenFileInDefaultApp = 'ui:open-file-in-default-app',
  TrashFile = 'ui:trash-file',
  GetFiles = 'ui:get-files',
  RenameFile = 'ui:rename-file',
  ReportIssue = 'ui:report-issue',
  AddFile = 'ui:add-file',
  RemoveFile = 'ui:remove-file',
  Toast = 'ui:toast',
  SetMenuState = 'ui:set-menu-state',
  RequestSave = 'ui:request-save',
  ExportReport = 'ui:export-report',
  ListResults = 'ui:list-results',
  ReadResult = 'ui:read-result',
}

export type MenuItemTuple = ['save', 'saveAs', 'exportScript']
export type MenuItem = MenuItemTuple[number]
export type MenuState = { [P in MenuItem]: boolean }
