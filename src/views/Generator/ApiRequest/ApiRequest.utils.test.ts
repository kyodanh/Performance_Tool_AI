import { describe, expect, it } from 'vitest'

import { Response } from '@/types'

import {
  ApiRequestFormData,
  fromProxyData,
  toProxyData,
  toRequest,
  toSendOptions,
} from './ApiRequest.utils'

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

describe('fromProxyData', () => {
  it('round-trips a request back into form values', () => {
    const data = {
      method: 'POST' as const,
      url: 'https://example.com/api/users?page=2',
      headers: [{ name: 'authorization', value: 'Bearer 123' }],
      content: '{"name":"k6"}',
    }

    const proxyData = toProxyData(data, response, 'request-1')

    expect(fromProxyData(proxyData)).toEqual({
      ...data,
      headers: [
        { name: 'authorization', value: 'Bearer 123' },
        { name: 'content-type', value: 'application/json' },
      ],
    })
    expect(proxyData.id).toBe('request-1')
  })
})

describe('toSendOptions', () => {
  const data: ApiRequestFormData = {
    method: 'GET',
    url: 'https://app.test/contacts?t={token}',
    headers: [{ name: 'Authorization', value: 'Bearer {token}' }],
    content: '',
  }

  it('resolves placeholders with the recorded value', () => {
    const options = toSendOptions(data, { token: 'eyJhbGciOi' })

    expect(options.url).toBe('https://app.test/contacts?t=eyJhbGciOi')
    expect(options.headers).toEqual([['Authorization', 'Bearer eyJhbGciOi']])
  })

  it('leaves the placeholder alone when nothing was extracted yet', () => {
    const options = toSendOptions(data, { token: undefined })

    expect(options.headers).toEqual([['Authorization', 'Bearer {token}']])
  })

  it('never rewrites the form itself, so the script keeps the variable', () => {
    toSendOptions(data, { token: 'eyJhbGciOi' })

    expect(data.headers[0]?.value).toBe('Bearer {token}')
  })
})
