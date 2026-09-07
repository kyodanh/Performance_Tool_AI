import { describe, expect, it } from 'vitest'

import { HarEntry } from '@/types/recording'

import { harToProxyData } from './harToProxyData'

function createHarEntry(overrides: Partial<HarEntry> = {}): HarEntry {
  return {
    startedDateTime: '2026-06-04T09:52:23.853Z',
    time: 250,
    cache: {},
    timings: { wait: 250, receive: 0 },
    request: {
      method: 'GET',
      url: 'https://example.com/api/users',
      httpVersion: 'HTTP/1.1',
      headers: [],
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: 200,
      statusText: 'OK',
      httpVersion: 'HTTP/1.1',
      headers: [],
      cookies: [],
      content: { size: 0, mimeType: 'application/json' },
      redirectURL: '',
      headersSize: -1,
      bodySize: -1,
    },
    ...overrides,
  }
}

describe('harToProxyData', () => {
  it('encodes the entry time as the request end timestamp', () => {
    const [proxyData] = harToProxyData({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1' },
        entries: [createHarEntry()],
      },
    })

    const { timestampStart, timestampEnd } = proxyData!.request

    expect(timestampStart).toBeGreaterThan(0)
    expect(timestampEnd - timestampStart).toBeCloseTo(0.25)
  })

  it('leaves the end timestamp empty when the entry has no time', () => {
    const [proxyData] = harToProxyData({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1' },
        entries: [createHarEntry({ time: 0 })],
      },
    })

    expect(proxyData!.request.timestampEnd).toBe(0)
  })

  it('drops a response body too large to be worth decoding', () => {
    const [proxyData] = harToProxyData({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1' },
        entries: [
          createHarEntry({
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/1.1',
              headers: [],
              cookies: [],
              content: {
                size: 30_000_000,
                mimeType: 'video/mp4',
                encoding: 'base64',
                text: 'A'.repeat(1_000_001),
              },
              redirectURL: '',
              headersSize: -1,
              bodySize: -1,
            },
          }),
        ],
      },
    })

    expect(proxyData!.response!.content).toBe('')
    // The size still comes from the recording, so the row reports it.
    expect(proxyData!.response!.contentLength).toBe(30_000_000)
  })

  it('keeps a response body under the cap', () => {
    const [proxyData] = harToProxyData({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1' },
        entries: [
          createHarEntry({
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/1.1',
              headers: [],
              cookies: [],
              content: {
                size: 15,
                mimeType: 'application/json',
                text: '{"id":"abc123"}',
              },
              redirectURL: '',
              headersSize: -1,
              bodySize: -1,
            },
          }),
        ],
      },
    })

    expect(proxyData!.response!.content).toBe('{"id":"abc123"}')
  })

  it('drops a request body too large to be worth keeping', () => {
    const [proxyData] = harToProxyData({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1' },
        entries: [
          createHarEntry({
            request: {
              method: 'POST',
              url: 'https://example.com/upload',
              httpVersion: 'HTTP/1.1',
              headers: [],
              queryString: [],
              cookies: [],
              headersSize: -1,
              bodySize: -1,
              postData: {
                mimeType: 'application/octet-stream',
                text: 'A'.repeat(1_000_001),
              },
            },
          }),
        ],
      },
    })

    expect(proxyData!.request.content).toBe('')
  })
})
