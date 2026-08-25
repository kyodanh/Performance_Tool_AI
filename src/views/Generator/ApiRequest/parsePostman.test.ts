import { describe, expect, it } from 'vitest'

import { parsePostman, parsePostmanEnvironment } from './parsePostman'

function collection(items: unknown[], variable?: unknown[]) {
  return JSON.stringify({
    info: { name: 'Test', schema: 'v2.1.0/collection.json' },
    item: items,
    variable,
  })
}

describe('parsePostman', () => {
  it('returns null for anything that is not a collection', () => {
    expect(parsePostman('not json')).toBeNull()
    expect(parsePostman('{"log":{"entries":[]}}')).toBeNull()
  })

  it('parses a request with headers and a JSON body', () => {
    const parsed = parsePostman(
      collection([
        {
          name: 'Login',
          request: {
            method: 'POST',
            header: [
              { key: 'content-type', value: 'application/json' },
              { key: 'x-off', value: 'no', disabled: true },
            ],
            url: { raw: 'https://example.com/users/login' },
            body: { mode: 'raw', raw: '{"email":"a@b.com"}' },
          },
        },
      ])
    )

    expect(parsed).toEqual({
      skipped: 0,
      requests: [
        {
          method: 'POST',
          url: 'https://example.com/users/login',
          headers: [{ name: 'content-type', value: 'application/json' }],
          content: '{"email":"a@b.com"}',
          group: 'Default group',
        },
      ],
    })
  })

  it('resolves collection variables in url, headers and body', () => {
    const parsed = parsePostman(
      collection(
        [
          {
            request: {
              method: 'PUT',
              header: [{ key: 'authorization', value: 'Bearer {{token}}' }],
              url: '{{baseUrl}}/users/1',
              body: { mode: 'raw', raw: '{"token":"{{token}}"}' },
            },
          },
        ],
        [
          { key: 'baseUrl', value: 'https://example.com/api' },
          { key: 'token', value: 'abc' },
        ]
      )
    )

    expect(parsed?.requests).toEqual([
      {
        method: 'PUT',
        url: 'https://example.com/api/users/1',
        headers: [{ name: 'authorization', value: 'Bearer abc' }],
        content: '{"token":"abc"}',
        group: 'Default group',
      },
    ])
  })

  it('flattens nested folders', () => {
    const parsed = parsePostman(
      collection([
        {
          name: 'Folder',
          item: [
            { request: { url: 'https://example.com/a' } },
            {
              name: 'Nested',
              item: [{ request: { url: 'https://example.com/b' } }],
            },
          ],
        },
      ])
    )

    expect(parsed?.requests.map(({ url, method }) => [method, url])).toEqual([
      ['GET', 'https://example.com/a'],
      ['GET', 'https://example.com/b'],
    ])
  })

  it('uses the innermost folder name as the group', () => {
    const parsed = parsePostman(
      collection([
        { name: 'Ping', request: { url: 'https://example.com/ping' } },
        {
          name: 'transaction_login',
          item: [
            { name: 'Login', request: { url: 'https://example.com/login' } },
            {
              name: 'trans_view',
              item: [{ request: { url: 'https://example.com/view' } }],
            },
          ],
        },
      ])
    )

    expect(parsed?.requests.map(({ url, group }) => [group, url])).toEqual([
      ['Default group', 'https://example.com/ping'],
      ['transaction_login', 'https://example.com/login'],
      ['trans_view', 'https://example.com/view'],
    ])
  })

  it('encodes an urlencoded body and adds the content type', () => {
    const parsed = parsePostman(
      collection([
        {
          request: {
            method: 'POST',
            url: 'https://example.com/form',
            body: {
              mode: 'urlencoded',
              urlencoded: [
                { key: 'name', value: 'a b' },
                { key: 'skip', value: 'x', disabled: true },
              ],
            },
          },
        },
      ])
    )

    expect(parsed?.requests[0]).toEqual({
      method: 'POST',
      url: 'https://example.com/form',
      headers: [
        { name: 'content-type', value: 'application/x-www-form-urlencoded' },
      ],
      content: 'name=a%20b',
      group: 'Default group',
    })
  })

  it('skips requests it cannot reproduce', () => {
    const parsed = parsePostman(
      collection([
        // Variable the collection does not define, so the URL stays invalid.
        { request: { url: '{{baseUrl}}/users' } },
        { request: { method: 'LINK', url: 'https://example.com/a' } },
        {
          request: {
            method: 'POST',
            url: 'https://example.com/upload',
            body: { mode: 'formdata' },
          },
        },
        { request: { url: 'https://example.com/ok' } },
      ])
    )

    expect(parsed).toMatchObject({ skipped: 3 })
    expect(parsed?.requests).toHaveLength(1)
  })

  it('ignores a stale body on a GET', () => {
    const parsed = parsePostman(
      collection([
        {
          request: {
            method: 'GET',
            url: 'https://example.com/a',
            body: { mode: 'formdata' },
          },
        },
      ])
    )

    expect(parsed?.requests[0]?.content).toBe('')
  })

  it('resolves variables from an environment file', () => {
    const environment = parsePostmanEnvironment(
      JSON.stringify({
        name: 'Dev',
        _postman_variable_scope: 'environment',
        values: [
          { key: 'baseUrl', value: 'https://dev.example.com', enabled: true },
          { key: 'token', value: 'env-token' },
          { key: 'unused', value: 'x', enabled: false },
        ],
      })
    )

    expect(environment).toEqual({
      baseUrl: 'https://dev.example.com',
      token: 'env-token',
    })

    const parsed = parsePostman(
      collection(
        [
          {
            request: {
              header: [{ key: 'authorization', value: 'Bearer {{token}}' }],
              url: '{{baseUrl}}/users',
            },
          },
        ],
        // The environment wins over the collection's own value, like Postman.
        [{ key: 'baseUrl', value: 'https://stale.example.com' }]
      ),
      environment ?? {}
    )

    expect(parsed?.requests).toEqual([
      {
        method: 'GET',
        url: 'https://dev.example.com/users',
        headers: [{ name: 'authorization', value: 'Bearer env-token' }],
        content: '',
        group: 'Default group',
      },
    ])
  })

  it('does not mistake a collection for an environment or the other way round', () => {
    expect(parsePostmanEnvironment(collection([]))).toBeNull()
    expect(parsePostman(JSON.stringify({ name: 'Dev', values: [] }))).toBeNull()
  })
})
