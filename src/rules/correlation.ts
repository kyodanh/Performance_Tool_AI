import { cloneDeep, escapeRegExp } from 'lodash-es'

import {
  createProxyData,
  createRequest,
  createResponse,
} from '@/test/factories/proxyData'
import { ProxyData, RequestSnippetSchema, Response, Request } from '@/types'
import {
  CorrelationRule,
  BeginEndSelector,
  RegexSelector,
  JsonSelector,
  CorrelationState,
  CorrelationRuleInstance,
  HeaderNameSelector,
  ExtractorSelector,
} from '@/types/rules'
import { exhaustive } from '@/utils/typescript'

import {
  correlationVariableName,
  replaceCorrelatedValues,
} from './correlation.utils'
import { matchBeginEnd } from './selectors/beginEnd'
import { getJsonObjectFromPath, stripJsonPathPrefix } from './selectors/json'
import { matchRegex } from './selectors/regex'
import {
  canonicalHeaderKey,
  matchFilter,
  generateSequentialInt,
  isJsonReqResp,
} from './utils'

type IdGenerator = Generator<number, number, number>

export function createCorrelationRuleInstance(
  rule: CorrelationRule,
  idGenerator: IdGenerator
): CorrelationRuleInstance {
  const state: CorrelationState = {
    extractedValue: undefined,
    count: 0,
    responsesExtracted: [],
    requestsReplaced: [],
    generatedUniqueId: undefined,
    matchedRequestIds: [],
  }

  function setState(newState: Partial<CorrelationState>) {
    Object.assign(state, newState)
  }

  return {
    rule,
    state,
    type: rule.type,
    apply: (requestSnippetSchema: RequestSnippetSchema) =>
      applyRule({ requestSnippetSchema, state, rule, idGenerator, setState }),
  }
}

function applyRule({
  requestSnippetSchema,
  state,
  rule,
  idGenerator,
  setState,
}: {
  requestSnippetSchema: RequestSnippetSchema
  state: CorrelationState
  rule: CorrelationRule
  idGenerator: IdGenerator
  setState: (newState: Partial<CorrelationState>) => void
}) {
  // this is the modified schema that we return to the accumulator
  const snippetSchemaReturnValue = cloneDeep(requestSnippetSchema)

  if (state.extractedValue !== undefined && state.extractedValue !== '') {
    // Skip replacement if replacer filter doesn't match
    if (
      rule.replacer &&
      !matchFilter(requestSnippetSchema.data.request, rule.replacer?.filter)
    ) {
      return snippetSchemaReturnValue
    }

    const replacedRequest = replaceCorrelatedValues({
      rule,
      extractedValue: state.extractedValue,
      uniqueId: state.generatedUniqueId ?? 0,
      request: requestSnippetSchema.data.request,
    })

    // Keep track of modified requests to display in preview
    if (replacedRequest !== requestSnippetSchema.data.request) {
      snippetSchemaReturnValue.data.request = replacedRequest

      setState({
        requestsReplaced: [
          ...state.requestsReplaced,
          {
            original: requestSnippetSchema.data.request,
            replaced: replacedRequest,
          },
        ],
        matchedRequestIds: [
          ...state.matchedRequestIds,
          requestSnippetSchema.data.id,
        ],
      })
    }
  }

  // Skip extraction if filter doesn't match
  if (!matchFilter(requestSnippetSchema.data.request, rule.extractor.filter)) {
    return snippetSchemaReturnValue
  }

  // try to extract the value
  // TODO: https://github.com/grafana/k6-studio/issues/277
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { extractedValue, generatedUniqueId, correlationExtractionSnippet } =
    tryCorrelationExtraction(
      rule,
      requestSnippetSchema.data,
      state.generatedUniqueId,
      idGenerator
    )

  if (extractedValue !== undefined && correlationExtractionSnippet) {
    // Skip extraction and bump count if value is already extracted and we are in single extraction mode
    if (state.extractedValue && rule.extractor.extractionMode === 'single') {
      setState({
        count: state.count + 1,
      })
      return snippetSchemaReturnValue
    }

    setState({
      // TODO: https://github.com/grafana/k6-studio/issues/277
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      extractedValue,
      generatedUniqueId: generatedUniqueId,
      responsesExtracted: [
        ...state.responsesExtracted,
        requestSnippetSchema.data,
      ],

      count: state.count + 1,
    })

    return {
      ...snippetSchemaReturnValue,
      after: [
        ...requestSnippetSchema['after'],
        // The extractors emit the generated id; rename it once here so every
        // snippet honours the rule's own variable name.
        wrapExtractionSnippet(
          correlationExtractionSnippet.replaceAll(
            `correlation_vars['correlation_${generatedUniqueId}']`,
            `correlation_vars['${correlationVariableName(rule, generatedUniqueId)}']`
          ),
          correlationVariableName(rule, generatedUniqueId),
          rule.extractor.selector,
          requestSnippetSchema.data
        ),
      ],
    }
  }

  return snippetSchemaReturnValue
}

