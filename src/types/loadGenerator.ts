import { SystemMetrics } from './systemMetrics'

export type LoadGeneratorOS = 'macos' | 'linux' | 'windows'

/** Facts the joiner script reports about the machine it runs on. */
export interface LoadGeneratorFacts {
  /**
   * Stable per-joiner id, kept on the generator's disk. Re-joining after the
   * controller restarts reuses the same row, and two joiners on one machine stay
   * separate rows instead of evicting each other.
   */
  instance: string
  hostname: string
  user: string
  os: LoadGeneratorOS
  arch: string
  /** The `k6 version` string the generator will actually run, e.g. `k6 v2.1.0`. */
  k6Version: string
  /** Hard `nofile` limit, or `n/a` on Windows, which has no equivalent. */
  nofile: string
  /** Ephemeral port range as `first-last`, or `unknown` when it can't be read. */
  ports: string
  /** The generator's clock at join time, in Unix seconds. */
  clock: number
}

export interface LoadGenerator extends LoadGeneratorFacts {
  id: string
  /** The address the controller sees, which is also what the joiner prints. */
  ip: string
  /**
   * Controller clock minus generator clock, in seconds. Metrics arriving from
   * this generator are shifted by it before being merged.
   */
  clockOffset: number
  /** Share of the load this generator takes, relative to the others. */
  weight: number
  /** Derived from the last heartbeat rather than stored, so it never goes stale. */
  status: 'ready' | 'offline'
  /**
   * CPU and memory as of the last heartbeat. Missing while a generator has yet
   * to report — an older joiner, or a machine whose tools would not answer.
   */
  resources?: SystemMetrics
}
