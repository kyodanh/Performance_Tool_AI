import { describe, expect, it } from 'vitest'

import { createGeneratorData } from '@/test/factories/generator'
import { createProxyData, createRequest } from '@/test/factories/proxyData'
import { CorrelationRule, VerificationRule } from '@/types/rules'

import { generateJMeterScript } from './jmeter'
import { buildExportPlan, parseDurationSeconds, rewriteMarkers } from './plan'
import { generateVUGenScript } from './vugen'

const loginResponse = createProxyData({
  id: '1',
  group: 'Login',
  request: createRequest({
    method: 'POST',
    url: 'https://example.com/login',
    path: '/login',
    content: '{"user":"a"}',
    headers: [['content-type', 'application/json']],
  }),
})

const followUp = createProxyData({
  id: '2',
  group: 'Login',
  request: createRequest({
    url: 'https://example.com/api/me?token=world',
    path: '/api/me',
    query: [['token', 'world']],
  }),
})

const correlationRule: CorrelationRule = {
  id: 'correlation-1',
  type: 'correlation',
  enabled: true,
  extractor: {
    filter: { path: '/login' },
    selector: { type: 'json', from: 'body', path: 'hello' },
    extractionMode: 'single',
  },
  replacer: { filter: { path: '' } },
}

const verificationRule: VerificationRule = {
  id: 'verification-1',
  type: 'verification',
  enabled: true,
  target: 'status',
  operator: 'equals',
  value: { type: 'number', number: 200 },
  filter: { path: '/login' },
}

const generator = createGeneratorData({
  rules: [correlationRule, verificationRule],
  options: {
    ...createGeneratorData().options,
    loadProfile: { executor: 'shared-iterations', vus: 5, iterations: 20 },
  },
})

const recording = [loginResponse, followUp]

describe('buildExportPlan', () => {
  it('attaches the extraction to the request whose response produced it', () => {
    const plan = buildExportPlan({ recording, generator })
    const [group] = plan.groups

    expect(group?.name).toBe('Login')
    expect(group?.requests[0]?.extractions).toEqual([
      {
        variable: 'correlation_0',
        selector: { type: 'json', from: 'body', path: 'hello' },
        filterPath: '/login',
      },
    ])
    expect(group?.requests[1]?.extractions).toEqual([])
  })

  it('names the extraction after the rule variable name', () => {
    const plan = buildExportPlan({
      recording,
      generator: createGeneratorData({
        rules: [
          {
            ...correlationRule,
            extractor: {
              ...correlationRule.extractor,
              variableName: 'auth token!',
            },
          },
        ],
      }),
    })

    // Unsafe characters are replaced, not rejected.
    expect(plan.groups[0]?.requests[0]?.extractions[0]?.variable).toBe(
      'auth_token_'
    )
  })

  it('carries verification rules as assertions', () => {
    const plan = buildExportPlan({ recording, generator })

    expect(plan.groups[0]?.requests[0]?.assertions).toEqual([
      { target: 'status', operator: 'equals', value: 200, negated: false },
    ])
  })

  it('warns instead of silently dropping custom code rules', () => {
    const plan = buildExportPlan({
      recording,
      generator: createGeneratorData({
        rules: [
          {
            id: 'custom-1',
            type: 'customCode',
            enabled: true,
            filter: { path: '' },
            placement: 'before',
            snippet: 'console.log(1)',
          },
        ],
      }),
    })

    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toContain('was not exported')
  })
})

describe('rewriteMarkers', () => {
  it('rewrites correlation, variable and data file markers', () => {
    const warnings: string[] = []

    const result = rewriteMarkers(
      `a=${"${correlation_vars['correlation_0']}"}&b=${"${VARS['token']}"}&c=${"${getUniqueItem(FILES['users'])['email']}"}`,
      (name) => `{${name}}`,
      warnings
    )

    expect(result).toBe('a={correlation_0}&b={token}&c={email}')
    expect(warnings).toEqual([])
  })

  it('keeps custom code markers verbatim and warns', () => {
    const warnings: string[] = []
    const input = `x=${'${getParameterizationValue0()}'}`

    expect(rewriteMarkers(input, (name) => `{${name}}`, warnings)).toBe(input)
    expect(warnings[0]).toContain('Custom code parameterization')
  })
})

describe('parseDurationSeconds', () => {
  it.each([
    ['30s', 30],
    ['1m', 60],
    ['1m30s', 90],
    ['1h2m3s', 3723],
  ])('parses %s', (input, expected) => {
    expect(parseDurationSeconds(input)).toBe(expected)
  })
})

