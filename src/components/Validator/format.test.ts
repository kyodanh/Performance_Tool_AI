import { describe, expect, it } from 'vitest'

import { RunErrorGroup } from '@/utils/k6/stats'

import {
  describeCategory,
  describeCode,
  describeError,
  errorCategories,
  formatDuration,
  formatTime,
} from './format'

function error(partial: Partial<RunErrorGroup>): RunErrorGroup {
  return {
    code: '',
    message: '',
    url: '',
    group: '',
    count: 1,
    dataRows: [],
    ...partial,
  }
}

describe('describeCode', () => {
  it('shows the HTTP status behind a k6 status code', () => {
    expect(describeCode(error({ code: '1401' }))).toBe('401')
    expect(describeCode(error({ code: '1503' }))).toBe('503')
  })

  it('keeps codes that are not an HTTP status', () => {
    expect(describeCode(error({ code: '1101' }))).toBe('1101')
    expect(describeCode(error({ code: '' }))).toBe('—')
  })
})

describe('describeError', () => {
  it('prefers the message k6 reported', () => {
    expect(
      describeError(error({ code: '1101', message: 'no such host' }))
    ).toBe('no such host')
  })

  it('names the failure class when k6 reported no message', () => {
    expect(describeError(error({ code: '1401' }))).toBe('4xx client error')
    expect(describeError(error({ code: '1500' }))).toBe('5xx server error')
    expect(describeError(error({ code: '1010' }))).toBe('Unknown error')
  })
})

describe('formatDuration', () => {
  it('formats seconds as hh:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00:00')
    expect(formatDuration(3723)).toBe('01:02:03')
  })
})

describe('formatTime', () => {
  it('reports milliseconds as seconds', () => {
    expect(formatTime(13473)).toBe('13.473 s')
    expect(formatTime(4.2)).toBe('0.004 s')
  })
})

describe('describeCategory', () => {
  it('names the class of failure behind a k6 code', () => {
    expect(describeCategory(error({ code: '1404' }))).toBe('HTTP 4xx')
    expect(describeCategory(error({ code: '1500' }))).toBe('HTTP 5xx')
    expect(describeCategory(error({ code: '1050' }))).toBe('Timeout')
    expect(describeCategory(error({ code: '1211' }))).toBe('Timeout')
    expect(describeCategory(error({ code: '1212' }))).toBe('Connection')
    expect(describeCategory(error({ code: '1101' }))).toBe('DNS')
    expect(describeCategory(error({ code: '1310' }))).toBe('TLS')
    expect(describeCategory(error({ code: '' }))).toBe('Other')
  })
})

describe('errorCategories', () => {
  it('totals occurrences per category, largest first', () => {
    expect(
      errorCategories([
        error({ code: '1404', count: 2 }),
        error({ code: '1050', count: 7 }),
        error({ code: '1403', count: 3 }),
      ])
    ).toEqual([
      { category: 'Timeout', count: 7 },
      { category: 'HTTP 4xx', count: 5 },
    ])
  })
})
