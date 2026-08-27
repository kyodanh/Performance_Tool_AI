import { ChildProcessWithoutNullStreams } from 'child_process'
import readline from 'readline/promises'

import { Check, CheckArraySchema, LogEntry, LogEntrySchema } from '@/schemas/k6'
import { EventEmitter } from '@/utils/events'

import { parseJsonAsSchema } from '../json'

import { RunStats, RunStatsCollector } from './stats'

// Copied from https://github.com/grafana/k6/blob/master/errext/exitcodes/codes.go
enum ExitCode {
  Success = 0,

  // CloudTestRunFailed indicates that the cloud test run failed.
  // Its value used to be 99 before k6 v0.33.0.
  CloudTestRunFailed = 97,

  // CloudFailedToGetProgress indicates that k6 was unable to synchronize the
  // test progress with the cloud.
  CloudFailedToGetProgress = 98,

  // ThresholdsHaveFailed indicates that one or more thresholds have failed.
  ThresholdsHaveFailed = 99,

  // SetupTimeout indicates the execution of the test setup function timed out.
  SetupTimeout = 100,

  // TeardownTimeout indicates the execution of the test teardown function timed out.
  TeardownTimeout = 101,

  // GenericTimeout indicates a timeout with an unspecified reason.
  GenericTimeout = 102,

  // ScriptStoppedFromRESTAPI indicates the execution has been
  // stopped by a call to the k6's REST API.
  ScriptStoppedFromRESTAPI = 103,

  // InvalidConfig indicates an invalid configuration.
  InvalidConfig = 104,

  // ExternalAbort indicates the test was aborted by an external signal
  // (e.g. SIGINT, SIGTERM, etc.) and should be considered aborted rather
  // than a failure.
  ExternalAbort = 105,

  // CannotStartRESTAPI indicates the k6's REST API server could not be started.
  CannotStartRESTAPI = 106,

  // ScriptException indicates an exception was thrown during the
  // test script's execution.
  ScriptException = 107,

  // ScriptAborted indicates the script was aborted by a call to the
  // k6 execution module's `test.abort()` function.
  ScriptAborted = 108,

  // GoPanic indicates the script was aborted by a panic in the Go runtime.
  GoPanic = 109,

  // MarkedAsFailed indicates that the test was marked as failed.
  MarkedAsFailed = 110,
}

interface PassedTestResult {
  passed: true
}

interface FailedTestResult {
  passed: false
}

type TestResult = PassedTestResult | FailedTestResult

export interface TestRunStartEvent {}

export interface TestRunErrorEvent {
  error: Error
}

export interface TestRunAbortEvent {}

export interface TestRunDoneEvent {
  result: TestResult
  checks: Check[]
}

export interface TestRunLogEvent {
  entry: LogEntry
}

export interface TestRunStatsEvent {
  stats: RunStats
}

interface TestRunEventMap {
  /**
   * Fired when the k6 process has started and
   * the script is being executed.
   */
  start: TestRunStartEvent

  /**
   * Fired when the k6 process couldn't be spawned or exited
   * in an unexpected manner, e.g. because of a runtime panic.
   */
  error: TestRunErrorEvent

  /**
   * Fired when test run has been aborted by the user.
   */
  abort: TestRunAbortEvent

  /**
   * Fired when the test run has ran to completion, regardless
   * of whether it passed or failed.
   */
  done: TestRunDoneEvent

  /**
   * Called when the test run has stopped, i.e. after the
   * done, abort or error events have been emitted.
   */
  stop: void

  /**
   * Fired when a log entry is emitted by the test run.
   */
  log: TestRunLogEvent

  /**
   * Fired once per second while metrics are streaming, and a final time
   * when the run stops.
   */
  stats: TestRunStatsEvent
}

const STATS_INTERVAL = 1_000

export class TestRun extends EventEmitter<TestRunEventMap> {
  /**
   * Null when the load runs entirely on remote generators: there is no local k6
   * to wrap, but the metrics, logs and lifecycle still belong to one run.
   */
  #process: ChildProcessWithoutNullStreams | null

  #checks: Check[] = []

  #stats = new RunStatsCollector()
  #statsInterval: NodeJS.Timeout | null = null
  #finished = false

