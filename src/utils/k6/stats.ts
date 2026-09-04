/**
 * Aggregates the CSV metric stream produced by `k6 run --out csv=-` into
 * per-second buckets, cumulative totals and an error breakdown.
 *
 * The CSV header k6 emits is fixed:
 *
 *   metric_name,timestamp,metric_value,check,error,error_code,expected_response,
 *   group,method,name,proto,scenario,service,status,subproto,tls_version,url,
 *   extra_tags,metadata
 */

const COLUMN = {
  metric: 0,
  timestamp: 1,
  value: 2,
  check: 3,
  error: 4,
  errorCode: 5,
  group: 7,
  method: 8,
  name: 9,
  status: 13,
  url: 16,
  extraTags: 17,
} as const

// ponytail: keeps ~5 minutes of history at one bucket per second. Bump (or
// downsample) if the charts ever need to span a whole test run.
const MAX_BUCKETS = 300

// ponytail: guards against a script that generates unbounded distinct errors.
const MAX_ERRORS = 100

// ponytail: same guard for scripts hitting URLs with unbounded path segments.
const MAX_REQUESTS = 200

// ponytail: enough distinct rows to see the pattern without one broken run
// growing the list unbounded.
const MAX_DATA_ROWS = 5

/** The tag `generateDataRowTag` sets, naming the data-file row of the iteration. */
const DATA_ROW_TAG = 'data_row='

/**
 * k6 joins a sample's non-system tags into one `extra_tags` field as
 * `key=value&key=value`. Values are not escaped, so a `&` inside another tag
 * would split wrong — acceptable here, since `data_row` holds `file=index`.
 */
function dataRowTag(extraTags: string) {
  const tag = extraTags
    .split('&')
    .find((entry) => entry.startsWith(DATA_ROW_TAG))

  return tag?.slice(DATA_ROW_TAG.length) ?? ''
}

export interface RunErrorGroup {
  code: string
  message: string
  url: string
  /** The `group()` the failing request ran in, empty outside any group. */
  group: string
  count: number
  /**
   * Data-file rows seen failing, as `file=index` — the first
   * `MAX_DATA_ROWS` distinct ones, empty when the script uses no data file.
   */
  dataRows: string[]
}

export interface StatsBucket {
  /** Unix timestamp in seconds. */
  time: number
  vus: number
  requests: number
  failed: number
  /** Average `http_req_duration` in milliseconds. */
  duration: number
  /** Bytes received during this second. */
  throughput: number
}

export interface RequestStats {
  method: string
  /** The request name — the URL, or the `name` tag when the script sets one. */
  name: string
  status: string
  /** The `group()` the request ran in, empty outside any group. */
  group: string
  count: number
  failed: number
  avg: number
  max: number
  /** Fastest `http_req_duration` sample, in milliseconds. */
  min: number
  /** Sum of `http_req_duration`, in milliseconds — the report's "Total". */
  total: number
  /** Population standard deviation of `http_req_duration`, in milliseconds. */
  std: number
  /**
   * Sum of `http_req_waiting` (time to first byte) in milliseconds — the time
   * the server itself spent, which the report ranks URLs by.
   */
  serverTime: number
}

export interface CheckStats {
  name: string
  /** The `group()` the check ran in, empty outside any group. */
  group: string
  /**
   * The request the check ran against, from the `name` tag the generated
   * script puts on the `check()` call. Empty for a hand-written check that
   * carries no tag — k6 attaches no request context to a check sample on its
   * own, so without the tag there is no way back to the request.
   */
  request: string
  passes: number
  fails: number
}

export interface GroupSample {
  /** Unix timestamp in seconds. */
  time: number
  /** Average `group_duration` during that second, in milliseconds. */
  value: number
  /** Executions of the group that finished during that second. */
  count: number
}

export interface GroupStats {
  name: string
  /** Completed executions of the group — `group_duration` samples. */
  count: number
  /**
   * Failed executions attributed to this group. k6 has no per-execution verdict
   * for a group, so this is an attribution, not an exact count: it is the
   * larger of the failed requests and the failed checks tagged with the group,
   * because a failing request normally fails its check too and summing the two
   * would report every failure twice.
   */
  failed: number
  avg: number
  max: number
  min: number
  /** Population standard deviation of `group_duration`, in milliseconds. */
  std: number
  /** The most recent `group_duration` sample, as a controller reports "Last". */
  last: number
  /** Per-second averages, for the response-time-over-time chart. */
  series: GroupSample[]
}

