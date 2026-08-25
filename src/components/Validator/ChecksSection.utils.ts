import { Check } from '@/schemas/k6'
import { RunStats } from '@/utils/k6/stats'

export function groupChecksByPath(checks: Check[]) {
  const result: Record<string, Check[]> = {
    default: [],
  }

  checks.forEach((item) => {
    const paths = item.path.split('::').filter(Boolean)

    if (paths.length === 1) {
      result['default']?.push(item)
    } else {
      const pathName = paths.slice(0, -1).join('::')

      if (result[pathName]) {
        result[pathName].push(item)
      } else {
        result[pathName] = [item]
      }
    }
  })

  return result
}

export function hasFailures(check: Check) {
  return check.fails > 0
}

export function getPassPercentage(check: Check) {
  const total = check.passes + check.fails
  if (total === 0) {
    return 0
  }
  return (check.passes / total) * 100
}

/**
 * A load test archives the script untouched, so the `handleSummary` that prints
 * the checks summary never runs (see `runLoadTest`) and the stdout check list
 * stays empty. The CSV metric stream carries the same checks, so fall back to
 * it — and live, instead of only once the run is done.
 */
export function checksFromStats(stats: RunStats | null): Check[] {
  return (stats?.checks ?? []).map((check) => ({
    // The same check name repeats per request, so the request is part of the id.
    id: `${check.group}::${check.name}::${check.request}`,
    name: check.request ? `${check.name} — ${check.request}` : check.name,
    path: check.group ? `::${check.group}::${check.name}` : `::${check.name}`,
    passes: check.passes,
    fails: check.fails,
  }))
}