describe('generateJMeterScript', () => {
  const script = generateJMeterScript({ recording, generator })

  it('is well-formed XML', () => {
    const parsed = new DOMParser().parseFromString(script, 'text/xml')

    expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0)
  })

  it('maps the load profile onto the thread group', () => {
    expect(script).toContain(
      '<stringProp name="ThreadGroup.num_threads">5</stringProp>'
    )
    expect(script).toContain(
      '<stringProp name="LoopController.loops">4</stringProp>'
    )
  })

  it('emits a transaction controller per group and a sampler per request', () => {
    expect(script.match(/<TransactionController /g)).toHaveLength(1)
    expect(script.match(/<HTTPSamplerProxy /g)).toHaveLength(2)
  })

  it('emits the json extractor and the status assertion', () => {
    expect(script).toContain(
      '<stringProp name="JSONPostProcessor.jsonPathExprs">$.hello</stringProp>'
    )
    expect(script).toContain(
      '<stringProp name="Assertion.test_field">Assertion.response_code</stringProp>'
    )
  })

  it('rewrites correlated values into JMeter parameters', () => {
    expect(script).toContain('${correlation_0}')
    expect(script).not.toContain('correlation_vars')
  })
})

describe('generateVUGenScript', () => {
  const script = generateVUGenScript({ recording, generator })

  it('wraps each group in a transaction', () => {
    expect(script).toContain('lr_start_transaction("Login");')
    expect(script).toContain('lr_end_transaction("Login", LR_AUTO);')
  })

  it('registers the extraction before the request it reads from', () => {
    const extraction = script.indexOf('web_reg_save_param_json')
    const request = script.indexOf('web_custom_request')

    expect(extraction).toBeGreaterThan(-1)
    expect(extraction).toBeLessThan(request)
  })

  it('scopes the json extraction with SEARCH_FILTERS', () => {
    expect(script).toContain('"Scope=Body"')
    expect(script).toContain('"RequestUrl=*/login*"')
  })

  it('verifies the status code after the request', () => {
    expect(script).toContain(
      'web_get_int_property(HTTP_INFO_RETURN_CODE) != 200'
    )
  })

  it('rewrites correlated values into VuGen parameters', () => {
    expect(script).toContain('{correlation_0}')
    expect(script).not.toContain('correlation_vars')
  })

  it('notes that the load profile belongs in the Controller', () => {
    expect(script).toContain('5 VUs, 20 iterations')
  })
})

describe('rendezvous', () => {
  const withRendezvous = createGeneratorData({
    rules: [],
    options: {
      ...createGeneratorData().options,
      rendezvous: { 'POST https://example.com/login': true },
    },
  })

  it('holds VUs before the marked request in VuGen', () => {
    const script = generateVUGenScript({
      recording,
      generator: withRendezvous,
    })

    expect(script).toContain('lr_rendezvous("POST_login");')
    // Before the request it guards, not after.
    expect(script.indexOf('lr_rendezvous')).toBeLessThan(
      script.indexOf('web_custom_request')
    )
    // Only the marked request gets one.
    expect(script.match(/lr_rendezvous/g)).toHaveLength(1)
  })

  it('holds threads before the marked sampler in JMeter', () => {
    const script = generateJMeterScript({
      recording,
      generator: withRendezvous,
    })

    expect(script).toContain('testclass="SyncTimer"')
    expect(script.match(/SyncTimer/g)?.length).toBeGreaterThan(0)
    expect(script).toContain('<longProp name="timeoutInMs">30000</longProp>')
  })

  it('leaves both exports untouched when nothing is marked', () => {
    expect(generateVUGenScript({ recording, generator })).not.toContain(
      'lr_rendezvous'
    )
    expect(generateJMeterScript({ recording, generator })).not.toContain(
      'SyncTimer'
    )
  })
})

describe('http timeout', () => {
  const withTimeout = createGeneratorData({
    options: { ...createGeneratorData().options, httpTimeout: 45 },
  })

  it('sets the runtime timeouts in VuGen', () => {
    const script = generateVUGenScript({ recording, generator: withTimeout })

    expect(script).toContain('web_set_timeout(CONNECT, "45");')
    expect(script).toContain('web_set_timeout(RECEIVE, "45");')
    expect(script).toContain('web_set_timeout(STEP, "45");')
  })

  it('sets the timeout once via HTTP Request Defaults in JMeter', () => {
    const script = generateJMeterScript({ recording, generator: withTimeout })

    expect(script).toContain(
      '<stringProp name="HTTPSampler.connect_timeout">45000</stringProp>'
    )
    expect(script).toContain(
      '<stringProp name="HTTPSampler.response_timeout">45000</stringProp>'
    )
    expect(script.match(/HTTPSampler\.response_timeout/g)).toHaveLength(1)
  })
})