/**
 * Where `http_req_duration` actually goes, broken out into k6's request
 * phases — averaged in milliseconds across the whole run. `waiting` is time to
 * first byte on the server; the others (`blocked`, `connecting`,
 * `tlsHandshaking`, `sending`) are spent setting up or writing the request and
 * point at the client/network rather than the server.
 */
export interface RequestTimingBreakdown {
  blocked: number
  connecting: number
  tlsHandshaking: number
  sending: number
  waiting: number
  receiving: number
}

export interface RunStats {
  buckets: StatsBucket[]
  /** Seconds between the first and the newest sample seen. */
  elapsed: number
  /** Newest `vus` gauge tick — on a finished run, the shutdown tail. */
  vus: number
  /**
   * Peak concurrency actually observed. Deliberately not k6's `vus_max`, which
   * is the preallocated pool size and stays flat at the configured ceiling.
   */
  vusMax: number
  requests: number
  failedRequests: number
  iterations: number
  /**
   * Iterations k6 couldn't start because the client ran out of headroom for
   * the configured arrival rate — a sign the run is limited by the machine
   * running k6, not by the target.
   */
  droppedIterations: number
  checksPassed: number
  checksFailed: number
  dataReceived: number
  avgDuration: number
  maxDuration: number
  timings: RequestTimingBreakdown
  groups: GroupStats[]
  /** Per-request breakdown, one row per method + name + status. */
  requestStats: RequestStats[]
  checks: CheckStats[]
  errors: RunErrorGroup[]
  /**
   * Per-machine breakdown of a distributed run: one row per generator that
   * reported samples, `local` being this machine. A run carried by this machine
   * alone has a single row.
   */
  generators: GeneratorStats[]
}

/**
 * Whether the per-machine breakdown says anything the totals do not: more than
 * one machine reported, or the only one that did was not this machine.
 */
export function isDistributedRun(generators: GeneratorStats[]) {
  return (
    generators.length > 1 ||
    generators.some((generator) => generator.source !== LOCAL_SOURCE)
  )
}

/** The source tag k6 output from this machine carries. */
export const LOCAL_SOURCE = 'local'

/** What one load generator contributed to the run. */
export interface GeneratorStats {
  /** `local` for this machine, otherwise the generator's hostname. */
  source: string
  vus: number
  vusMax: number
  requests: number
  failedRequests: number
  iterations: number
  dataReceived: number
  avgDuration: number
  maxDuration: number
}

/**
 * The run's headline numbers, without the per-sample series — small enough to
 * hand to an LLM as context.
 */
export function runSummary(stats: RunStats | null) {
  if (stats === null) {
    return undefined
  }

  const {
    buckets: _b,
    groups: _g,
    requestStats: _r,
    checks: _c,
    errors: _e,
    ...summary
  } = stats

  return summary
}

/**
 * Splits a single CSV record. k6 quotes any field containing a comma or a
 * quote (Go's `encoding/csv`), so a plain `split(',')` mangles URLs and error
 * messages.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []

  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (quoted) {
      if (char !== '"') {
        field += char
        continue
      }

      if (line[i + 1] === '"') {
        field += '"'
        i++
        continue
      }

      quoted = false
      continue
    }

    if (char === '"') {
      quoted = true
      continue
    }

    if (char === ',') {
      fields.push(field)
      field = ''
      continue
    }

    field += char
  }

  fields.push(field)

  return fields
}

interface MutableBucket {
  time: number
  /**
   * VUs reported by each generator during this second. `vus` is a gauge, so a
   * distributed run has to sum the sources — overwriting would show only
   * whichever generator reported last.
   */
  vusBySource: Map<string, number>
  vus: number
  requests: number
  failed: number
  durationSum: number
  durationCount: number
  throughput: number
}

