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
} as const

// ponytail: keeps ~5 minutes of history at one bucket per second. Bump (or
// downsample) if the charts ever need to span a whole test run.
const MAX_BUCKETS = 300

// ponytail: guards against a script that generates unbounded distinct errors.
const MAX_ERRORS = 100

// ponytail: same guard for scripts hitting URLs with unbounded path segments.
const MAX_REQUESTS = 200

export interface RunErrorGroup {
  code: string
  message: string
  url: string
  /** The `group()` the failing request ran in, empty outside any group. */
  group: string
  count: number
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
}

export interface CheckStats {
  name: string
  /** The `group()` the check ran in, empty outside any group. */
  group: string
  passes: number
  fails: number
}

export interface GroupSample {
  /** Unix timestamp in seconds. */
  time: number
  /** Average `group_duration` during that second, in milliseconds. */
  value: number
}

export interface GroupStats {
  name: string
  /** Completed executions of the group — `group_duration` samples. */
  count: number
  /**
   * Failed requests and checks tagged with this group. k6 has no per-execution
   * verdict for a group, so this is an attribution, not an exact failure count:
   * one execution failing three requests counts as three.
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
  vus: number
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
}

interface MutableGroup {
  count: number
  sum: number
  /** Sum of squares, so the standard deviation needs no sample history. */
  squares: number
  max: number
  min: number
  last: number
  failed: number
  series: Map<number, { sum: number; count: number }>
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

  #firstTime: number | null = null
  #lastTime = 0
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
   */
  push(line: string): boolean {
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
    const time = Number(columns[COLUMN.timestamp])
    const value = Number(columns[COLUMN.value])

    if (!Number.isFinite(time) || !Number.isFinite(value)) {
      return false
    }

    this.#firstTime ??= time
    this.#lastTime = Math.max(this.#lastTime, time)

    const bucket = this.#bucket(time)

    switch (metric) {
      case 'vus':
        bucket.vus = value
        this.#vus = value
        this.#vusMax = Math.max(this.#vusMax, value)
        break

      case 'vus_max':
        this.#vusMax = Math.max(this.#vusMax, value)
        break

      case 'http_reqs':
        bucket.requests += value
        this.#requests += value
        this.#collectError(columns)
        this.#request(columns, (request) => {
          request.count += 1
        })
        break

      case 'http_req_failed':
        if (value === 1) {
          bucket.failed += 1
          this.#failedRequests += 1
          this.#failGroup(columns[COLUMN.group] ?? '')
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
        this.#request(columns, (request) => {
          request.sum += value
          request.max = Math.max(request.max, value)
        })
        break

      case 'data_received':
        bucket.throughput += value
        this.#dataReceived += value
        break

      case 'iterations':
        this.#iterations += value
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
          this.#failGroup(columns[COLUMN.group] ?? '')
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

    const groups = [...this.#groups.entries()]
      .map<GroupStats>(([name, group]) => {
        const avg = group.count ? group.sum / group.count : 0

        return {
          name,
          count: group.count,
          failed: group.failed,
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
            })),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    const requestStats = [...this.#requestStats.values()]
      .map<RequestStats>((request) => ({
        method: request.method,
        name: request.name,
        status: request.status,
        group: request.group,
        count: request.count,
        failed: request.failed,
        // `http_reqs` and `http_req_duration` are emitted per request, so the
        // duration sample count matches `count` — except for a request still in
        // flight when the snapshot is taken.
        avg: request.count ? request.sum / request.count : 0,
        max: request.max,
      }))
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
    }
  }

  #bucket(time: number): MutableBucket {
    const existing = this.#buckets.get(time)

    if (existing) {
      return existing
    }

    const bucket: MutableBucket = {
      time,
      vus: 0,
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
    const key = `${code}|${message}|${url}|${group}`
    const existing = this.#errors.get(key)

    if (existing) {
      existing.count += 1

      return
    }

    if (this.#errors.size >= MAX_ERRORS) {
      return
    }

    this.#errors.set(key, { code, message, url, group, count: 1 })
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
    const key = `${group}|${name}`
    const existing = this.#checkResults.get(key)

    if (existing) {
      existing.passes += passed ? 1 : 0
      existing.fails += passed ? 0 : 1

      return
    }

    this.#checkResults.set(key, {
      name,
      group,
      passes: passed ? 1 : 0,
      fails: passed ? 0 : 1,
    })
  }

  #failGroup(rawName: string) {
    const name = groupName(rawName)

    if (name === '') {
      return
    }

    this.#group(name).failed += 1
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
      failed: 0,
      series: new Map(),
    }

    this.#groups.set(name, group)

    return group
  }
}

const KNOWN_METRICS = new Set([
  'vus',
  'vus_max',
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
