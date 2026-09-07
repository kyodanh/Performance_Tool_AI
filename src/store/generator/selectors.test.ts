import { describe, expect, it } from 'vitest'

import { createGeneratorState } from '@/test/factories/generator'
import { createProxyData, createRequest } from '@/test/factories/proxyData'

import { selectFilteredRequests } from './selectors'

describe('selectFilteredRequests', () => {
  // A GraphQL recording is nothing but repeats of `POST /api/graphql`, so an
  // edit keyed by method and URL used to show up on all of them.
  const graphql = (id: string, content: string) =>
    createProxyData({
      id,
      request: createRequest({
        method: 'POST',
        url: 'http://example.com/api/graphql',
        content,
      }),
    })

  const requests = [
    graphql('1', '{"op":"start"}'),
    graphql('2', '{"op":"end"}'),
  ]

  const state = createGeneratorState({
    requests,
    allowlist: ['example.com'],
    includeStaticAssets: true,
  })

  it('applies an edit to the edited occurrence only', () => {
    const result = selectFilteredRequests({
      ...state,
      requestOverrides: {
        'POST http://example.com/api/graphql#1': graphql(
          '2',
          '{"op":"edited"}'
        ),
      },
    })

    expect(result.map((data) => data.request.content)).toEqual([
      '{"op":"start"}',
      '{"op":"edited"}',
    ])
  })

  it('applies an override saved under the legacy key to the first occurrence', () => {
    const result = selectFilteredRequests({
      ...state,
      requestOverrides: {
        'POST http://example.com/api/graphql': graphql('1', '{"op":"edited"}'),
      },
    })

    expect(result.map((data) => data.request.content)).toEqual([
      '{"op":"edited"}',
      '{"op":"end"}',
    ])
  })
})
