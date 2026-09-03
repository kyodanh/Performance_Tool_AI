import { BrowserWindow } from 'electron'
import log from 'electron-log/main'

import { TEMP_PATH } from '@/constants/workspace'
import { showSaveDialog } from '@/utils/dialog'
import { mkdir, unlink, writeFile } from '@/utils/fs'
import * as path from '@/utils/path'

import { ExportReportPayload } from './types'

// eslint-disable-next-line no-control-regex
const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g

const HEADER_STYLE =
  'font-size:8px;width:100%;padding:0 12mm;color:#5b6472;display:flex;justify-content:space-between;align-items:flex-start;'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * The page header: the run's identity on the left, the page counter and the
 * organization on the right — the layout an analysis report prints.
 */
function headerTemplate(lines: string[], organization: string) {
  const left = lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')
  const right = [
    'Page <span class="pageNumber"></span> out of <span class="totalPages"></span>',
    ...(organization === ''
      ? []
      : [`Organization: ${escapeHtml(organization)}`]),
  ]
    .map((line) => `<div>${line}</div>`)
    .join('')

  return `<div style="${HEADER_STYLE}"><div>${left}</div><div style="text-align:right">${right}</div></div>`
}

/**
 * Prints a self-contained HTML report to PDF in a hidden window, so the printed
 * page is the report alone rather than whatever the app is showing.
 */
async function printToFile(payload: ExportReportPayload, filePath: string) {
  await mkdir(TEMP_PATH, { recursive: true })

  const sourcePath = path.join(TEMP_PATH, `report-${Date.now()}.html`)
  await writeFile(sourcePath, payload.html)

  const printer = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, nodeIntegration: false },
  })

  try {
    await printer.loadFile(path.toNativePath(sourcePath))

    const pdf = await printer.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      margins: {
        marginType: 'custom',
        // The header carries three stacked lines, so it needs more room than a
        // single-line stamp would.
        top: 0.85,
        bottom: 0.5,
        left: 0.5,
        right: 0.5,
      },
      headerTemplate: headerTemplate(payload.headerLines, payload.organization),
      footerTemplate: '<div></div>',
    })

    await writeFile(filePath, pdf)
  } finally {
    printer.destroy()
    await unlink(sourcePath).catch(() => {})
  }
}

/**
 * Asks where to save, then writes the PDF. Returns the path written, or null
 * when the user cancelled.
 */
export async function exportReport(
  browserWindow: BrowserWindow,
  payload: ExportReportPayload
) {
  const { canceled, filePath } = await showSaveDialog(browserWindow, {
    title: 'Export performance report',
    defaultPath: `${payload.fileName.replace(INVALID_NAME_CHARS, '_')}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (canceled || filePath === undefined) {
    return null
  }

  try {
    await printToFile(payload, filePath)

    return filePath
  } catch (error) {
    log.error('Failed to export the performance report', error)

    throw error
  }
}
