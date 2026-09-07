import { describe, expect, it } from 'vitest'

import { jsonBodyError, substitutePlaceholders } from './jsonBody'

const GRAPHQL_BODY =
  '[{"operationName":"StudentExamSession","variables":{"id":{studentExamSessionsid}},"extensions":{"clientLibrary":{"name":"@apollo/client","version":"4.0.10"}}}]'

describe('jsonBodyError', () => {
  it('accepts a body whose only oddity is a placeholder', () => {
    expect(jsonBodyError(GRAPHQL_BODY)).toBeNull()
  })

  it('accepts a placeholder used as a whole string value', () => {
    expect(jsonBodyError('{"token":"{auth_token}"}')).toBeNull()
  })

  it('reports a stray brace next to a placeholder', () => {
    // The extra `}` closes the outer object, so `"extensions"` becomes a
    // second element of the array - the mistake the JSON linter never named.
    const error = jsonBodyError(GRAPHQL_BODY.replace('}},"ext', '}}},"ext'))

    expect(error).toMatch(/after array element/)
  })

  it('ignores a body that is not meant to be JSON', () => {
    expect(jsonBodyError('user={username}&password={password}')).toBeNull()
  })

  it('ignores an empty body', () => {
    expect(jsonBodyError('   ')).toBeNull()
  })
})

describe('substitutePlaceholders', () => {
  it('replaces every placeholder with a JSON value', () => {
    expect(substitutePlaceholders('{"a":{one},"b":{two}}')).toBe(
      '{"a":0,"b":0}'
    )
  })

  it('leaves JSON braces alone', () => {
    expect(substitutePlaceholders('{"a":{"b":1}}')).toBe('{"a":{"b":1}}')
  })
})
