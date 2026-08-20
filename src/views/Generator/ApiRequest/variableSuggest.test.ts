import { describe, expect, it } from 'vitest'

import { getVariableQuery, insertVariable } from './variableSuggest'

describe('getVariableQuery', () => {
  it('matches an unclosed placeholder before the caret', () => {
    expect(getVariableQuery('Bearer {', 8)).toBe('')
    expect(getVariableQuery('Bearer {to', 10)).toBe('to')
  })

  it('ignores a closed placeholder', () => {
    expect(getVariableQuery('Bearer {token}', 14)).toBeNull()
  })

  it('ignores text without a brace', () => {
    expect(getVariableQuery('Bearer token', 12)).toBeNull()
  })

  it('reads the brace nearest the caret, not the end of the value', () => {
    expect(getVariableQuery('a {x} b {to ken', 11)).toBe('to')
  })
})

describe('insertVariable', () => {
  it('completes the placeholder and keeps the surrounding text', () => {
    expect(insertVariable('Bearer {to', 10, 'token')).toEqual({
      value: 'Bearer {token}',
      caret: 14,
    })
  })

  it('keeps text after the caret', () => {
    expect(insertVariable('Bearer { end', 8, 'token')).toEqual({
      value: 'Bearer {token} end',
      caret: 14,
    })
  })
})
