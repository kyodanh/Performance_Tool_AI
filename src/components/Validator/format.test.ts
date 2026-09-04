import { describe, expect, it } from 'vitest'

import { RunErrorGroup } from '@/utils/k6/stats'

import {
  describeCode,
  describeError,
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
