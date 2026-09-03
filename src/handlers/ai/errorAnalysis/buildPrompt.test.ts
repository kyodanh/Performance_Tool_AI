import { describe, expect, it } from 'vitest'

import { Check, LogEntry } from '@/schemas/k6'
import { RequestStats, RunErrorGroup } from '@/utils/k6/stats'

import { buildFailureAnalysisPrompt } from './buildPrompt'
import { AnalyzeFailureRequest } from './types'

function makeRequest(
  overrides: Partial<AnalyzeFailureRequest> = {}
): AnalyzeFailureRequest {
  return {
    checks: [],
    errors: [],
    requestStats: [],
    logs: [],
    ...overrides,
  }
}

describe('buildFailureAnalysisPrompt', () => {
  it('omits passing checks and includes only failed ones', () => {
    const checks: Check[] = [
      {
        id: '1',
        name: 'status is 200',
        path: '::checkout',
        passes: 10,
        fails: 0,
      },
      {
        id: '2',
        name: 'body contains token',
        path: '::login',
        passes: 3,
        fails: 7,
      },
    ]

    const prompt = buildFailureAnalysisPrompt(makeRequest({ checks }))

    expect(prompt).toContain('body contains token')
    expect(prompt).toContain('7 failed / 3 passed')
    expect(prompt).not.toContain('status is 200')
  })

  it('sorts request stats by failed count then avg duration, worst first', () => {
    const requestStats: RequestStats[] = [
      {
        method: 'GET',
        name: '/fast-ok',
        status: '200',
        group: '',
        count: 5,
        failed: 0,
        avg: 50,
        max: 60,
        min: 40,
        total: 250,
        std: 5,
        serverTime: 200,
      },
      {
        method: 'POST',
        name: '/slow-failing',
        status: '500',
        group: '',
        count: 5,
        failed: 5,
        avg: 4000,
        max: 5000,
        min: 3200,
        total: 20000,
        std: 400,
        serverTime: 16000,
      },
    ]

    const prompt = buildFailureAnalysisPrompt(makeRequest({ requestStats }))
    const failingIndex = prompt.indexOf('/slow-failing')
    const okIndex = prompt.indexOf('/fast-ok')

    expect(failingIndex).toBeGreaterThan(-1)
    expect(failingIndex).toBeLessThan(okIndex)
    expect(prompt).toContain('5/5 failed, avg 4000ms, max 5000ms')
  })

  it('includes error groups with code, message, url and count', () => {
    const errors: RunErrorGroup[] = [
      {
        code: 'ETIMEDOUT',
        message: 'context deadline exceeded',
        url: 'https://api.example.com/checkout',
        group: '::checkout',
        count: 12,
      },
    ]

    const prompt = buildFailureAnalysisPrompt(makeRequest({ errors }))

    expect(prompt).toContain('ETIMEDOUT')
    expect(prompt).toContain('context deadline exceeded')
    expect(prompt).toContain('https://api.example.com/checkout')
    expect(prompt).toContain('12x')
  })

  it('filters logs to error level only', () => {
    const logs: LogEntry[] = [
      {
        level: 'info',
        msg: 'starting VU',
        time: '2026-01-01T00:00:00Z',
        process: 'k6',
      },
      {
        level: 'error',
        msg: 'connection refused',
        time: '2026-01-01T00:00:01Z',
        process: 'k6',
      },
    ]

    const prompt = buildFailureAnalysisPrompt(makeRequest({ logs }))

    expect(prompt).toContain('connection refused')
    expect(prompt).not.toContain('starting VU')
  })

  it('prints "(none)" placeholders for empty sections', () => {
    const prompt = buildFailureAnalysisPrompt(makeRequest())

    expect(prompt.match(/\(none\)/g)).toHaveLength(4)
  })

  it('truncates each section to its cap', () => {
    const checks: Check[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      name: `check-${i}`,
      path: '',
      passes: 0,
      fails: 1,
    }))

    const prompt = buildFailureAnalysisPrompt(makeRequest({ checks }))
    const matches = prompt.match(/check-\d+/g) ?? []

    expect(matches).toHaveLength(20)
  })

  it('asks for a performance review when nothing failed', () => {
    const requestStats: RequestStats[] = [
      {
        method: 'GET',
        name: 'https://test.k6.io/',
        status: '200',
        group: '',
        count: 10,
        failed: 0,
        avg: 120,
        max: 300,
        min: 96,
        total: 1200,
        std: 12,
        serverTime: 960,
      },
    ]

    const prompt = buildFailureAnalysisPrompt(makeRequest({ requestStats }))

    expect(prompt).toContain('finished without failures')
    expect(prompt).not.toContain('root cause')
  })

  it('asks for the answer in Vietnamese', () => {
    expect(buildFailureAnalysisPrompt(makeRequest())).toContain(
      'Answer in Vietnamese'
    )
  })

  it('asks for a root cause as soon as a request failed', () => {
    const requestStats: RequestStats[] = [
      {
        method: 'GET',
        name: 'https://test.k6.io/',
        status: '500',
        group: '',
        count: 10,
        failed: 3,
        avg: 120,
        max: 300,
        min: 96,
        total: 1200,
        std: 12,
        serverTime: 960,
      },
    ]

    const prompt = buildFailureAnalysisPrompt(makeRequest({ requestStats }))

    expect(prompt).toContain('root cause')
  })
})
