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
        group: '',
        count: 2,
      },
      {
        code: '1101',
        message: 'lookup: no such host',
        url: 'http://b/',
        group: '',
        count: 1,
      },
    ])
    expect(stats.failedRequests).toBe(1)
  })

  it('breaks requests down by method, name and status', () => {
    const collector = new RunStatsCollector()

    const ok =
      'http_reqs,100,1.000000,,,,true,::1_Trans_Home,GET,https://a/,,default,,200,,,https://a/,,'
    const unauthorized =
      'http_reqs,100,1.000000,,,1401,false,::1_Trans_Home,GET,https://a/,,default,,401,,,https://a/,,'

    collector.push(ok)
    collector.push(ok)
    collector.push(unauthorized)
    collector.push(
      'http_req_failed,100,1.000000,,,1401,false,::1_Trans_Home,GET,https://a/,,default,,401,,,https://a/,,'
    )
    collector.push(
      'http_req_duration,100,20.000000,,,,true,::1_Trans_Home,GET,https://a/,,default,,200,,,https://a/,,'
    )
    collector.push(
      'http_req_duration,100,40.000000,,,,true,::1_Trans_Home,GET,https://a/,,default,,200,,,https://a/,,'
    )

    expect(collector.snapshot().requestStats).toEqual([
      {
        method: 'GET',
        name: 'https://a/',
        status: '200',
        group: '1_Trans_Home',
        count: 2,
        failed: 0,
        avg: 30,
        max: 40,
      },
      {
        method: 'GET',
        name: 'https://a/',
        status: '401',
        group: '1_Trans_Home',
        count: 1,
        failed: 1,
        avg: 0,
        max: 0,
      },
    ])
  })

  it('tags errors with the group they happened in', () => {
    const collector = new RunStatsCollector()

    collector.push(
      'http_reqs,100,1.000000,,lookup: no such host,1101,false,::3_Trans_Broken,GET,http://b/,,default,,0,,,http://b/,,'
    )

    expect(collector.snapshot().errors).toEqual([
      {
        code: '1101',
        message: 'lookup: no such host',
        url: 'http://b/',
        group: '3_Trans_Broken',
        count: 1,
      },
    ])
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
      {
        name: '1_Trans_TrangChu',
        count: 2,
        failed: 0,
        avg: 500.0092915,
        max: 858.018583,
        min: 142,
        std: 358.0092915,
        last: 142,
        series: [
          { time: 100, value: 858.018583 },
          { time: 101, value: 142 },
        ],
      },
      {
        name: '2_Trans_Contacts',
        count: 1,
        failed: 0,
        avg: 275.958875,
        max: 275.958875,
        min: 275.958875,
        std: 0,
        last: 275.958875,
        series: [{ time: 101, value: 275.958875 }],
      },
    ])
  })

  it('averages transactions that ran more than once in a second', () => {
    const collector = new RunStatsCollector()

    collector.push('group_duration,100,100.000000,,,,,::t,,,,default,,,,,,,')
    collector.push('group_duration,100,300.000000,,,,,::t,,,,default,,,,,,,')

    expect(collector.snapshot().groups[0]?.series).toEqual([
      { time: 100, value: 200 },
    ])
  })

  it('attributes failed requests and checks to their group', () => {
    const collector = new RunStatsCollector()

    collector.push(
      'group_duration,100,120.000000,,,,,::1_Trans_TrangChu,,,,default,,,,,,,'
    )
    collector.push(
      'http_req_failed,100,1.000000,,,,false,::1_Trans_TrangChu,GET,https://a/,,default,,500,,,https://a/,,'
    )
    collector.push(
      'checks,100,0.000000,status is 200,,,,::1_Trans_TrangChu,,,,default,,,,,,,'
    )
    collector.push(
      'http_req_failed,100,0.000000,,,,true,::2_Trans_Contacts,GET,https://b/,,default,,200,,,https://b/,,'
    )

    const [group] = collector.snapshot().groups

    expect(group).toEqual({
      name: '1_Trans_TrangChu',
      count: 1,
      failed: 2,
      avg: 120,
      max: 120,
      min: 120,
      std: 0,
      last: 120,
      series: [{ time: 100, value: 120 }],
    })
  })

  it('reports elapsed seconds between the first and newest sample', () => {
    const collector = new RunStatsCollector()

    expect(collector.snapshot().elapsed).toBe(0)

    collector.push('vus,100,1.000000,,,,,,,,,default,,,,,,,')
    collector.push('vus,190,3.000000,,,,,,,,,default,,,,,,,')

    expect(collector.snapshot().elapsed).toBe(90)
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

  it('accumulates dropped iterations and averages the request timing breakdown', () => {
    const collector = new RunStatsCollector()

    collector.push('dropped_iterations,100,2.000000,,,,,,,,,default,,,,,,,')
    collector.push('dropped_iterations,100,1.000000,,,,,,,,,default,,,,,,,')
    collector.push('http_req_blocked,100,5.000000,,,,,,,,,default,,,,,,,')
    collector.push('http_req_blocked,100,15.000000,,,,,,,,,default,,,,,,,')
    collector.push('http_req_connecting,100,10.000000,,,,,,,,,default,,,,,,,')
    collector.push(
      'http_req_tls_handshaking,100,20.000000,,,,,,,,,default,,,,,,,'
    )
    collector.push('http_req_sending,100,1.000000,,,,,,,,,default,,,,,,,')
    collector.push('http_req_waiting,100,100.000000,,,,,,,,,default,,,,,,,')
    collector.push('http_req_receiving,100,4.000000,,,,,,,,,default,,,,,,,')

    const stats = collector.snapshot()

    expect(stats.droppedIterations).toBe(3)
    expect(stats.timings).toEqual({
      blocked: 10,
      connecting: 10,
      tlsHandshaking: 20,
      sending: 1,
      waiting: 100,
      receiving: 4,
    })
  })

  it('reports pass and fail counts per check', () => {
    const collector = new RunStatsCollector()

    collector.push(
      'checks,100,1.000000,status is 200,,,,::1_Trans_Home,,,,default,,,,,,,'
    )
    collector.push(
      'checks,100,0.000000,status is 200,,,,::1_Trans_Home,,,,default,,,,,,,'
    )
    collector.push('checks,100,1.000000,body is json,,,,,,,,default,,,,,,,')

    expect(collector.snapshot().checks).toEqual([
      {
        name: 'status is 200',
        group: '1_Trans_Home',
        request: '',
        passes: 1,
        fails: 1,
      },
      { name: 'body is json', group: '', request: '', passes: 1, fails: 0 },
    ])
  })

  it('splits a check per request when the script tags it', () => {
    const collector = new RunStatsCollector()

    collector.push(
      'checks,100,1.000000,status equals 200,,,,::Default group,,https://api/list,,default,,,,,,,'
    )
    collector.push(
      'checks,100,0.000000,status equals 200,,,,::Default group,,https://api/create,,default,,,,,,,'
    )

    expect(collector.snapshot().checks).toEqual([
      {
        name: 'status equals 200',
        group: 'Default group',
        request: 'https://api/create',
        passes: 0,
        fails: 1,
      },
      {
        name: 'status equals 200',
        group: 'Default group',
        request: 'https://api/list',
        passes: 1,
        fails: 0,
      },
    ])
  })
})