interface MutableRequest {
  method: string
  name: string
  status: string
  group: string
  count: number
  failed: number
  sum: number
  max: number
  min: number
  /** Sum of squares, so the standard deviation needs no sample history. */
  squares: number
  waiting: number
}

interface MutableGroup {
  count: number
  sum: number
  /** Sum of squares, so the standard deviation needs no sample history. */
  squares: number
  max: number
  min: number
  last: number
  failedRequests: number
  failedChecks: number
  series: Map<number, { sum: number; count: number }>
}

interface MutableGenerator {
  vus: number
  vusMax: number
  requests: number
  failedRequests: number
  iterations: number
  dataReceived: number
  durationSum: number
  durationCount: number
  maxDuration: number
}

function sum(values: Map<string, number>): number {
  let total = 0

  for (const value of values.values()) {
    total += value
  }

  return total
}

/** k6 reports groups as a `::`-delimited path, e.g. `::checkout::login`. */
function groupName(raw: string) {
  return raw.replace(/^::/, '').replaceAll('::', ' / ')
}

export class RunStatsCollector {
  #buckets = new Map<number, MutableBucket>()
  #groups = new Map<string, MutableGroup>()
  #requestStats = new Map<string, MutableRequest>()
  #checkResults = new Map<string, CheckStats>()
  #errors = new Map<string, RunErrorGroup>()
  #generators = new Map<string, MutableGenerator>()

  #firstTime: number | null = null
  #lastTime = 0
  #vusBySource = new Map<string, number>()
  #vus = 0
  #vusMax = 0
  #requests = 0
  #failedRequests = 0
  #iterations = 0
  #droppedIterations = 0
  #checksPassed = 0
  #checksFailed = 0
  #dataReceived = 0
  #durationSum = 0
  #durationCount = 0
  #maxDuration = 0