  constructor(process: ChildProcessWithoutNullStreams | null) {
    super()

    this.#process = process

    this.on('done', this.#emitStop)
    this.on('abort', this.#emitStop)
    this.on('error', this.#emitStop)

    if (process === null) {
      // Nothing to wait for a spawn event from, so the run starts immediately.
      queueMicrotask(this.#handleStart)

      return
    }

    process.on('spawn', this.#handleStart)

    process.on('error', this.#handleError)

    process.on('close', this.#handleClose)

    readline.createInterface(process.stdout).on('line', (line) => {
      this.#consumeLine(line)
    })

    readline.createInterface(process.stderr).on('line', (line) => {
      const log = parseJsonAsSchema(line, LogEntrySchema)

      if (!log.success) {
        return
      }

      this.emit('log', { entry: log.data })
    })
  }

  /**
   * Completes a run with no local process, once the generators carrying it have
   * finished. `passed` is false when the run was cut short.
   */
  finish(passed: boolean) {
    if (this.#finished) {
      return
    }

    this.#finished = true

    this.emit('done', { result: { passed }, checks: this.#checks })
  }

  /**
   * Feeds one output line from a remote generator into the same pipeline as the
   * local process, so charts and logs cover the whole pool rather than only this
   * machine's share.
   */
  pushRemote(line: string, source: string, clockOffset: number) {
    this.#consumeLine(line, source, clockOffset)
  }

  #consumeLine(line: string, source = 'local', clockOffset = 0) {
    // Metric samples (`--out csv=-`) share stdout with the checks summary and
    // the end-of-test report, so consume them before parsing any JSON.
    if (this.#stats.push(line, source, clockOffset)) {
      return
    }

    if (line[0] !== '[' && line[0] !== '{') {
      return
    }

    const checks = parseJsonAsSchema(line, CheckArraySchema)

    if (checks.success) {
      this.#checks.push(...checks.data)

      return
    }

    const log = parseJsonAsSchema(line, LogEntrySchema)

    if (!log.success) {
      return
    }

    // Remote entries are tagged so a failure can be traced to the machine it
    // happened on instead of looking like a local one.
    this.emit('log', {
      entry:
        source === 'local'
          ? log.data
          : { ...log.data, msg: `[${source}] ${log.data.msg}` },
    })
  }

  isRunning(): boolean {
    if (this.#process === null) {
      return !this.#finished
    }

    return this.#process.pid != undefined && this.#process.exitCode === null
  }

  stop(): Promise<void> {
    const process = this.#process

    if (process === null) {
      // Only the generators are running; the caller aborts them. Marked finished
      // here so their streams closing afterwards cannot emit a second ending.
      this.#finished = true
      this.emit('abort', {})

      return Promise.resolve()
    }

    if (!this.isRunning()) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      process.once('close', resolve)

      process.kill()
    })
  }

  #handleStart = () => {
    this.#statsInterval = setInterval(this.#emitStats, STATS_INTERVAL)

    this.emit('start', {})
  }

  #emitStats = () => {
    if (!this.#stats.hasData) {
      return
    }

    this.emit('stats', { stats: this.#stats.snapshot() })
  }

  #handleError = (error: Error) => {
    this.emit('error', { error })
  }

  #handleClose = (code: number | null) => {
    this.#finished = true

    switch (code) {
      case ExitCode.Success:
        this.emit('done', {
          result: {
            passed: true,
          },
          checks: this.#checks,
        })
        break

      case ExitCode.ScriptAborted:
      case ExitCode.ThresholdsHaveFailed:
      case ExitCode.MarkedAsFailed:
        this.emit('done', {
          result: {
            passed: false,
          },
          checks: this.#checks,
        })

        break

      case ExitCode.ScriptStoppedFromRESTAPI:
      case ExitCode.ExternalAbort:
        this.emit('abort', {})
        break

      case ExitCode.GoPanic:
        this.#handleError(new Error('k6 runtime panic'))
        break

      default:
        this.#handleError(new Error(`k6 exited with unhandled code ${code}`))
        break
    }
  }

  #emitStop = () => {
    if (this.#statsInterval !== null) {
      clearInterval(this.#statsInterval)

      this.#statsInterval = null
    }

    this.#emitStats()

    this.emit('stop', undefined)
  }
}
