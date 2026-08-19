import { describe, expect, it } from 'vitest'

import { parseCurl } from './parseCurl'

describe('parseCurl', () => {
  it('returns null for anything that is not a curl command', () => {
    expect(parseCurl('https://example.com/api/users')).toBeNull()
  })

  it('parses a multiline command with headers and a JSON body', () => {
    expect(
      parseCurl(`curl 'https://example.com/users/login' \\
  -X POST \\
  -H 'content-type: application/json; charset=utf-8' \\
  -H 'authorization: Bearer abc.def' \\
  --data-raw '{"email":"a@b.com","password":"secret"}'`)
    ).toEqual({
      method: 'POST',
      url: 'https://example.com/users/login',
      headers: [
        { name: 'content-type', value: 'application/json; charset=utf-8' },
        { name: 'authorization', value: 'Bearer abc.def' },
      ],
      content: '{"email":"a@b.com","password":"secret"}',
    })
  })

  it('defaults to POST when there is a body and no explicit method', () => {
    const parsed = parseCurl(`curl https://example.com/api -d name=k6`)

    expect(parsed?.method).toBe('POST')
    expect(parsed?.content).toBe('name=k6')
  })

  it('defaults to GET without a body and joins repeated data flags', () => {
    expect(parseCurl('curl https://example.com/api')?.method).toBe('GET')
    expect(
      parseCurl('curl -G https://example.com/api -d a=1 -d b=2')
    ).toMatchObject({ method: 'GET', content: 'a=1&b=2' })
  })

  it('ignores unknown flags and their values', () => {
    expect(
      parseCurl(
        `curl --compressed -u user:pass --max-time 5 "https://example.com/api"`
      )
    ).toMatchObject({ url: 'https://example.com/api', headers: [] })
  })

  it('turns a cookie flag into a header and keeps escaped quotes', () => {
    expect(
      parseCurl(`curl https://example.com/api -b "a=1; b=2" -d "{\\"a\\":1}"`)
    ).toMatchObject({
      headers: [{ name: 'Cookie', value: 'a=1; b=2' }],
      content: '{"a":1}',
    })
  })
})
