import { describe, expect, it } from 'vitest'

import { createRequest } from '@/test/factories/proxyData'
import { TextSelector } from '@/types/rules'

import { replaceText } from './text'

describe('replaceText', () => {
  it('replaces text matches in URL', () => {
    const request = createRequest({
      url: 'http://test.k6.io/api/v1/foo',
      path: '/api/v1/foo',
    })

    const selectorMatch: TextSelector = {
      type: 'text',
      from: 'url',
      value: 'foo',
    }

    const selectorNotMatch: TextSelector = {
      type: 'text',
      from: 'url',
      value: 'not-existing',
    }

    expect(replaceText(request, selectorMatch, 'TEST_VALUE')?.url).toEqual(
      'http://test.k6.io/api/v1/TEST_VALUE'
    )
    expect(replaceText(request, selectorMatch, 'TEST_VALUE')?.path).toEqual(
      '/api/v1/TEST_VALUE'
    )

    expect(replaceText(request, selectorNotMatch, 'TEST_VALUE')).toEqual(
      request
    )
  })

  it('replaces text matches in body', () => {
    const request = createRequest({
      content: 'foo bar baz',
    })

    const selectorMatch: TextSelector = {
      type: 'text',
      from: 'body',
      value: 'bar',
    }

    const selectorNotMatch: TextSelector = {
      type: 'text',
      from: 'body',
      value: 'not-existing',
    }

    expect(replaceText(request, selectorMatch, 'TEST_VALUE')?.content).toEqual(
      'foo TEST_VALUE baz'
    )

    expect(replaceText(request, selectorNotMatch, 'TEST_VALUE')).toEqual(
      request
    )
  })

  it('replaces text matches in headers', () => {
    const request = createRequest({
      headers: [['content-type', 'application/json']],
    })

    const selectorMatch: TextSelector = {
      type: 'text',
      from: 'headers',
      value: 'application/json',
    }

    const selectorNotMatch: TextSelector = {
      type: 'text',
      from: 'headers',
      value: 'not-existing',
    }

    expect(replaceText(request, selectorMatch, 'TEST_VALUE')?.headers).toEqual([
      ['content-type', 'TEST_VALUE'],
    ])

    expect(replaceText(request, selectorNotMatch, 'TEST_VALUE')).toEqual(
      request
    )
  })
})

describe('replaceText with a replaceWith template', () => {
  const request = createRequest({
    method: 'POST',
    url: 'https://example.com/api/graphql',
    headers: [['content-type', 'application/json']],
    content: '[{"variables":{"id":2},"extensions":{"version":"4.0.10"}}]',
  })

  const VAR = "${correlation_vars['studentExamSessionsid']}"

  it('keeps the text around the value', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":2',
      replaceWith: '"id":{}',
    }

    expect(replaceText(request, selector, VAR)?.content).toBe(
      `[{"variables":{"id":${VAR}},"extensions":{"version":"4.0.10"}}]`
    )
  })

  it('can quote the value where the payload needs a string', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":2',
      replaceWith: '"id":"{}"',
    }

    expect(replaceText(request, selector, VAR)?.content).toContain(
      `"id":"${VAR}"`
    )
  })

  it('replaces the whole match when no template is given', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":2',
    }

    expect(replaceText(request, selector, VAR)?.content).toContain(
      `{"variables":{${VAR}}`
    )
  })

  it('takes the variable name as the slot', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":2',
      replaceWith: '"id":{studentExamSessionsid}',
    }

    expect(replaceText(request, selector, VAR)?.content).toContain(
      `"id":${VAR}`
    )
  })

  it('ignores a template that has no slot for the value', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":2',
      replaceWith: '"id":7',
    }

    expect(replaceText(request, selector, VAR)?.content).toContain(
      `{"variables":{${VAR}}`
    )
  })

  it('does not match a body that only differs by whitespace', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id": 2',
      replaceWith: '"id": {}',
    }

    expect(replaceText(request, selector, VAR)?.content).toBe(request.content)
  })

  it('leaves unrelated occurrences of the value alone', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":2',
      replaceWith: '"id":{}',
    }

    expect(replaceText(request, selector, VAR)?.content).toContain(
      '"version":"4.0.10"'
    )
  })
})

describe('replaceText with several find/replace pairs', () => {
  const request = createRequest({
    method: 'POST',
    url: 'https://example.com/api/graphql',
    headers: [['content-type', 'application/json']],
    content:
      '{"id":7,"excludeExamId":7,"extensions":{"version":"4.0.10"},"page":70}',
  })

  const VAR = "${correlation_vars['examId']}"

  it('applies every pair', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":7',
      replaceWith: '"id":{}',
      replacements: [
        { value: '"excludeExamId":7', replaceWith: '"excludeExamId":{}' },
      ],
    }

    expect(replaceText(request, selector, VAR)?.content).toBe(
      `{"id":${VAR},"excludeExamId":${VAR},"extensions":{"version":"4.0.10"},"page":70}`
    )
  })

  it('leaves a pair nobody typed in alone', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":7',
      replaceWith: '"id":{}',
      replacements: [{ value: '  ', replaceWith: '{}' }],
    }

    expect(replaceText(request, selector, VAR)?.content).toBe(
      `{"id":${VAR},"excludeExamId":7,"extensions":{"version":"4.0.10"},"page":70}`
    )
  })

  it('reads a selector saved before pairs existed', () => {
    const selector: TextSelector = {
      type: 'text',
      from: 'body',
      value: '"id":7',
      replaceWith: '"id":{}',
    }

    expect(replaceText(request, selector, VAR)?.content).toContain(
      `"id":${VAR}`
    )
  })

  it('replaces in every matching header', () => {
    const withHeaders = createRequest({
      headers: [
        ['x-exam', 'exam=7'],
        ['x-other', 'exclude=7'],
      ],
    })

    const selector: TextSelector = {
      type: 'text',
      from: 'headers',
      value: 'exam=7',
      replaceWith: 'exam={}',
      replacements: [{ value: 'exclude=7', replaceWith: 'exclude={}' }],
    }

    expect(replaceText(withHeaders, selector, VAR)?.headers).toEqual([
      ['x-exam', `exam=${VAR}`],
      ['x-other', `exclude=${VAR}`],
    ])
  })
})