  #timingSums: RequestTimingBreakdown = {
    blocked: 0,
    connecting: 0,
    tlsHandshaking: 0,
    sending: 0,
    waiting: 0,
    receiving: 0,
  }
  #timingCounts: RequestTimingBreakdown = {
    blocked: 0,
    connecting: 0,
    tlsHandshaking: 0,
    sending: 0,
    waiting: 0,
    receiving: 0,
  }

  get hasData() {
    return this.#buckets.size > 0
  }

  /**
   * Consumes one line of k6 output. Returns `true` when the line was a metric
   * sample, so callers can skip further parsing.
   *
   * `source` identifies the generator the line came from — gauges are summed
   * per source rather than overwritten. `clockOffset` is added to every
   * timestamp, so a generator whose clock runs behind still lands in the right
   * per-second bucket.
   */
  push(line: string, source = 'local', clockOffset = 0): boolean {
    const separator = line.indexOf(',')

    if (separator === -1) {
      return false
    }

    const metric = line.slice(0, separator)

    if (!KNOWN_METRICS.has(metric)) {
      return false
    }

    // ponytail: one full split per sample. Cheaper than JSON.parse but still
    // the hot path — switch to offset scanning if it ever shows up in a profile.
    const columns = parseCsvLine(line)
    const time = Number(columns[COLUMN.timestamp]) + clockOffset
    const value = Number(columns[COLUMN.value])

    if (!Number.isFinite(time) || !Number.isFinite(value)) {
      return false
    }

    this.#firstTime ??= time
    this.#lastTime = Math.max(this.#lastTime, time)

    const bucket = this.#bucket(time)
    const generator = this.#generator(source)

    switch (metric) {
      case 'vus':
        bucket.vusBySource.set(source, value)
        bucket.vus = sum(bucket.vusBySource)

        this.#vusBySource.set(source, value)
        this.#vus = sum(this.#vusBySource)
        this.#vusMax = Math.max(this.#vusMax, this.#vus)

        generator.vus = value
        generator.vusMax = Math.max(generator.vusMax, value)
        break

      case 'http_reqs':
        bucket.requests += value
        this.#requests += value
        generator.requests += value
        this.#collectError(columns)
        this.#request(columns, (request) => {
          request.count += 1
        })
        break

      case 'http_req_failed':
        if (value === 1) {
          bucket.failed += 1
          this.#failedRequests += 1
          generator.failedRequests += 1
          this.#failGroup(columns[COLUMN.group] ?? '', 'request')
          this.#request(columns, (request) => {
            request.failed += 1
          })
        }
        break

      case 'http_req_duration':
        bucket.durationSum += value
        bucket.durationCount += 1
        this.#durationSum += value
        this.#durationCount += 1
        this.#maxDuration = Math.max(this.#maxDuration, value)
        generator.durationSum += value
        generator.durationCount += 1
        generator.maxDuration = Math.max(generator.maxDuration, value)
        this.#request(columns, (request) => {
          request.sum += value
          request.squares += value * value
          request.max = Math.max(request.max, value)
          request.min = Math.min(request.min, value)
        })
        break

      case 'data_received':
        bucket.throughput += value
        this.#dataReceived += value
        generator.dataReceived += value
        break

      case 'iterations':
        this.#iterations += value
        generator.iterations += value
        break

      case 'dropped_iterations':
        this.#droppedIterations += value
        break

      case 'http_req_blocked':
        this.#timingSums.blocked += value
        this.#timingCounts.blocked += 1
        break

      case 'http_req_connecting':
        this.#timingSums.connecting += value
        this.#timingCounts.connecting += 1
        break

      case 'http_req_tls_handshaking':
        this.#timingSums.tlsHandshaking += value
        this.#timingCounts.tlsHandshaking += 1
        break

      case 'http_req_sending':
        this.#timingSums.sending += value
        this.#timingCounts.sending += 1
        break

      case 'http_req_waiting':
        this.#timingSums.waiting += value
        this.#timingCounts.waiting += 1
        this.#request(columns, (request) => {
          request.waiting += value
        })
        break

      case 'http_req_receiving':
        this.#timingSums.receiving += value
        this.#timingCounts.receiving += 1
        break

      case 'checks':
        if (value === 1) {
          this.#checksPassed += 1
        } else {
          this.#checksFailed += 1
          this.#failGroup(columns[COLUMN.group] ?? '', 'check')
        }

        this.#collectCheck(columns, value === 1)
        break

      case 'group_duration':
        this.#collectGroup(columns[COLUMN.group] ?? '', value, time)
        break
    }

    return true
  }

  snapshot(): RunStats {
    const buckets = [...this.#buckets.values()]
      .sort((a, b) => a.time - b.time)
      .map<StatsBucket>((bucket) => ({
        time: bucket.time,
        vus: bucket.vus,
        requests: bucket.requests,
        failed: bucket.failed,
        duration: bucket.durationCount
          ? bucket.durationSum / bucket.durationCount
          : 0,
        throughput: bucket.throughput,
      }))

    // ponytail: insertion order is first-touch order, which follows the
    // script's own group() sequence — keep it so the table reads like the
    // controller. Nested groups close before their parent, so they land first.
    const groups = [...this.#groups.entries()].map<GroupStats>(
      ([name, group]) => {
        const avg = group.count ? group.sum / group.count : 0

        return {
          name,
          count: group.count,
          failed: Math.max(group.failedRequests, group.failedChecks),
          avg,
          max: group.max,
          min: group.count ? group.min : 0,
          // Rounding can push the variance a hair below zero on a constant
          // series, and `sqrt` of that is NaN.
          std: group.count
            ? Math.sqrt(Math.max(0, group.squares / group.count - avg * avg))
            : 0,
          last: group.last,
          series: [...group.series.entries()]
            .sort(([a], [b]) => a - b)
            .map<GroupSample>(([time, bucket]) => ({
              time,
              value: bucket.sum / bucket.count,
              count: bucket.count,
            })),
        }
      }
    )

    const requestStats = [...this.#requestStats.values()]
      .map<RequestStats>((request) => {
        // `http_reqs` and `http_req_duration` are emitted per request, so the
        // duration sample count matches `count` — except for a request still in
        // flight when the snapshot is taken.
        const avg = request.count ? request.sum / request.count : 0

        return {
          method: request.method,
          name: request.name,
          status: request.status,
          group: request.group,
          count: request.count,
          failed: request.failed,
          avg,
          max: request.max,
          // `min` only moves on a duration sample, which a request that never
          // got a response never emits — `count` alone is not proof of one.
          min: Number.isFinite(request.min) ? request.min : 0,
          total: request.sum,
          // Rounding can push the variance a hair below zero on a constant
          // series, and `sqrt` of that is NaN.
          std: request.count
            ? Math.sqrt(
                Math.max(0, request.squares / request.count - avg * avg)
              )
            : 0,
          serverTime: request.waiting,
        }
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    const checks = [...this.#checkResults.values()].sort(
      (a, b) => b.fails - a.fails || a.name.localeCompare(b.name)
    )

    const phaseAvg = (phase: keyof RequestTimingBreakdown) =>
      this.#timingCounts[phase]
        ? this.#timingSums[phase] / this.#timingCounts[phase]
        : 0

    return {
      buckets,
      groups,
      requestStats,
      checks,
      elapsed: this.#firstTime === null ? 0 : this.#lastTime - this.#firstTime,
      vus: this.#vus,
      vusMax: this.#vusMax,
      requests: this.#requests,
      failedRequests: this.#failedRequests,
      iterations: this.#iterations,
      droppedIterations: this.#droppedIterations,
      checksPassed: this.#checksPassed,
      checksFailed: this.#checksFailed,
      dataReceived: this.#dataReceived,
      avgDuration: this.#durationCount
        ? this.#durationSum / this.#durationCount
        : 0,
      maxDuration: this.#maxDuration,
      timings: {
        blocked: phaseAvg('blocked'),
        connecting: phaseAvg('connecting'),
        tlsHandshaking: phaseAvg('tlsHandshaking'),
        sending: phaseAvg('sending'),
        waiting: phaseAvg('waiting'),
        receiving: phaseAvg('receiving'),
      },
      errors: [...this.#errors.values()].sort((a, b) => b.count - a.count),
      generators: [...this.#generators.entries()]
        .map<GeneratorStats>(([source, generator]) => ({
          source,
          vus: generator.vus,
          vusMax: generator.vusMax,
          requests: generator.requests,
          failedRequests: generator.failedRequests,
          iterations: generator.iterations,
          dataReceived: generator.dataReceived,
          avgDuration: generator.durationCount
            ? generator.durationSum / generator.durationCount
            : 0,
          maxDuration: generator.maxDuration,
        }))
        .sort(
          (a, b) => b.requests - a.requests || a.source.localeCompare(b.source)
        ),
    }
  }

  #generator(source: string): MutableGenerator {
    const existing = this.#generators.get(source)

    if (existing) {
      return existing
    }

    const generator: MutableGenerator = {
      vus: 0,
      vusMax: 0,
      requests: 0,
      failedRequests: 0,
      iterations: 0,
      dataReceived: 0,
      durationSum: 0,
      durationCount: 0,
      maxDuration: 0,
    }

    this.#generators.set(source, generator)

    return generator
  }

  #bucket(time: number): MutableBucket {
    const existing = this.#buckets.get(time)

    if (existing) {
      return existing
    }

    const bucket: MutableBucket = {
      time,
      // ponytail: vus is a gauge k6 samples ~once a second; seconds a sample
      // misses inherit the last known value instead of reading as zero VUs.
      vusBySource: new Map(this.#vusBySource),
      vus: this.#vus,
      requests: 0,
      failed: 0,
      durationSum: 0,
      durationCount: 0,
      throughput: 0,
    }

    this.#buckets.set(time, bucket)

    // k6 flushes in timestamp order, so the first key is always the oldest.
    while (this.#buckets.size > MAX_BUCKETS) {
      const [oldest] = this.#buckets.keys()

      if (oldest === undefined) {
        break
      }

      this.#buckets.delete(oldest)
    }

    return bucket
  }

  #collectError(columns: string[]) {
    const code = columns[COLUMN.errorCode] ?? ''
    const message = columns[COLUMN.error] ?? ''

    if (code === '' && message === '') {
      return
    }

    const url = columns[COLUMN.name] || columns[COLUMN.url] || ''
    const group = groupName(columns[COLUMN.group] ?? '')
    const dataRow = dataRowTag(columns[COLUMN.extraTags] ?? '')
    const key = `${code}|${message}|${url}|${group}`
    const existing = this.#errors.get(key)

    if (existing) {
      existing.count += 1

      // The row stays out of the key: grouping by it would turn one broken
      // request into a row per iteration.
      if (
        dataRow !== '' &&
        existing.dataRows.length < MAX_DATA_ROWS &&
        !existing.dataRows.includes(dataRow)
      ) {
        existing.dataRows.push(dataRow)
      }

      return
    }

    if (this.#errors.size >= MAX_ERRORS) {
      return
    }

    this.#errors.set(key, {
      code,
      message,
      url,
      group,
      count: 1,
      dataRows: dataRow === '' ? [] : [dataRow],
    })
  }

  #collectGroup(rawName: string, value: number, time: number) {
    const name = groupName(rawName)

    if (name === '') {
      return
    }

    const group = this.#group(name)

    group.count += 1
    group.sum += value
    group.squares += value * value
    group.max = Math.max(group.max, value)
    group.min = Math.min(group.min, value)
    group.last = value

    const sample = group.series.get(time)

    if (sample) {
      sample.sum += value
      sample.count += 1
    } else {
      group.series.set(time, { sum: value, count: 1 })
    }

    // Same window the buckets keep, so the chart's x axis stays aligned.
    while (group.series.size > MAX_BUCKETS) {
      const [oldest] = group.series.keys()

      if (oldest === undefined) {
        break
      }

      group.series.delete(oldest)
    }
  }

  /**
   * Applies `update` to the per-request row the sample belongs to. Rows are keyed
   * by status too, so the same endpoint answering 200 and 401 shows as two rows.
   */
  #request(columns: string[], update: (request: MutableRequest) => void) {
    const name = columns[COLUMN.name] || columns[COLUMN.url] || ''

    if (name === '') {
      return
    }

    const method = columns[COLUMN.method] ?? ''
    const status = columns[COLUMN.status] ?? ''
    const group = groupName(columns[COLUMN.group] ?? '')
    const key = `${group}|${method}|${name}|${status}`
    const existing = this.#requestStats.get(key)

    if (existing) {
      update(existing)

      return
    }

    if (this.#requestStats.size >= MAX_REQUESTS) {
      return
    }

    const request: MutableRequest = {
      method,
      name,
      status,
      group,
      count: 0,
      failed: 0,
      sum: 0,
      max: 0,
      min: Infinity,
      squares: 0,
      waiting: 0,
    }

    update(request)

    this.#requestStats.set(key, request)
  }

  #collectCheck(columns: string[], passed: boolean) {
    const name = columns[COLUMN.check] ?? ''

    if (name === '') {
      return
    }

    const group = groupName(columns[COLUMN.group] ?? '')
    const request = columns[COLUMN.name] ?? ''
    // Keyed by request too, so the same check reused across requests reports
    // per request instead of collapsing into one row.
    const key = `${group}|${name}|${request}`
    const existing = this.#checkResults.get(key)

    if (existing) {
      existing.passes += passed ? 1 : 0
      existing.fails += passed ? 0 : 1

      return
    }

    this.#checkResults.set(key, {
      name,
      group,
      request,
      passes: passed ? 1 : 0,
      fails: passed ? 0 : 1,
    })
  }

  #failGroup(rawName: string, kind: 'request' | 'check') {
    const name = groupName(rawName)

    if (name === '') {
      return
    }

    const group = this.#group(name)

    if (kind === 'request') {
      group.failedRequests += 1
    } else {
      group.failedChecks += 1
    }
  }

  #group(name: string): MutableGroup {
    const existing = this.#groups.get(name)

    if (existing) {
      return existing
    }

    const group: MutableGroup = {
      count: 0,
      sum: 0,
      squares: 0,
      max: 0,
      min: Infinity,
      last: 0,
      failedRequests: 0,
      failedChecks: 0,
      series: new Map(),
    }

    this.#groups.set(name, group)

    return group
  }
}

const KNOWN_METRICS = new Set([
  'vus',
  'http_reqs',
  'http_req_failed',
  'http_req_duration',
  'http_req_blocked',
  'http_req_connecting',
  'http_req_tls_handshaking',
  'http_req_sending',
  'http_req_waiting',
  'http_req_receiving',
  'data_received',
  'iterations',
  'dropped_iterations',
  'checks',
  'group_duration',
])
