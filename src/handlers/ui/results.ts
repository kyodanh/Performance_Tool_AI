import { shell } from 'electron'
import log from 'electron-log/main'

import { RESULTS_PATH } from '@/constants/workspace'
import { mkdir, readdir, readFile, unlink, writeFile } from '@/utils/fs'
import { RunStats } from '@/utils/k6/stats'
import * as path from '@/utils/path'

import { RunResult, RunResultSummary } from './types'

// eslint-disable-next-line no-control-regex
const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g

/** `2026-08-28T14-47-25` — safe on every platform and sorts chronologically. */
function stamp(date: Date) {
  return date.toISOString().slice(0, 19).replace(/:/g, '-')
}

/** A leading dot would hide the result from the OS file browser. */
function safeName(testName: string) {
  return testName.replace(INVALID_NAME_CHARS, '_').replace(/^\.+/, '') || 'k6'
}

/** Separates the user's name for a version from the run key before it. */
const LABEL_SEPARATOR = '__'

/**
 * Results are keyed by when the run started, not when it was written, so
 * saving the same run twice — the auto-save when it stops, then the user's
 * Save to Analysis — updates one version instead of listing two.
 */
function runKey(testName: string, stats: RunStats) {
  const started = stats.buckets[0]?.time

  return `${safeName(testName)}-${stamp(
    started === undefined ? new Date() : new Date(started * 1000)
  )}`
}

/**
 * Drops earlier saves of the same run under a different name — naming a version
 * renames it, it does not fork it.
 */
async function removeOtherNames(key: string, keep: string) {
  const entries = await readdir(RESULTS_PATH).catch(() => [])

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name !== keep &&
          (entry.name === `${key}.json` ||
            entry.name.startsWith(`${key}${LABEL_SEPARATOR}`))
      )
      .map((entry) => unlink(path.join(RESULTS_PATH, entry.name)))
  )
}

/**
 * Writes a finished run to the Results folder. The live stats only exist for as
 * long as the app runs, so this is what the Analysis view reads — the
 * equivalent of a LoadRunner result set. `label` is the user's own name for the
 * version ("baseline", "after pool tuning"); without one the run is listed by
 * when it ran.
 */
export async function saveRunResult(
  testName: string,
  stats: RunStats,
  label?: string
) {
  const result: RunResult = {
    testName,
    ranAt: new Date().toISOString(),
    stats,
    ...(label === undefined ? {} : { label }),
  }
  const key = runKey(testName, stats)
  const named = label === undefined ? '' : safeName(label)
  const fileName =
    named === '' ? `${key}.json` : `${key}${LABEL_SEPARATOR}${named}.json`
  const filePath = path.join(RESULTS_PATH, fileName)

  try {
    await mkdir(RESULTS_PATH, { recursive: true })
    await writeFile(filePath, JSON.stringify(result))
    await removeOtherNames(key, fileName)

    return filePath
  } catch (error) {
    log.error('Failed to save the run result', error)

    return null
  }
}

/**
 * `checkout-2026-08-28T14-47-25.json`, or `…-14-47-25__baseline.json` once the
 * user has named the version — the name a saved run is written under.
 */
const STAMPED =
  /^(.+)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:__(.+))?\.json$/

/**
 * Splits a result file name back into the test it came from and when it ran, so
 * the Analysis view can group versions per test without opening a single file —
 * a result holds every metric bucket of the run.
 */
function summarize(fileName: string): RunResultSummary {
  const match = STAMPED.exec(fileName)

  if (match === null) {
    return { id: fileName, testName: path.name(fileName), ranAt: null }
  }

  const [, testName = '', date, hour, minute, second, label] = match

  return {
    id: fileName,
    testName,
    // The stamp was written from `toISOString`, so it is UTC.
    ranAt: `${date}T${hour}:${minute}:${second}Z`,
    ...(label === undefined ? {} : { label }),
  }
}

/**
 * Saved runs, newest first. Only file names are read — see `summarize`.
 */
export async function listRunResults(): Promise<RunResultSummary[]> {
  const entries = await readdir(RESULTS_PATH).catch(() => [])

  return (
    entries
      .filter((entry) => entry.isFile() && path.extname(entry.name) === '.json')
      .map((entry) => summarize(entry.name))
      // The stamp in the name is ISO, so name order is run order.
      .sort((a, b) => b.id.localeCompare(a.id))
  )
}

/**
 * Moves saved runs to the OS trash, so a delete stays recoverable. `ids` come
 * from the renderer, so each is kept to a file inside Results.
 */
export async function deleteRunResults(ids: string[]) {
  for (const id of ids) {
    const filePath = path.join(RESULTS_PATH, path.basename(id))

    try {
      await shell.trashItem(path.toNativePath(filePath))
    } catch (error) {
      log.error('Failed to move the run result to trash', error)

      throw error
    }
  }
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
