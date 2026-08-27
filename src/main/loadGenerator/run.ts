import { nanoid } from 'nanoid'

import { LoadGenerator } from '@/types/loadGenerator'

import { pool } from './pool'
import { computeSegments, ExecutionSegment } from './segments'

export interface RemoteOrder {
  runId: string
  /**
   * The full k6 flag list as one string. The joiner word-splits it, which is why
   * no value may contain a space — load profile values never do.
   */
  flags: string
}

interface Participant {
  generator: LoadGenerator
  flags: string
}

interface ActiveRun {
  id: string
  archivePath: string
  participants: Map<string, Participant>
  /** Generators that already collected the order, so it is handed out once. */
  claimed: Set<string>
  /** Generators whose k6 has exited and closed its output stream. */
  finished: Set<string>
  onLine: (line: string, source: string, clockOffset: number) => void
  onPoolFinished: (() => void) | null
  aborted: boolean
}

let active: ActiveRun | null = null

/**
 * The profile flags a remote k6 needs, mirroring what the local run gets. Values
 * never contain spaces, which is what lets the joiner word-split the flag string.
 */
export function toProfileFlags({
  vus,
  iterations,
  stages,
}: {
  vus?: number
  iterations?: number
  stages?: string[]
}): string[] {
  return [
    ...(vus === undefined ? [] : ['--vus', String(vus)]),
    ...(iterations === undefined ? [] : ['--iterations', String(iterations)]),
    ...(stages ?? []).flatMap((stage) => ['--stage', stage]),
  ]
}

/** Flags every remote k6 needs regardless of the profile the user chose. */
const BASE_FLAGS = [
  '--quiet',
  '--log-format',
  'json',
  '--out',
  'csv=-',
  '--insecure-skip-tls-verify',
  '--no-usage-report',
]

export interface DistributedRunOptions {
  archivePath: string
  /** Load profile flags — the *total* across the pool, not per generator. */
  profileFlags: string[]
  /** Receives every output line a generator produces, tagged with its id. */
  onLine: (line: string, source: string, clockOffset: number) => void
  /** Whether this machine takes a share of the load as well as aggregating. */
  includeLocal: boolean
  /** Called once every participating generator's k6 has exited. */
  onPoolFinished?: () => void
}

export interface DistributedRunPlan {
  /**
   * The share this machine runs, or null when it needs no segment — either
   * because it is the only participant, or because it takes no share at all.
   */
  local: ExecutionSegment | null
  /** Whether this machine runs k6 at all. */
  runsLocally: boolean
  /** Generators taking part, in the order their segments were assigned. */
  generators: LoadGenerator[]
}

/**
 * Splits the load across this machine and every ready generator, and holds the
 * archive and per-generator orders until the run ends.
 *
 * This machine always takes a share: it is the only participant with a k6
 * process the run can be anchored to, and with no generators joined it is the
 * whole run.
 */
export function startDistributedRun({
  archivePath,
  profileFlags,
  onLine,
  includeLocal,
  onPoolFinished,
}: DistributedRunOptions): DistributedRunPlan {
  const generators = pool
    .list()
    .filter((generator) => generator.status === 'ready')

  if (generators.length === 0) {
    active = null

    if (!includeLocal) {
      throw new Error(
        'No load generator is available. Add one, or tick "Run on this machine".'
      )
    }

    return { local: null, runsLocally: true, generators: [] }
  }

  const segments = computeSegments([
    ...(includeLocal ? [1] : []),
    ...generators.map((generator) => generator.weight),
  ])

  const localSegment = includeLocal ? (segments[0] ?? null) : null
  const remoteSegments = includeLocal ? segments.slice(1) : segments
  const runId = nanoid(8)

  const participants = new Map<string, Participant>()

  for (const [index, generator] of generators.entries()) {
    const share = remoteSegments[index]

    if (share === undefined) {
      continue
    }

    participants.set(generator.id, {
      generator,
      flags: [
        ...BASE_FLAGS,
        ...profileFlags,
        '--execution-segment',
        share.segment,
        '--execution-segment-sequence',
        share.sequence,
      ].join(' '),
    })
  }

  active = {
    id: runId,
    archivePath,
    participants,
    claimed: new Set(),
    finished: new Set(),
    onLine,
    onPoolFinished: onPoolFinished ?? null,
    aborted: false,
  }

  return { local: localSegment, runsLocally: includeLocal, generators }
}

/**
 * Records that a generator's k6 has exited — its output stream closing is the
 * signal. Once every participant is done (or has dropped out of the pool) the
 * run is over, which is what a remote-only run has instead of a local process
 * exiting.
 */
export function markFinished(generatorId: string) {
  const run = active

  if (run === null || !run.participants.has(generatorId)) {
    return
  }

  run.finished.add(generatorId)

  if (!isPoolFinished()) {
    return
  }

  const callback = run.onPoolFinished

  // Fired once: a late stats stream closing must not end the next run.
  run.onPoolFinished = null
  callback?.()
}

/**
 * A participant counts as done when its k6 exited, or when it stopped answering
 * heartbeats — otherwise a machine that was unplugged mid-run would leave the
 * run hanging forever.
 */
export function isPoolFinished(): boolean {
  if (active === null) {
    return true
  }

  const stillReady = new Set(
    pool
      .list()
      .filter((generator) => generator.status === 'ready')
      .map((generator) => generator.id)
  )

  for (const id of active.participants.keys()) {
    if (!active.finished.has(id) && stillReady.has(id)) {
      return false
    }
  }

  return true
}

/** Hands a generator its share, once. Null while there is nothing to run. */
export function claimOrder(generatorId: string): RemoteOrder | null {
  if (active === null || active.aborted || active.claimed.has(generatorId)) {
    return null
  }

  const participant = active.participants.get(generatorId)

  if (participant === undefined) {
    return null
  }

  active.claimed.add(generatorId)

  return { runId: active.id, flags: participant.flags }
}

export function getArchivePath(generatorId: string): string | null {
  if (active === null || !active.participants.has(generatorId)) {
    return null
  }

  return active.archivePath
}

export function pushRemoteLines(generatorId: string, lines: string[]) {
  const run = active
  const participant = run?.participants.get(generatorId)

  if (run === null || run === undefined || participant === undefined) {
    return
  }

  for (const line of lines) {
    run.onLine(
      line,
      participant.generator.hostname,
      participant.generator.clockOffset
    )
  }
}

/**
 * Tells generators still running to kill their k6 instead of letting them finish
 * the profile on their own.
 *
 * A run that ends on its own needs no counterpart: the order has already been
 * claimed, so nothing more is handed out, and keeping the run around lets stats
 * still in flight land after the local process has exited. The next run replaces
 * it.
 */
export function abortDistributedRun() {
  if (active !== null) {
    active.aborted = true
  }
}

/** True while a generator's k6 should be killed. */
export function shouldAbort(generatorId: string): boolean {
  return active !== null && active.aborted && active.claimed.has(generatorId)
}
