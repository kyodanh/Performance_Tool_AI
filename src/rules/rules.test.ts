import { describe, expect, it } from 'vitest'

import {
  createProxyData,
  createRequest,
  createResponse,
} from '@/test/factories/proxyData'
import { ProxyData } from '@/types'
import { CorrelationRule, TestRule } from '@/types/rules'

import { applyRules } from './rules'

function createCorrelationRule(
  overrides: Partial<CorrelationRule> = {}
): CorrelationRule {
  return {
    id: 'correlation-rule',
    type: 'correlation',
    enabled: true,
    extractor: {
      filter: { path: '/login' },
      selector: {
        type: 'json',
        from: 'body',
        path: 'token',
      },
      extractionMode: 'multiple',
    },
    ...overrides,
  }
}

/** A login that returns a token, followed by a request that sends it back. */
function createRecording(): ProxyData[] {
  return [
    createProxyData({
      id: 'login',
      request: createRequest({
        method: 'POST',
        path: '/login',
        url: 'http://example.com/login',
      }),
      response: createResponse({
        content: JSON.stringify({ token: 'abc123' }),
      }),
    }),
    createProxyData({
      id: 'uses-token',
      request: createRequest({
        path: '/orders',
        url: 'http://example.com/orders?token=abc123',
        // Kept in sync with the URL, the way a recording stores it: `applyRules`
        // re-derives the query from the URL and would otherwise hand back a new
        // request object for a rule that changed nothing.
        query: [['token', 'abc123']],
        headers: [['authorization', 'Bearer abc123']],
      }),
    }),
    createProxyData({
      id: 'untouched',
      request: createRequest({
        path: '/health',
        url: 'http://example.com/health',
      }),
    }),
  ]
}

describe('applyRules', () => {
  it('extracts a value and replaces it in later requests', () => {
    const recording = createRecording()

    const { requestSnippetSchemas } = applyRules(recording, [
      createCorrelationRule(),
    ])

    const [login, usesToken] = requestSnippetSchemas

    expect(login?.after.join('')).toContain("correlation_vars['correlation_0']")
    expect(usesToken?.data.request.url).toBe(
      "http://example.com/orders?token=${correlation_vars['correlation_0']}"
    )
    expect(usesToken?.data.request.headers).toEqual([
      ['authorization', "Bearer ${correlation_vars['correlation_0']}"],
    ])
  })

  it('leaves requests no rule matched untouched, by identity', () => {
    const recording = createRecording()

    const { requestSnippetSchemas } = applyRules(recording, [
      createCorrelationRule(),
    ])

    // Structural sharing is what keeps the request list from re-rendering every
    // row on each edit in the rule editor, so it is asserted rather than
    // assumed: a copy here is a performance regression, not a correctness one,
    // and would otherwise go unnoticed.
    const untouched = requestSnippetSchemas.find(
      (snippet) => snippet.data.id === 'untouched'
    )

    expect(untouched?.data).toBe(recording[2])
  })

  it('keeps request identity when a rule matches nothing at all', () => {
    const recording = createRecording()

    const { requestSnippetSchemas } = applyRules(recording, [
      createCorrelationRule({
        extractor: {
          filter: { path: '/nothing-matches-this' },
          selector: { type: 'json', from: 'body', path: 'token' },
          extractionMode: 'multiple',
        },
      }),
    ])

    expect(requestSnippetSchemas.map((snippet) => snippet.data)).toEqual(
      recording
    )
    requestSnippetSchemas.forEach((snippet, index) => {
      expect(snippet.data).toBe(recording[index])
    })
  })

  it('honours the rule variable name in placeholders typed by hand', () => {
    const recording = [
      createProxyData({
        id: 'login',
        request: createRequest({
          method: 'POST',
          path: '/login',
          url: 'http://example.com/login',
        }),
        response: createResponse({
          content: JSON.stringify({ token: 'abc123' }),
        }),
      }),
      createProxyData({
        id: 'placeholder',
        request: createRequest({
          path: '/orders',
          url: 'http://example.com/orders?token={authToken}',
          query: [['token', '{authToken}']],
        }),
      }),
    ]

    const rules: TestRule[] = [
      createCorrelationRule({
        extractor: {
          filter: { path: '/login' },
          selector: { type: 'json', from: 'body', path: 'token' },
          variableName: 'authToken',
          extractionMode: 'multiple',
        },
      }),
    ]

    const { requestSnippetSchemas } = applyRules(recording, rules)

    expect(requestSnippetSchemas[1]?.data.request.url).toBe(
      "http://example.com/orders?token=${correlation_vars['authToken']}"
    )
  })

  it('skips disabled rules', () => {
    const recording = createRecording()

    const { requestSnippetSchemas } = applyRules(recording, [
      createCorrelationRule({ enabled: false }),
    ])

    requestSnippetSchemas.forEach((snippet, index) => {
      expect(snippet.data).toBe(recording[index])
      expect(snippet.after).toEqual([])
    })
  })
})
