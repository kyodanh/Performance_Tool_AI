import { describe, expect, it } from 'vitest'

import { createProxyData, createRequest } from '@/test/factories/proxyData'
import { CorrelationRule } from '@/types/rules'

import {
  interpolatePlaceholders,
  interpolateRequestPlaceholders,
  placeholderExpressions,
} from './placeholders'

const correlationRule: CorrelationRule = {
  type: 'correlation',
  id: 'rule-1',
  enabled: true,
  extractor: {
    filter: { path: '' },
    selector: {
      type: 'json',
      from: 'body',
      path: 'token',
    },
    variableName: 'token',
    extractionMode: 'single',
  },
}

describe('placeholders', () => {
  it('resolves test data and correlation names', () => {
    const expressions = placeholderExpressions(
      [{ name: 'user', value: 'a@b.com' }],
      [correlationRule]
    )

    expect(interpolatePlaceholders('{user}:{token}', expressions)).toBe(
      "${VARS['user']}:${correlation_vars['token']}"
    )
  })

  it('leaves unknown names and real braces alone', () => {
    const expressions = placeholderExpressions(
      [{ name: 'user', value: 'a@b.com' }],
      []
    )

    expect(
      interpolatePlaceholders(
        '{"email":"{user}","other":"{typo}"}',
        expressions
      )
    ).toBe('{"email":"${VARS[\'user\']}","other":"{typo}"}')
  })

  it('lets test data win a name clash with a correlation rule', () => {
    const expressions = placeholderExpressions(
      [{ name: 'token', value: 'static' }],
      [correlationRule]
    )

    expect(interpolatePlaceholders('{token}', expressions)).toBe(
      "${VARS['token']}"
    )
  })

  it('interpolates url, headers and body of a request', () => {
    const expressions = placeholderExpressions(
      [{ name: 'user', value: 'a@b.com' }],
      [correlationRule]
    )

    const data = createProxyData({
      request: createRequest({
        url: 'https://example.com/users/{user}',
        headers: [['authorization', 'Bearer {token}']],
        content: '{"email":"{user}"}',
      }),
    })

    const { request } = interpolateRequestPlaceholders(data, expressions)

    expect(request.url).toBe("https://example.com/users/${VARS['user']}")
    expect(request.headers).toStrictEqual([
      ['authorization', "Bearer ${correlation_vars['token']}"],
    ])
    expect(request.content).toBe('{"email":"${VARS[\'user\']}"}')
  })

  it('returns the request untouched when there are no variables', () => {
    const data = createProxyData({
      request: createRequest({ content: '{"email":"{user}"}' }),
    })

    expect(interpolateRequestPlaceholders(data, new Map())).toBe(data)
  })
})