/** Where the value was meant to come from, in the rule's own terms. */
const describeExtractor = (selector: ExtractorSelector) => {
  switch (selector.type) {
    case 'json':
      return `JSON path '${selector.path}' in the response body`
    case 'regex':
      return `regex /${selector.regex}/ against the response ${selector.from}`
    case 'begin-end':
      return `text between '${selector.begin}' and '${selector.end}' in the response ${selector.from}`
    case 'header-name':
      return `response header '${selector.name}'`
    default:
      return exhaustive(selector)
  }
}

// ponytail: extraction runs against live responses, which may differ from the
// recording (empty body, non-JSON, missing header). Without the try/catch the
// extractor throws with an opaque message, e.g. `resp.json()` on an empty body
// raises "cannot parse json ... unexpected end of JSON input".
//
// The iteration is then stopped on purpose: an unset variable interpolates as
// the string "undefined" into every request that references it, so one failed
// extraction turns into a run of 401s that look like real API failures and
// skew the response-time metrics. Failing here points at the actual cause.
//
// The message carries what the rule expected (selector + recorded request)
// alongside what the live response actually was, since the stack trace only
// ever points at a line of generated script.
const wrapExtractionSnippet = (
  snippet: string,
  variableName: string,
  selector: ExtractorSelector,
  data: ProxyData
) => {
  // The name is sanitized to [A-Za-z0-9_] so it is safe to quote inline.
  const target = `correlation_vars['${variableName}']`

  const expected = `Expected ${describeExtractor(selector)}`
  const source = `Source request: ${data.request.method} ${data.request.url}${
    data.response ? ` (recorded ${data.response.statusCode})` : ''
  }`

  return `
    var extractionError = undefined
    try {${snippet}
    } catch (error) {
      extractionError = error
    }
    if (${target} === undefined || ${target} === null) {
      throw new Error(
        ${JSON.stringify(`Correlation variable '${variableName}' was not extracted from the live response.`)} +
        ${JSON.stringify(`\n  ${expected}`)} +
        ${JSON.stringify(`\n  ${source}`)} +
        '\\n  Live response: status ' + resp.status + ', ' + String(resp.body || '').length + ' bytes' +
        '\\n  Body (first 200 chars): ' + String(resp.body || '').slice(0, 200) +
        (extractionError ? '\\n  Extractor threw: ' + extractionError : '') +
        ${JSON.stringify('\n  Iteration stopped to avoid sending "undefined" downstream. Fix the correlation rule, or check whether the source request above actually succeeded under load.')}
      )
    }`
}

const noCorrelationResult = {
  extractedValue: undefined,
  correlationExtractionSnippet: undefined,
  generatedUniqueId: undefined,
}

