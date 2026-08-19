import { describe, expect, it } from 'vitest'

import { Response } from '@/types'

import { toProxyData, toRequest } from './ApiRequest.utils'

const response: Response = {
  headers: [['content-type', 'application/json']],
  cookies: [],
  reason: 'OK',
  statusCode: 200,
  content: '{}',
  path: '',
  timestampStart: 10,
  timestampEnd: 11,
  httpVersion: 'HTTP/1.1',
  contentLength: 2,
}

describe('toRequest', () => {
  it('splits the url into host, path and query', () => {
    const request = toRequest(
      {
        method: 'GET',
        url: 'https://example.com/api/users?page=2',
        headers: [],
        content: '',
      },
      response
    )

    expect(request.scheme).toBe('https')
    expect(request.host).toBe('example.com')
    expect(request.path).toBe('/api/users?page=2')
    expect(request.query).toEqual([['page', '2']])
  })

  it('drops empty headers and keeps the body for methods that allow one', () => {
    const request = toRequest(
      {
        method: 'POST',
        url: 'https://example.com/api/users',
        headers: [
          { name: ' content-type ', value: 'application/json' },
          { name: '', value: 'ignored' },
        ],
        content: '{"name":"k6"}',
      },
      response
    )

    expect(request.headers).toEqual([['content-type', 'application/json']])
    expect(request.content).toBe('{"name":"k6"}')
    expect(request.contentLength).toBe(13)
  })

  it('defaults the content type from the body when none is set', () => {
    const json = toRequest(
      {
        method: 'POST',
        url: 'https://example.com/api/users',
        headers: [],
        content: '{"name":"k6"}',
      },
      response
    )
    const text = toRequest(
      {
        method: 'POST',
        url: 'https://example.com/api/users',
        headers: [],
        content: 'name=k6',
      },
      response
    )

    expect(json.headers).toEqual([['content-type', 'application/json']])
    expect(text.headers).toEqual([['content-type', 'text/plain']])
  })

  it('ignores the body for methods without one', () => {
    const request = toRequest(
      {
        method: 'GET',
        url: 'https://example.com/api/users',
        headers: [],
        content: '{"name":"k6"}',
      },
      response
    )

    expect(request.content).toBeNull()
    expect(request.contentLength).toBe(0)
  })
})

describe('toProxyData', () => {
  it('attaches the response and takes timings from it', () => {
    const proxyData = toProxyData(
      {
        method: 'GET',
        url: 'https://example.com/api/users',
        headers: [],
        content: '',
      },
      response
    )

    expect(proxyData.id).not.toBe('')
    expect(proxyData.response).toBe(response)
    expect(proxyData.request.timestampStart).toBe(10)
    expect(proxyData.request.timestampEnd).toBe(11)
  })
})
