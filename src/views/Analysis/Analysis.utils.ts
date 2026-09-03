import { RunResultSummary } from '@/handlers/ui/types'

export interface RunProject {
  testName: string
  /** Versions of this test's run, newest first. */
  runs: RunResultSummary[]
}

/**
 * Saved runs grouped per test — the Analysis sidebar lists the tests that were
 * put under load, each with the versions saved for it. `results` arrives newest
 * first and `Map` keeps insertion order, so both levels stay in that order.
 */
export function groupRuns(results: RunResultSummary[]): RunProject[] {
  const projects = new Map<string, RunResultSummary[]>()

  for (const run of results) {
    const runs = projects.get(run.testName)

    if (runs === undefined) {
      projects.set(run.testName, [run])
    } else {
      runs.push(run)
    }
  }

  return [...projects].map(([testName, runs]) => ({ testName, runs }))
}

/**
 * What a version is listed as: the name the user gave it, otherwise when it
 * ran — and the file name for a result saved before the stamp existed.
 */
export function runLabel(run: RunResultSummary) {
  if (run.label !== undefined) {
    return run.label
  }

  return run.ranAt === null ? run.id : new Date(run.ranAt).toLocaleString()
}

/** Shown under a named version, so when it ran is never lost. */
export function runTime(run: RunResultSummary) {
  if (run.label === undefined || run.ranAt === null) {
    return null
  }

  return new Date(run.ranAt).toLocaleString()
}