const tryCorrelationExtraction = (
  rule: CorrelationRule,
  proxyData: ProxyData,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  // correlation works on responses so if we have no response we should return early except in case the selector is checking
  // the url, in that case the value is extracted from a request so it's fine to not have a response
  if (
    !proxyData.response &&
    (!('from' in rule.extractor.selector) ||
      rule.extractor.selector.from !== 'url')
  ) {
    return noCorrelationResult
  }

  switch (rule.extractor.selector.type) {
    case 'begin-end':
      return extractCorrelationBeginEnd(
        rule.extractor.selector,
        proxyData,
        uniqueId,
        sequentialIdGenerator
      )
    case 'regex':
      return extractCorrelationRegex(
        rule.extractor.selector,
        proxyData,
        uniqueId,
        sequentialIdGenerator
      )
    case 'json':
      return extractCorrelationJsonBody(
        rule.extractor.selector,
        proxyData.response,
        uniqueId,
        sequentialIdGenerator
      )

    case 'header-name':
      return extractCorrelationHeaderByName(
        rule.extractor.selector,
        proxyData.response,
        uniqueId,
        sequentialIdGenerator
      )
    default:
      return exhaustive(rule.extractor.selector)
  }
}

const extractCorrelationBeginEnd = (
  selector: BeginEndSelector,
  proxyData: ProxyData,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  switch (selector.from) {
    case 'body':
      return extractCorrelationBeginEndBody(
        selector,
        proxyData.response,
        uniqueId,
        sequentialIdGenerator
      )
    case 'headers':
      return extractCorrelationBeginEndHeaders(
        selector,
        proxyData.response,
        uniqueId,
        sequentialIdGenerator
      )
    case 'url':
      return extractCorrelationBeginEndUrl(
        selector,
        proxyData.request,
        uniqueId,
        sequentialIdGenerator
      )
    default:
      return exhaustive(selector.from)
  }
}

const extractCorrelationRegex = (
  selector: RegexSelector,
  proxyData: ProxyData,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  switch (selector.from) {
    case 'body':
      return extractCorrelationRegexBody(
        selector,
        proxyData.response,
        uniqueId,
        sequentialIdGenerator
      )
    case 'headers':
      return extractCorrelationRegexHeaders(
        selector,
        proxyData.response,
        uniqueId,
        sequentialIdGenerator
      )
    case 'url':
      return extractCorrelationRegexUrl(
        selector,
        proxyData.request,
        uniqueId,
        sequentialIdGenerator
      )
    default:
      return exhaustive(selector.from)
  }
}

const getCorrelationVariableSnippet = (uniqueId: number) => {
  return `if (match) {
      correlation_vars['correlation_${uniqueId}'] = match[1]
    }`
}

const getCorrelationBeginEndSnippet = (
  selector: BeginEndSelector,
  matchStatement: string,
  uniqueId: number
) => {
  const begin = escapeRegExp(selector.begin)
  const end = escapeRegExp(selector.end)

  // TODO: replace regex with findBetween from k6-utils once we have imports
  return `
    regex = new RegExp('${begin}(.*?)${end}')
    match = ${matchStatement}
    ${getCorrelationVariableSnippet(uniqueId)}`
}

const getCorrelationRegexSnippet = (
  selector: RegexSelector,
  matchStatement: string,
  uniqueId: number
) => {
  return `
    regex = new RegExp('${selector.regex}')
    match = ${matchStatement}
    ${getCorrelationVariableSnippet(uniqueId)}`
}

const extractCorrelationBeginEndBody = (
  selector: BeginEndSelector,
  response: Response | undefined,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  if (!response) {
    throw new Error('no response to extract from')
  }

  const extractedValue = matchBeginEnd(
    response.content ?? '',
    selector.begin,
    selector.end
  )

  if (!extractedValue) {
    return noCorrelationResult
  }

  const generatedUniqueId = uniqueId ?? sequentialIdGenerator.next().value

  const correlationExtractionSnippet = getCorrelationBeginEndSnippet(
    selector,
    'resp.body.match(regex)',
    generatedUniqueId
  )

  return {
    extractedValue,
    correlationExtractionSnippet,
    generatedUniqueId,
  }
}

