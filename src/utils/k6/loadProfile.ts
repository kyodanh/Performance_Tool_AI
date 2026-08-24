import { LoadProfileExecutorOptions } from '@/types/testOptions'
import { newSyntheticKey } from '@/utils/zod'

import { K6TestOptions } from './schema'

export interface LoadProfileOverrides {
  vus?: number
  iterations?: number
  /** `<duration>:<target>` pairs, one per `--stage` flag. */
  stages?: string[]
}

/**
 * CLI overrides that make k6 schedule `profile` instead of the load profile the
 * script declares. Flags win over the script's own `options`, including over
 * `scenarios`, which is what lets the controller drive any test.
 */
export function toProfileOverrides(
  profile: LoadProfileExecutorOptions
): LoadProfileOverrides {
  if (profile.executor === 'shared-iterations') {
    return { vus: profile.vus, iterations: profile.iterations }
  }

  return {
    stages: profile.stages.map(
      ({ duration, target }) => `${duration}:${target}`
    ),
  }
}

/**
 * Seeds the profile form from what the script already declares, so opening the
 * controller shows the test's own schedule rather than arbitrary defaults.
 */
export function toLoadProfile(
  options: K6TestOptions
): LoadProfileExecutorOptions {
  if (options.stages?.length) {
    return {
      executor: 'ramping-vus',
      stages: options.stages.map(({ duration, target }) => ({
        key: newSyntheticKey(),
        duration,
        target,
      })),
    }
  }

  if (options.iterations != null) {
    return {
      executor: 'shared-iterations',
      vus: options.vus ?? 1,
      iterations: options.iterations,
    }
  }

  return {
    executor: 'ramping-vus',
    stages: [
      {
        key: newSyntheticKey(),
        duration: options.duration ?? '30s',
        target: options.vus ?? 10,
      },
    ],
  }
}

/**
 * Whether the profile schedules anything at all. An empty one produces no CLI
 * flags, which k6 reads as "use the script's own options" — so a run started
 * from an empty profile would silently ignore this form.
 */
export function isRunnableProfile(
  profile: LoadProfileExecutorOptions
): boolean {
  if (profile.executor === 'shared-iterations') {
    return (profile.vus ?? 0) > 0 && (profile.iterations ?? 0) > 0
  }

  return profile.stages.length > 0
}

/**
 * One-line summary of what k6 will actually run. A stage is a target VU count
 * and how long k6 takes to get there, so it only makes sense relative to the
 * stage before it — hence ramp vs hold rather than a list of raw pairs.
 */
export function describeProfile(profile: LoadProfileExecutorOptions): string {
  if (profile.executor === 'shared-iterations') {
    return `${profile.vus ?? 1} VUs sharing ${profile.iterations ?? 1} iterations`
  }

  let current = 0

  const stages = profile.stages.map(({ duration, target }) => {
    const step =
      target === current
        ? `hold ${target} VUs for ${duration}`
        : `${current} → ${target} VUs over ${duration}`

    current = target

    return step
  })

  return stages.join(', ') || 'no stages'
}

const DURATION_UNITS: Record<string, number> = {
  h: 3600,
  m: 60,
  s: 1,
  ms: 0.001,
}

/** Seconds in a k6 duration such as `1h30m`, `90s` or `500ms`. */
export function parseK6Duration(value: string): number {
  let total = 0

  for (const [, amount, unit] of value.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    total += Number(amount) * (DURATION_UNITS[unit ?? ''] ?? 0)
  }

  return total
}

/**
 * How long the run is scheduled to last, for a progress readout. Iteration-based
 * profiles finish when the work does, not on a clock, so they have no answer.
 */
export function profileSeconds(
  profile: LoadProfileExecutorOptions
): number | null {
  if (profile.executor === 'shared-iterations') {
    return null
  }

  const total = profile.stages.reduce(
    (sum, stage) => sum + parseK6Duration(stage.duration),
    0
  )

  return total > 0 ? total : null
}
