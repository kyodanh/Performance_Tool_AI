import log from 'electron-log/main'

import { RESULTS_PATH } from '@/constants/workspace'
import { mkdir, readdir, readFile, writeFile } from '@/utils/fs'
import { RunStats } from '@/utils/k6/stats'
import * as path from '@/utils/path'

import { RunResult, RunResultSummary } from './types'

// eslint-disable-next-line no-control-regex
const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g

/** `2026-08-28T14-47-25` — safe on every platform and sorts chronologically. */
function stamp(date: Date) {
  return date.toISOString().slice(0, 19).replace(/:/g, '-')
}

/**
 * Writes a finished run to the Results folder. The live stats only exist for as
 * long as the Controller stays mounted, so this is what the Analysis view reads
 * — the equivalent of a LoadRunner result set.
 */
export async function saveRunResult(testName: string, stats: RunStats) {
  const ranAt = new Date()
  const result: RunResult = { testName, ranAt: ranAt.toISOString(), stats }
  const fileName = `${testName.replace(INVALID_NAME_CHARS, '_')}-${stamp(ranAt)}.json`
  const filePath = path.join(RESULTS_PATH, fileName)

  try {
    await mkdir(RESULTS_PATH, { recursive: true })
    await writeFile(filePath, JSON.stringify(result))

    return filePath
  } catch (error) {
    log.error('Failed to save the run result', error)

    return null
  }
}

/**
 * Saved runs, newest first. Only the file name is read — a result holds every
 * metric bucket of the run, which is too much to parse just to fill a list.
 */
export async function listRunResults(): Promise<RunResultSummary[]> {
  const entries = await readdir(RESULTS_PATH).catch(() => [])

  return (
    entries
      .filter((entry) => entry.isFile() && path.extname(entry.name) === '.json')
      .map((entry) => ({ id: entry.name, label: path.name(entry.name) }))
      // The stamp in the name is ISO, so name order is run order.
      .sort((a, b) => b.id.localeCompare(a.id))
  )
}

/** Reads one saved run. Returns null when the file is missing or corrupt. */
export async function readRunResult(id: string): Promise<RunResult | null> {
  // `id` arrives from the renderer, so keep it to a file inside Results.
  const filePath = path.join(RESULTS_PATH, path.basename(id))

  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as RunResult
  } catch (error) {
    log.error('Failed to read the run result', error)

    return null
  }
}
