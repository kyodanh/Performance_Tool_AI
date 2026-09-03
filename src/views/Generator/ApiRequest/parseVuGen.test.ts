import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseVuGen } from './parseVuGen'

const source = readFileSync(
  join(process.cwd(), 'src/views/Generator/ApiRequest/__fixtures__/action.c'),
  'utf-8'
)

describe('parseVuGen', () => {
  it('returns null for text that is not a VuGen action', () => {
    expect(parseVuGen('curl https://example.com')).toBeNull()
  })

  it('imports every step and skips EXTRARES sub-resources', () => {
    const result = parseVuGen(source)

    expect(result?.requests).toHaveLength(4)
    // 2 EXTRARES items, nothing else dropped.
    expect(result?.skipped).toBe(2)
  })

  it('groups requests by transaction', () => {
    const groups = parseVuGen(source)?.requests.map(({ group }) => group)

    expect(groups).toEqual([
      '2_trans_Dashboard',
      '2_trans_Dashboard',
      '6_trans_ProjectMonitoring',
      '6_trans_ProjectMonitoring',
    ])
  })

  it('applies auto headers to every later step and plain headers only once', () => {
    const [first, second] = parseVuGen(source)?.requests ?? []

    // web_add_auto_header
    expect(first?.headers).toContainEqual({
      name: 'Authorization',
      value: 'Bearer {token}',
    })
    expect(second?.headers).toContainEqual({
      name: 'Authorization',
      value: 'Bearer {token}',
    })

    // web_add_header, consumed by the first step only
    expect(first?.headers).toContainEqual({
      name: 'Sec-Fetch-Dest',
      value: 'script',
    })
    expect(second?.headers.map(({ name }) => name)).not.toContain(
      'Sec-Fetch-Dest'
    )
  })

  it('joins split string literals and drops cookie attributes', () => {
    const second = parseVuGen(source)?.requests[1]

    expect(second?.headers).toContainEqual({
      name: 'at',
      value: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.payload',
    })
    expect(second?.headers).toContainEqual({
      name: 'Cookie',
      value: 'redirect_url=/dashboard',
    })
  })

  it('reads web_custom_request bodies with their escaped quotes', () => {
    const third = parseVuGen(source)?.requests[2]

    expect(third?.method).toBe('POST')
    expect(third?.content).toBe('{"bg":"x","ou":[]}')
    expect(third?.headers).toContainEqual({
      name: 'content-type',
      value: 'application/json; charset=UTF-8',
    })
  })

  it('encodes web_submit_data item data as a form body', () => {
    const fourth = parseVuGen(source)?.requests[3]

    expect(fourth?.method).toBe('POST')
    expect(fourth?.content).toBe('username=%7Buser%7D&password=secret')
    expect(fourth?.rendezvous).toBe(true)
  })

  it('attaches lr_think_time to the request it follows in the same transaction', () => {
    const requests = parseVuGen(source)?.requests ?? []

    expect(requests[2]?.thinkTime).toBe(5)
  })

  it('drops a pause that sits between two transactions', () => {
    const result = parseVuGen(source)

    // 38s sits after lr_end_transaction: keeping it would add 38s to the
    // measured duration of the transaction that just closed.
    expect(result?.requests[1]?.thinkTime).toBeNull()
    expect(result?.droppedThinkTime).toBe(1)
  })

  it('ignores calls that only appear inside comments', () => {
    const urls = parseVuGen(source)?.requests.map(({ url }) => url) ?? []

    expect(urls.some((url) => url.includes('not a call'))).toBe(false)
  })
})

describe('cookies', () => {
  // Regression: web_add_cookie is a cookie-jar write, so it has to stick to
  // later steps. Dropping it after one step made every request that relied on
  // it fail server-side (500 on an endpoint reading `redirect_url`).
  it('keeps a cookie on later steps and scopes it to its domain', () => {
    const result = parseVuGen(`
      web_add_cookie("redirect_url=/dashboard; DOMAIN=pro360-test.fis.vn");

      web_url("first", "URL=https://pro360-test.fis.vn/a", LAST);
      web_url("second", "URL=https://pro360-test.fis.vn/b", LAST);
      web_url("other host", "URL=https://example.com/c", LAST);

      web_cleanup_cookies();

      web_url("after cleanup", "URL=https://pro360-test.fis.vn/d", LAST);
    `)

    const cookieHeaders = result?.requests.map(
      (request) =>
        request.headers.find(({ name }) => name === 'Cookie')?.value ?? null
    )

    expect(cookieHeaders).toEqual([
      'redirect_url=/dashboard',
      'redirect_url=/dashboard',
      null,
      null,
    ])
  })
})
