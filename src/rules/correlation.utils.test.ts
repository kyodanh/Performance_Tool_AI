import { describe, expect, it } from 'vitest'

import { Request } from '@/types'
import { CorrelationRule } from '@/types/rules'

import { replaceCorrelatedValues } from './correlation.utils'

describe('replaceCorrelatedValues', () => {
  const correlationRule: CorrelationRule = {
    id: '1',
    type: 'correlation',
    enabled: true,
    extractor: {
      filter: { path: '' },
      selector: { from: 'body', type: 'json', path: 'token' },
      variableName: 'token',
      extractionMode: 'single',
    },
  }

  it('should replace all occurrences when no selector is provided', () => {
    const request: Request = {
      method: 'POST',
      url: 'http://test.k6.io/api/v1/helloworld',
      headers: [['hello', 'world']],
      cookies: [['cookie', 'helloworld']],
      query: [],
      scheme: 'http',
      host: 'localhost:3000',
      content: 'hello world',
      path: '/api/v1/helloworld',
      timestampStart: 0,
      timestampEnd: 0,
      contentLength: 0,
      httpVersion: '1.1',
    }

    const rule: CorrelationRule = {
      id: '1',
      type: 'correlation',
      extractor: {
        filter: { path: '' },
        selector: {
          from: 'url',
          type: 'begin-end',
          begin: 'hello',
          end: 'world',
        },
        variableName: 'test',
        extractionMode: 'single',
      },
      enabled: true,
    }

    const result = replaceCorrelatedValues({
      request,
      rule,
      extractedValue: 'world',
      uniqueId: 0,
    })

    expect(result).toBeDefined()
    expect(result.content).toBe("hello ${correlation_vars['test']}")
    expect(result.url).toBe(
      "http://test.k6.io/api/v1/hello${correlation_vars['test']}"
    )
    expect(result.headers[0]![1]).toBe("${correlation_vars['test']}")
    expect(result.cookies[0]![1]).toBe("hello${correlation_vars['test']}")
  })

  it('resolves {name} placeholders even when the value was never recorded', () => {
    const request: Request = {
      method: 'GET',
      url: 'https://test.k6.io/contacts?t={token}',
      headers: [['Authorization', 'Bearer {token}']],
      cookies: [],
      query: [],
      scheme: 'https',
      host: 'test.k6.io',
      content: '{"nested":{"a":1},"ref":"{token}"}',
      path: '/contacts',
      timestampStart: 0,
      timestampEnd: 0,
      contentLength: 0,
      httpVersion: '1.1',
    }

    const rule: CorrelationRule = {
      id: '1',
      type: 'correlation',
      enabled: true,
      extractor: {
        filter: { path: '/users/login' },
        selector: { from: 'body', type: 'json', path: 'token' },
        variableName: 'token',
        extractionMode: 'single',
      },
    }

    const result = replaceCorrelatedValues({
      request,
      rule,
      // Nowhere in the request — only the placeholder can match.
      extractedValue: 'eyJhbGciOi',
      uniqueId: 0,
    })

    expect(result.headers[0]![1]).toBe("Bearer ${correlation_vars['token']}")
    expect(result.url).toBe(
      "https://test.k6.io/contacts?t=${correlation_vars['token']}"
    )
    // JSON braces around `nested` are left alone.
    expect(result.content).toBe(
      '{"nested":{"a":1},"ref":"${correlation_vars[\'token\']}"}'
    )
  })

  it('resolves {name} placeholders alongside a custom replacer selector', () => {
    const request: Request = {
      method: 'GET',
      url: 'https://test.k6.io/contacts',
      headers: [['Authorization', 'Bearer {token}']],
      cookies: [],
      query: [],
      scheme: 'https',
      host: 'test.k6.io',
      content: null,
      path: '/contacts',
      timestampStart: 0,
      timestampEnd: 0,
      contentLength: 0,
      httpVersion: '1.1',
    }

    const result = replaceCorrelatedValues({
      request,
      rule: {
        id: '1',
        type: 'correlation',
        enabled: true,
        extractor: {
          filter: { path: '/users/login' },
          selector: { from: 'body', type: 'json', path: 'token' },
          variableName: 'token',
          extractionMode: 'single',
        },
        replacer: {
          filter: { path: '' },
          selector: { from: 'body', type: 'text', value: 'nothing' },
        },
      },
      extractedValue: 'eyJhbGciOi',
      uniqueId: 0,
    })

    expect(result.headers[0]![1]).toBe("Bearer ${correlation_vars['token']}")
  })

  it('leaves client-describing headers alone when replacing everywhere', () => {
    const request: Request = {
      method: 'GET',
      url: 'https://test.k6.io/contacts',
      headers: [
        [
          'user-agent',
          'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/141.0.0.0',
        ],
        ['sec-ch-ua-platform', '"macOS"'],
        ['x-tenant-id', '537'],
      ],
      cookies: [],
      query: [],
      scheme: 'https',
      host: 'test.k6.io',
      content: null,
      path: '/contacts',
      timestampStart: 0,
      timestampEnd: 0,
      contentLength: 0,
      httpVersion: '1.1',
    }

    const result = replaceCorrelatedValues({
      request,
      rule: correlationRule,
      extractedValue: '537',
      uniqueId: 0,
    })

    expect(result.headers).toEqual(request.headers)
  })

  it('does not replace values too short to match on purpose', () => {
    const request: Request = {
      method: 'GET',
      url: 'https://test.k6.io/contacts/7',
      headers: [['x-tenant-id', '7']],
      cookies: [],
      query: [],
      scheme: 'https',
      host: 'test.k6.io',
      content: '{"id":7}',
      path: '/contacts/7',
      timestampStart: 0,
      timestampEnd: 0,
      contentLength: 0,
      httpVersion: '1.1',
    }

    const result = replaceCorrelatedValues({
      request,
      rule: correlationRule,
      extractedValue: '7',
      uniqueId: 0,
    })

    expect(result).toBe(request)
  })

  it('replaces a short value where a replacer selector points at it', () => {
    const request: Request = {
      method: 'GET',
      url: 'https://test.k6.io/contacts',
      headers: [['x-tenant-id', '7']],
      cookies: [],
      query: [],
      scheme: 'https',
      host: 'test.k6.io',
      content: null,
      path: '/contacts',
      timestampStart: 0,
      timestampEnd: 0,
      contentLength: 0,
      httpVersion: '1.1',
    }

    const result = replaceCorrelatedValues({
      request,
      rule: {
        ...correlationRule,
        replacer: {
          filter: { path: '' },
          selector: { from: 'headers', type: 'text', value: '7' },
        },
      },
      extractedValue: '7',
      uniqueId: 0,
    })

    expect(result.headers[0]![1]).toBe("${correlation_vars['token']}")
  })

  // A JSON extractor hands back whatever the body held, not always a string.
  it('handles a non-string extracted value', () => {
    const request: Request = {
      method: 'GET',
      url: 'https://test.k6.io/contacts/123456',
      headers: [],
      cookies: [],
      query: [],
      scheme: 'https',
      host: 'test.k6.io',
      content: null,
      path: '/contacts/123456',
      timestampStart: 0,
      timestampEnd: 0,
      contentLength: 0,
      httpVersion: '1.1',
    }

    const result = replaceCorrelatedValues({
      request,
      rule: correlationRule,
      extractedValue: 123456 as unknown as string,
      uniqueId: 0,
    })

    expect(result.url).toBe(
      "https://test.k6.io/contacts/${correlation_vars['token']}"
    )
  })
})