const extractCorrelationBeginEndHeaders = (
  selector: BeginEndSelector,
  response: Response | undefined,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  if (!response) {
    throw new Error('no response to extract from')
  }

  // Note: currently matches only the first occurrence
  for (const [key, value] of response.headers) {
    const extractedValue = matchBeginEnd(value, selector.begin, selector.end)

    if (!extractedValue) {
      continue
    }

    const generatedUniqueId = uniqueId ?? sequentialIdGenerator.next().value
    const correlationExtractionSnippet = getCorrelationBeginEndSnippet(
      selector,
      `resp.headers["${canonicalHeaderKey(key)}"].match(regex)`,
      generatedUniqueId
    )

    return {
      extractedValue,
      correlationExtractionSnippet,
      generatedUniqueId,
    }
  }

  return noCorrelationResult
}

const extractCorrelationHeaderByName = (
  selector: HeaderNameSelector,
  response: Response | undefined,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  if (!response) {
    throw new Error('no response to extract from')
  }

  const header = response.headers.find(
    ([key]) => canonicalHeaderKey(key) === canonicalHeaderKey(selector.name)
  )

  if (!header) {
    return noCorrelationResult
  }

  const generatedUniqueId = uniqueId ?? sequentialIdGenerator.next().value

  const correlationExtractionSnippet = `
    match = resp.headers["${canonicalHeaderKey(selector.name)}"]
    if (match) {
      correlation_vars['correlation_${generatedUniqueId}'] = match
    }`

  return {
    extractedValue: header[1],
    correlationExtractionSnippet,
    generatedUniqueId,
  }
}

const extractCorrelationBeginEndUrl = (
  selector: BeginEndSelector,
  request: Request,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  const extractedValue = matchBeginEnd(
    request.url,
    selector.begin,
    selector.end
  )

  if (!extractedValue) {
    return noCorrelationResult
  }

  const generatedUniqueId = uniqueId ?? sequentialIdGenerator.next().value

  const correlationExtractionSnippet = getCorrelationBeginEndSnippet(
    selector,
    'resp.url.match(regex)',
    generatedUniqueId
  )

  return {
    extractedValue,
    correlationExtractionSnippet,
    generatedUniqueId,
  }
}

const extractCorrelationRegexBody = (
  selector: RegexSelector,
  response: Response | undefined,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  if (!response) {
    throw new Error('no response to extract from')
  }

  const extractedValue = matchRegex(response.content ?? '', selector.regex)

  if (!extractedValue) {
    return noCorrelationResult
  }

  const generatedUniqueId = uniqueId ?? sequentialIdGenerator.next().value

  const correlationExtractionSnippet = getCorrelationRegexSnippet(
    selector,
    'resp.body.match(regex)',
    generatedUniqueId
  )

  return {
    extractedValue,
    correlationExtractionSnippet,
    generatedUniqueId,
  }
}

const extractCorrelationRegexHeaders = (
  selector: RegexSelector,
  response: Response | undefined,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  if (!response) {
    throw new Error('no response to extract from')
  }

  // Note: currently matches only the first occurrence
  for (const [key, value] of response.headers) {
    const extractedValue = matchRegex(value, selector.regex)

    if (!extractedValue) {
      continue
    }

    const generatedUniqueId = uniqueId ?? sequentialIdGenerator.next().value

    const correlationExtractionSnippet = getCorrelationRegexSnippet(
      selector,
      `resp.headers["${canonicalHeaderKey(key)}"].match(regex)`,
      generatedUniqueId
    )

    return {
      extractedValue,
      correlationExtractionSnippet,
      generatedUniqueId,
    }
  }

  return noCorrelationResult
}

const extractCorrelationRegexUrl = (
  selector: RegexSelector,
  request: Request,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  const extractedValue = matchRegex(request.url, selector.regex)

  if (!extractedValue) {
    return noCorrelationResult
  }

  const generatedUniqueId = uniqueId ?? sequentialIdGenerator.next().value

  const correlationExtractionSnippet = getCorrelationRegexSnippet(
    selector,
    'resp.url.match(regex)',
    generatedUniqueId
  )

  return {
    extractedValue,
    correlationExtractionSnippet,
    generatedUniqueId,
  }
}

