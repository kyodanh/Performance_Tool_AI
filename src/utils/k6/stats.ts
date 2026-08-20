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
  error: 4,
  errorCode: 5,
  group: 7,
  name: 9,
  url: 16,
} as const

// ponytail: keeps ~5 minutes of history at one bucket per second. Bump (or
// downsample) if the charts ever need to span a whole test run.
const MAX_BUCKETS = 300

// ponytail: guards against a script that generates unbounded distinct errors.
const MAX_ERRORS = 100

export interface RunErrorGroup {
  code: string
  message: string
  url: string
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

export interface GroupStats {
  name: string
  count: number
  avg: number
  max: number
}

export interface RunStats {
  buckets: StatsBucket[]
  vus: number
  vusMax: number
  requests: number
  failedRequests: number
  iterations: number
  checksPassed: number
  checksFailed: number
  dataReceived: number
  avgDuration: number
  maxDuration: number
  groups: GroupStats[]
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

interface MutableGroup {
  count: number
  sum: number
  max: number
}

export class RunStatsCollector {
  #buckets = new Map<number, MutableBucket>()
  #groups = new Map<string, MutableGroup>()
  #errors = new Map<string, RunErrorGroup>()

  #vus = 0
  #vusMax = 0
  #requests = 0
  #failedRequests = 0
  #iterations = 0
  #checksPassed = 0
  #checksFailed = 0
  #dataReceived = 0
  #durationSum = 0
  #durationCount = 0
  #maxDuration = 0

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
        break

      case 'http_req_failed':
        if (value === 1) {
          bucket.failed += 1
          this.#failedRequests += 1
        }
        break

      case 'http_req_duration':
        bucket.durationSum += value
        bucket.durationCount += 1
        this.#durationSum += value
        this.#durationCount += 1
        this.#maxDuration = Math.max(this.#maxDuration, value)
        break

      case 'data_received':
        bucket.throughput += value
        this.#dataReceived += value
        break

      case 'iterations':
        this.#iterations += value
        break

      case 'checks':
        if (value === 1) {
          this.#checksPassed += 1
        } else {
          this.#checksFailed += 1
        }
        break

      case 'group_duration':
        this.#collectGroup(columns[COLUMN.group] ?? '', value)
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
      .map<GroupStats>(([name, group]) => ({
        name,
        count: group.count,
        avg: group.sum / group.count,
        max: group.max,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return {
      buckets,
      groups,
      vus: this.#vus,
      vusMax: this.#vusMax,
      requests: this.#requests,
      failedRequests: this.#failedRequests,
      iterations: this.#iterations,
      checksPassed: this.#checksPassed,
      checksFailed: this.#checksFailed,
      dataReceived: this.#dataReceived,
      avgDuration: this.#durationCount
        ? this.#durationSum / this.#durationCount
        : 0,
      maxDuration: this.#maxDuration,
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
    const key = `${code}|${message}|${url}`
    const existing = this.#errors.get(key)

    if (existing) {
      existing.count += 1

      return
    }

    if (this.#errors.size >= MAX_ERRORS) {
      return
    }

    this.#errors.set(key, { code, message, url, count: 1 })
  }

  #collectGroup(rawName: string, value: number) {
    // k6 reports groups as a `::`-delimited path, e.g. `::checkout::login`.
    const name = rawName.replace(/^::/, '').replaceAll('::', ' / ')

    if (name === '') {
      return
    }

    const existing = this.#groups.get(name)

    if (!existing) {
      this.#groups.set(name, { count: 1, sum: value, max: value })

      return
    }

    existing.count += 1
    existing.sum += value
    existing.max = Math.max(existing.max, value)
  }
}

const KNOWN_METRICS = new Set([
  'vus',
  'vus_max',
  'http_reqs',
  'http_req_failed',
  'http_req_duration',
  'data_received',
  'iterations',
  'checks',
  'group_duration',
])
