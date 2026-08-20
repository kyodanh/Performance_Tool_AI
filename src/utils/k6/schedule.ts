import { LoadProfileExecutorOptions } from '@/types/testOptions'
import { newSyntheticKey } from '@/utils/zod'

/**
 * A LoadRunner-style scenario schedule, in the terms its Controller uses. It is
 * only an input for `scheduleToProfile` — k6 itself is driven by the resulting
 * stages, which stay editable by hand afterwards.
 */
export interface Schedule {
  vus: number
  /** Start Vusers: all at once, or `stepVus` more every `stepEvery`. */
  startMode: 'simultaneous' | 'gradual'
  stepVus: number
  /** HH:MM:SS, as in the Controller. */
  stepEvery: string
  /** Duration: run until every VU finished, or hold the load for `runFor`. */
  durationMode: 'completion' | 'runFor'
  /** HH:MM:SS. */
  runFor: string
}

export const DEFAULT_SCHEDULE: Schedule = {
  vus: 100,
  startMode: 'simultaneous',
  stepVus: 1,
  stepEvery: '00:01:00',
  durationMode: 'runFor',
  runFor: '00:05:00',
}

/** Seconds in an `HH:MM:SS` (or `MM:SS`) value; 0 for anything unparseable. */
export function parseHms(value: string): number {
  const parts = value.split(':').map(Number)

  if (parts.length === 0 || parts.length > 3 || parts.some(isNaN)) {
    return 0
  }

  return parts.reduce((total, part) => total * 60 + part, 0)
}

/**
 * Seconds as a k6 duration. Only the shapes `RampingStageSchema` accepts are
 * emitted, so a generated stage always passes validation.
 */
export function toK6Duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  if (hours > 0) {
    if (minutes === 0 && secs === 0) {
      return `${hours}h`
    }

    return secs === 0 ? `${hours}h${minutes}m` : `${hours}h${minutes}m${secs}s`
  }

  if (minutes > 0) {
    return secs === 0 ? `${minutes}m` : `${minutes}m${secs}s`
  }

  return `${secs}s`
}

/**
 * Turns a schedule into the load profile k6 runs.
 *
 * Two deliberate departures from the Controller: a gradual start becomes a
 * linear ramp instead of a staircase (k6 interpolates between stages, and the
 * end state is the same), and "run until completion" becomes one iteration per
 * VU, since k6 has no notion of a VU that stops on its own.
 */
export function scheduleToProfile(
  schedule: Schedule
): LoadProfileExecutorOptions {
  const { vus, startMode, stepVus, stepEvery, durationMode, runFor } = schedule

  if (durationMode === 'completion') {
    return { executor: 'shared-iterations', vus, iterations: vus }
  }

  const rampSeconds =
    startMode === 'gradual' && stepVus > 0
      ? Math.ceil(vus / stepVus) * parseHms(stepEvery)
      : 0

  return {
    executor: 'ramping-vus',
    stages: [
      {
        key: newSyntheticKey(),
        duration: toK6Duration(rampSeconds),
        target: vus,
      },
      {
        key: newSyntheticKey(),
        duration: toK6Duration(parseHms(runFor)),
        target: vus,
      },
    ],
  }
}