const extractCorrelationJsonBody = (
  selector: JsonSelector,
  response: Response | undefined,
  uniqueId: number | undefined,
  sequentialIdGenerator: IdGenerator
) => {
  if (!response) {
    throw new Error('no response to extract from')
  }

  if (!isJsonReqResp(response)) {
    return noCorrelationResult
  }

  // TODO: https://github.com/grafana/k6-studio/issues/277
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const extractedValue = getJsonObjectFromPath(
    response.content ?? '',
    selector.path
  )

  if (
    extractedValue === undefined ||
    (Array.isArray(extractedValue) && extractedValue.length === 0)
  ) {
    return noCorrelationResult
  }

  const generatedUniqueId = uniqueId ?? sequentialIdGenerator.next().value

  // array indexing doesn't start with a dot so we add it only in the other cases
  const lodashPath = stripJsonPathPrefix(selector.path)
  const json_path = lodashPath.startsWith('[') ? lodashPath : `.${lodashPath}`

  const correlationExtractionSnippet = `
correlation_vars['correlation_${generatedUniqueId}'] = resp.json()${json_path}`
  return {
    // TODO: https://github.com/grafana/k6-studio/issues/277
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    extractedValue,
    correlationExtractionSnippet,
    generatedUniqueId,
  }
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest

  // Whitespace-stripped extraction snippet for a given variable + expression,
  // so the assertions below don't repeat the guard emitted after every extractor.
  const jsonSelector: ExtractorSelector = {
    type: 'json',
    from: 'body',
    path: 'user_id',
  }

  const expectedExtraction = (
    name: string,
    expression: string,
    data: ProxyData = createProxyData()
  ) =>
    wrapExtractionSnippet(
      `correlation_vars['${name}'] = ${expression}`,
      name,
      jsonSelector,
      data
    ).replace(/\s/g, '')

  const generateResponse = (content: string): Response => {
    return {
      statusCode: 200,
      path: '/api/v1/foo',
      reason: 'OK',
      httpVersion: '1.1',
      headers: [['Content-Type', 'application/json']],
      cookies: [],
      content: content,
      contentLength: 0,
      timestampStart: 0,
      timestampEnd: 0,
    }
  }

  const generateRequest = (): Request => {
    return {
      method: 'POST',
      url: 'http://test.k6.io/api/v1/foo',
      headers: [],
      cookies: [],
      query: [],
      scheme: 'http',
      host: 'localhost:3000',
      content: '',
      path: '/api/v1/foo',
      timestampStart: 0,
      timestampEnd: 0,
      contentLength: 0,
      httpVersion: '1.1',
    }
  }

  it('extract correlation json body', () => {
    const sequentialIdGenerator = generateSequentialInt()
    const response: Response = generateResponse(
      JSON.stringify({ user_id: '444' })
    )

    const selector: JsonSelector = {
      type: 'json',
      from: 'body',
      path: 'user_id',
    }

    const correlationExtractionSnippet = `
correlation_vars['correlation_1'] = resp.json().user_id`
    const expectedResult = {
      extractedValue: '444',
      correlationExtractionSnippet,
      generatedUniqueId: 1,
    }

    expect(
      extractCorrelationJsonBody(selector, response, 1, sequentialIdGenerator)
    ).toStrictEqual(expectedResult)
  })

  it('extract correlation begin end body', () => {
    const sequentialIdGenerator = generateSequentialInt()
    const response: Response = generateResponse('noise<hello>bob<world>blah')

    const selector: BeginEndSelector = {
      type: 'begin-end',
      from: 'body',
      begin: 'hello>',
      end: '<world>',
    }

    const correlationExtractionSnippet = `
    regex = new RegExp('${selector.begin}(.*?)${selector.end}')
    match = resp.body.match(regex)
    if (match) {
      correlation_vars['correlation_1'] = match[1]
    }`
    const expectedResult = {
      extractedValue: 'bob',
      correlationExtractionSnippet,
      generatedUniqueId: 1,
    }

    expect(
      extractCorrelationBeginEndBody(
        selector,
        response,
        1,
        sequentialIdGenerator
      )
    ).toStrictEqual(expectedResult)
  })

  it('extract correlation begin end header', () => {
    const sequentialIdGenerator = generateSequentialInt()
    const response: Response = generateResponse('')

    const selector: BeginEndSelector = {
      type: 'begin-end',
      from: 'headers',
      begin: 'application',
      end: 'json',
    }

    const correlationExtractionSnippet = `
    regex = new RegExp('${selector.begin}(.*?)${selector.end}')
    match = resp.headers["${canonicalHeaderKey('Content-type')}"].match(regex)
    if (match) {
      correlation_vars['correlation_1'] = match[1]
    }`
    const expectedResult = {
      extractedValue: '/',
      correlationExtractionSnippet,
      generatedUniqueId: 1,
    }

    expect(
      extractCorrelationBeginEndHeaders(
        selector,
        response,
        1,
        sequentialIdGenerator
      )
    ).toStrictEqual(expectedResult)
  })

  it('extract correlation begin end url', () => {
    const sequentialIdGenerator = generateSequentialInt()
    const request: Request = generateRequest()

    const selector: BeginEndSelector = {
      type: 'begin-end',
      from: 'url',
      begin: 'api/',
      end: '/foo',
    }

    const correlationExtractionSnippet = `
    regex = new RegExp('${selector.begin}(.*?)${selector.end}')
    match = resp.url.match(regex)
    if (match) {
      correlation_vars['correlation_1'] = match[1]
    }`
    const expectedResult = {
      extractedValue: 'v1',
      correlationExtractionSnippet,
      generatedUniqueId: 1,
    }

    expect(
      extractCorrelationBeginEndUrl(selector, request, 1, sequentialIdGenerator)
    ).toStrictEqual(expectedResult)
  })

  it('extract correlation regex body', () => {
    const sequentialIdGenerator = generateSequentialInt()
    const response: Response = generateResponse('noise<hello>bob<world>blah')

    const selector: RegexSelector = {
      type: 'regex',
      from: 'body',
      regex: 'hello>(.*?)<world>',
    }

    const correlationExtractionSnippet = `
    regex = new RegExp('${selector.regex}')
    match = resp.body.match(regex)
    if (match) {
      correlation_vars['correlation_1'] = match[1]
    }`
    const expectedResult = {
      extractedValue: 'bob',
      correlationExtractionSnippet,
      generatedUniqueId: 1,
    }

    expect(
      extractCorrelationRegexBody(selector, response, 1, sequentialIdGenerator)
    ).toStrictEqual(expectedResult)
  })

  it('extract correlation regex header', () => {
    const sequentialIdGenerator = generateSequentialInt()
    const response: Response = generateResponse('')

    const selector: RegexSelector = {
      type: 'regex',
      from: 'headers',
      regex: 'application(.*?)json',
    }

    const correlationExtractionSnippet = `
    regex = new RegExp('${selector.regex}')
    match = resp.headers["${canonicalHeaderKey('Content-type')}"].match(regex)
    if (match) {
      correlation_vars['correlation_1'] = match[1]
    }`
    const expectedResult = {
      extractedValue: '/',
      correlationExtractionSnippet,
      generatedUniqueId: 1,
    }

    expect(
      extractCorrelationRegexHeaders(
        selector,
        response,
        1,
        sequentialIdGenerator
      )
    ).toStrictEqual(expectedResult)
  })

  it('extract correlation regex url', () => {
    const sequentialIdGenerator = generateSequentialInt()
    const request: Request = generateRequest()

    const selector: RegexSelector = {
      type: 'regex',
      from: 'url',
      regex: 'api/(.*?)/foo',
    }

    const correlationExtractionSnippet = `
    regex = new RegExp('${selector.regex}')
    match = resp.url.match(regex)
    if (match) {
      correlation_vars['correlation_1'] = match[1]
    }`
    const expectedResult = {
      extractedValue: 'v1',
      correlationExtractionSnippet,
      generatedUniqueId: 1,
    }

    expect(
      extractCorrelationRegexUrl(selector, request, 1, sequentialIdGenerator)
    ).toStrictEqual(expectedResult)
  })

  it('extracts correlation header by name', () => {
    const sequentialIdGenerator = generateSequentialInt()
    const response: Response = generateResponse('')

    const selector: HeaderNameSelector = {
      type: 'header-name',
      from: 'headers',
      name: 'Content-Type',
    }

    const correlationExtractionSnippet = `
    match = resp.headers["${canonicalHeaderKey('Content-type')}"]
    if (match) {
      correlation_vars['correlation_1'] = match
    }`

    const expectedResult = {
      extractedValue: 'application/json',
      correlationExtractionSnippet,
      generatedUniqueId: 1,
    }

    expect(
      extractCorrelationHeaderByName(
        selector,
        response,
        1,
        sequentialIdGenerator
      )
    ).toStrictEqual(expectedResult)
  })

  it('extracts only first correlation match in single mode', () => {
    const recording = [
      createProxyData({
        response: createResponse({
          content: JSON.stringify({ user_id: '444' }),
        }),
      }),
      createProxyData({
        request: createRequest({
          url: 'http://test.k6.io/api/v1/login?user_id=444',
        }),
        response: createResponse({
          content: JSON.stringify({ user_id: '444' }),
        }),
      }),
    ]
    const sequentialIdGenerator = generateSequentialInt()

    const rule: CorrelationRule = {
      type: 'correlation',
      id: '1',
      enabled: true,
      extractor: {
        filter: { path: '' },
        selector: {
          type: 'json',
          from: 'body',
          path: 'user_id',
        },
        extractionMode: 'single',
      },
    }

    const ruleInstance = createCorrelationRuleInstance(
      rule,
      sequentialIdGenerator
    )

    const requestSnippets = recording.map((data) =>
      ruleInstance.apply({ data, before: [], after: [], checks: [] })
    )

    expect(requestSnippets[0]?.after[0]?.replace(/\s/g, '')).toBe(
      expectedExtraction('correlation_0', 'resp.json().user_id')
    )
    expect(ruleInstance.state.extractedValue).toBe('444')
    expect(requestSnippets[1]?.after).toEqual([])
  })

  it('uses the rule variable name in the extraction snippet', () => {
    const data = createProxyData({
      response: createResponse({
        content: JSON.stringify({ user_id: '444' }),
      }),
    })

    const rule: CorrelationRule = {
      type: 'correlation',
      id: '1',
      enabled: true,
      extractor: {
        filter: { path: '' },
        selector: { type: 'json', from: 'body', path: 'user_id' },
        variableName: 'user id',
        extractionMode: 'single',
      },
    }

    const ruleInstance = createCorrelationRuleInstance(
      rule,
      generateSequentialInt()
    )

    const snippet = ruleInstance.apply({
      data,
      before: [],
      after: [],
      checks: [],
    })

    expect(snippet.after[0]?.replace(/\s/g, '')).toBe(
      expectedExtraction('user_id', 'resp.json().user_id')
    )
  })

  it('extracts multiple correlation match in multiple mode', () => {
    const recording = [
      createProxyData({
        response: createResponse({
          content: JSON.stringify({ user_id: '444' }),
        }),
      }),
      createProxyData({
        request: createRequest({
          url: 'http://test.k6.io/api/v1/login?user_id=444',
        }),
        response: createResponse({
          content: JSON.stringify({ user_id: '777' }),
        }),
      }),
    ]
    const sequentialIdGenerator = generateSequentialInt()

    const rule: CorrelationRule = {
      type: 'correlation',
      id: '1',
      enabled: true,
      extractor: {
        filter: { path: '' },
        selector: {
          type: 'json',
          from: 'body',
          path: 'user_id',
        },
        extractionMode: 'multiple',
      },
    }

    const ruleInstance = createCorrelationRuleInstance(
      rule,
      sequentialIdGenerator
    )

    const requestSnippets = recording.map((data) =>
      ruleInstance.apply({ data, before: [], after: [], checks: [] })
    )

    expect(requestSnippets[0]?.after[0]?.replace(/\s/g, '')).toBe(
      expectedExtraction('correlation_0', 'resp.json().user_id')
    )
    expect(requestSnippets[1]?.after[0]?.replace(/\s/g, '')).toBe(
      // The guard names the request it extracted from, so the second snippet
      // carries the second recording's URL rather than the first's.
      expectedExtraction('correlation_0', 'resp.json().user_id', recording[1])
    )
    expect(ruleInstance.state.extractedValue).toBe('777')
  })

  it('does not apply replacer if filter does not match', () => {
    const recording = [
      createProxyData({
        response: createResponse({
          content: JSON.stringify({ user_id: '444' }),
        }),
      }),
      createProxyData({
        request: createRequest({
          url: 'http://test.k6.io/api/v1/login?user_id=444',
        }),
        response: createResponse({
          content: JSON.stringify({ user_id: '444' }),
        }),
      }),
    ]
    const sequentialIdGenerator = generateSequentialInt()

    const rule: CorrelationRule = {
      type: 'correlation',
      id: '1',
      enabled: true,
      extractor: {
        filter: { path: '' },
        selector: {
          type: 'json',
          from: 'body',
          path: 'user_id',
        },
        extractionMode: 'single',
      },

      replacer: {
        filter: { path: 'nomatch' },
        selector: {
          type: 'regex',
          from: 'url',
          regex: 'user_id=(\\d+)',
        },
      },
    }

    const ruleInstance = createCorrelationRuleInstance(
      rule,
      sequentialIdGenerator
    )

    const requestSnippets = recording.map((data) =>
      ruleInstance.apply({ data, before: [], after: [], checks: [] })
    )

    expect(requestSnippets[1]?.data.request.url).toEqual(
      'http://test.k6.io/api/v1/login?user_id=444'
    )
  })

  it('applies only replacer filter when replacer selector is empty', () => {
    const recording = [
      createProxyData({
        response: createResponse({
          content: JSON.stringify({ user_id: '444' }),
        }),
      }),
      createProxyData({
        request: createRequest({
          url: 'http://test.k6.io/api/v1/login?user_id=444',
        }),
        response: createResponse({
          content: JSON.stringify({ user_id: '444' }),
        }),
      }),
    ]
    const sequentialIdGenerator = generateSequentialInt()

    const rule: CorrelationRule = {
      type: 'correlation',
      id: '1',
      enabled: true,
      extractor: {
        filter: { path: '' },
        selector: {
          type: 'json',
          from: 'body',
          path: 'user_id',
        },
        extractionMode: 'single',
      },

      replacer: {
        filter: { path: '/login' },
      },
    }

    const ruleInstance = createCorrelationRuleInstance(
      rule,
      sequentialIdGenerator
    )

    const requestSnippets = recording.map((data) =>
      ruleInstance.apply({ data, before: [], after: [], checks: [] })
    )

    expect(requestSnippets[1]?.data.request.url).toEqual(
      "http://test.k6.io/api/v1/login?user_id=${correlation_vars['correlation_0']}"
    )
  })

  it('applies replacer when replacer selector is present', () => {
    const recording = [
      createProxyData({
        response: createResponse({
          content: JSON.stringify({ user: 'test' }),
        }),
      }),
      createProxyData({
        request: createRequest({
          url: 'https://quickpizza.grafana.com/api/admin/login?user=admin&password=admin',
        }),
        response: createResponse({
          content: JSON.stringify({ user: 'test' }),
        }),
      }),
    ]
    const sequentialIdGenerator = generateSequentialInt()

    const rule: CorrelationRule = {
      type: 'correlation',
      id: '1',
      enabled: true,
      extractor: {
        filter: { path: '' },
        selector: {
          type: 'json',
          from: 'body',
          path: 'user',
        },
        extractionMode: 'single',
      },

      replacer: {
        filter: { path: '/login' },
        selector: {
          type: 'begin-end',
          from: 'url',
          begin: 'user=',
          end: '&',
        },
      },
    }

    const ruleInstance = createCorrelationRuleInstance(
      rule,
      sequentialIdGenerator
    )

    const requestSnippets = recording.map((data) =>
      ruleInstance.apply({ data, before: [], after: [], checks: [] })
    )

    expect(requestSnippets[1]?.data.request.url).toEqual(
      "https://quickpizza.grafana.com/api/admin/login?user=${correlation_vars['correlation_0']}&password=admin"
    )
  })
}
