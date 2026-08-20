import { describe, expect, it } from 'vitest'

import { RunStatsCollector, parseCsvLine } from './stats'

// Captured from `k6 run --out csv=-` (k6 v2.1.0).
const HEADER =
  'metric_name,timestamp,metric_value,check,error,error_code,expected_response,group,method,name,proto,scenario,service,status,subproto,tls_version,url,extra_tags,metadata'

describe('parseCsvLine', () => {
  it('splits plain fields', () => {
    expect(parseCsvLine('http_reqs,1787214167,1.000000,,')).toEqual([
      'http_reqs',
      '1787214167',
      '1.000000',
      '',
      '',
    ])
  })

  it('keeps commas inside quoted fields', () => {
    const line =
      'http_reqs,1787214191,1.000000,,dial: connection refused,1212,false,,GET,"http://127.0.0.1:1/a,b?x=1,2",,default,,0,,,"http://127.0.0.1:1/a,b?x=1,2",,'

    const columns = parseCsvLine(line)

    expect(columns[9]).toBe('http://127.0.0.1:1/a,b?x=1,2')
    expect(columns[16]).toBe('http://127.0.0.1:1/a,b?x=1,2')
    expect(columns).toHaveLength(19)
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsvLine('a,"he said ""hi""",b')).toEqual([
      'a',
      'he said "hi"',
      'b',
    ])
  })
})

describe('RunStatsCollector', () => {
  it('ignores the header and non-metric output', () => {
    const collector = new RunStatsCollector()

    expect(collector.push(HEADER)).toBe(false)
    expect(collector.push('  http_reqs............: 1       293.42723/s')).toBe(
      false
    )
    expect(collector.push('{"level":"info","msg":"hello"}')).toBe(false)
    expect(collector.hasData).toBe(false)
  })

  it('buckets samples per second', () => {
    const collector = new RunStatsCollector()

    collector.push('vus,100,2.000000,,,,,,,,,default,,,,,,,')
    collector.push(
      'http_reqs,100,1.000000,,,,true,,GET,https://a/,,default,,200,,,https://a/,,'
    )
    collector.push(
      'http_reqs,100,1.000000,,,,true,,GET,https://a/,,default,,200,,,https://a/,,'
    )
    collector.push(
      'http_req_duration,100,10.000000,,,,true,,GET,https://a/,,default,,200,,,https://a/,,'
    )
    collector.push(
      'http_req_duration,100,30.000000,,,,true,,GET,https://a/,,default,,200,,,https://a/,,'
    )
    collector.push('data_received,100,2048.000000,,,,,,,,,default,,,,,,,')
    collector.push(
      'http_reqs,101,1.000000,,,,true,,GET,https://a/,,default,,200,,,https://a/,,'
    )

    const stats = collector.snapshot()

    expect(stats.buckets).toEqual([
      {
        time: 100,
        vus: 2,
        requests: 2,
        failed: 0,
        duration: 20,
        throughput: 2048,
      },
      { time: 101, vus: 0, requests: 1, failed: 0, duration: 0, throughput: 0 },
    ])
    expect(stats.requests).toBe(3)
    expect(stats.avgDuration).toBe(20)
    expect(stats.maxDuration).toBe(30)
    expect(stats.vus).toBe(2)
    expect(stats.dataReceived).toBe(2048)
  })

  it('groups errors by code, message and url', () => {
    const collector = new RunStatsCollector()

    const refused =
      'http_reqs,100,1.000000,,dial: connection refused,1212,false,,GET,http://a/,,default,,0,,,http://a/,,'
    const dns =
      'http_reqs,100,1.000000,,lookup: no such host,1101,false,,GET,http://b/,,default,,0,,,http://b/,,'

    collector.push(refused)
    collector.push(refused)
    collector.push(dns)
    collector.push(
      'http_req_failed,100,1.000000,,,,false,,GET,http://a/,,default,,0,,,http://a/,,'
    )

    const stats = collector.snapshot()

    expect(stats.errors).toEqual([
      {
        code: '1212',
        message: 'dial: connection refused',
        url: 'http://a/',
        count: 2,
      },
      {
        code: '1101',
        message: 'lookup: no such host',
        url: 'http://b/',
        count: 1,
      },
    ])
    expect(stats.failedRequests).toBe(1)
  })

  it('reports group duration per transaction', () => {
    const collector = new RunStatsCollector()

    collector.push(
      'group_duration,100,858.018583,,,,,::1_Trans_TrangChu,,,,default,,,,,,,'
    )
    collector.push(
      'group_duration,101,142.000000,,,,,::1_Trans_TrangChu,,,,default,,,,,,,'
    )
    collector.push(
      'group_duration,101,275.958875,,,,,::2_Trans_Contacts,,,,default,,,,,,,'
    )

    expect(collector.snapshot().groups).toEqual([
      { name: '1_Trans_TrangChu', count: 2, avg: 500.0092915, max: 858.018583 },
      { name: '2_Trans_Contacts', count: 1, avg: 275.958875, max: 275.958875 },
    ])
  })

  it('counts checks and iterations', () => {
    const collector = new RunStatsCollector()

    collector.push('checks,100,1.000000,ok,,,,,,,,default,,,,,,,')
    collector.push('checks,100,0.000000,ok,,,,,,,,default,,,,,,,')
    collector.push('iterations,100,1.000000,,,,,,,,,default,,,,,,,')

    const stats = collector.snapshot()

    expect(stats.checksPassed).toBe(1)
    expect(stats.checksFailed).toBe(1)
    expect(stats.iterations).toBe(1)
  })
})
