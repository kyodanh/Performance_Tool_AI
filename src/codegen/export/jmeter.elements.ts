import { Header } from '@/types'
import { Variable } from '@/types/testData'
import { TestOptions, ThinkTime } from '@/types/testOptions'
import { exhaustive } from '@/utils/typescript'

import {
  Assertion,
  Extraction,
  PlannedRequest,
  jsonPathFromLodashPath,
  parseDurationSeconds,
} from './plan'

export function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function hashTree(children: string) {
  return children.trim() === ''
    ? '<hashTree/>'
    : `<hashTree>\n${children}\n</hashTree>`
}

export function threadGroup(load: TestOptions['loadProfile']) {
  const { threads, rampSeconds, durationSeconds, loops } = loadShape(load)
  const scheduler = durationSeconds > 0

  return `
    <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group" enabled="true">
      <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
      <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
        <boolProp name="LoopController.continue_forever">false</boolProp>
        <stringProp name="LoopController.loops">${scheduler ? -1 : loops}</stringProp>
      </elementProp>
      <stringProp name="ThreadGroup.num_threads">${threads}</stringProp>
      <stringProp name="ThreadGroup.ramp_time">${rampSeconds}</stringProp>
      <boolProp name="ThreadGroup.scheduler">${scheduler}</boolProp>
      <stringProp name="ThreadGroup.duration">${durationSeconds}</stringProp>
      <stringProp name="ThreadGroup.delay">0</stringProp>
    </ThreadGroup>
  `
}

function loadShape(load: TestOptions['loadProfile']) {
  if (load.executor === 'shared-iterations') {
    const threads = load.vus ?? 1
    const iterations = load.iterations ?? 1

    return {
      threads,
      loops: Math.max(1, Math.ceil(iterations / threads)),
      rampSeconds: 0,
      durationSeconds: 0,
    }
  }

  // JMeter's built-in thread group has a single ramp, so the stages collapse
  // into "ramp to the highest target, hold for the total duration".
  const durationSeconds = load.stages.reduce(
    (total, stage) => total + parseDurationSeconds(stage.duration),
    0
  )
  const rampSeconds = load.stages
    .slice(0, indexOfPeak(load.stages) + 1)
    .reduce((total, stage) => total + parseDurationSeconds(stage.duration), 0)

  return {
    threads: Math.max(1, ...load.stages.map((stage) => stage.target)),
    loops: -1,
    rampSeconds,
    durationSeconds,
  }
}

function indexOfPeak(stages: { target: number }[]) {
  return stages.reduce(
    (peak, stage, index) =>
      stage.target > (stages[peak]?.target ?? -1) ? index : peak,
    0
  )
}

export function userDefinedVariables(variables: Variable[]) {
  const args = variables
    .map(
      ({ name, value }) => `
      <elementProp name="${escapeXml(name)}" elementType="Argument">
        <stringProp name="Argument.name">${escapeXml(name)}</stringProp>
        <stringProp name="Argument.value">${escapeXml(value)}</stringProp>
        <stringProp name="Argument.metadata">=</stringProp>
      </elementProp>`
    )
    .join('\n')

  return `
    <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
      <collectionProp name="Arguments.arguments">${args}
      </collectionProp>
    </elementProp>
  `
}

/**
 * HTTP Request Defaults — JMeter propagates these to every sampler in scope,
 * so the timeout is set once instead of on each request.
 */
export function httpDefaults(timeoutSeconds: number) {
  const ms = timeoutSeconds * 1000

  return `
    <ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP Request Defaults" enabled="true">
      <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
      <stringProp name="HTTPSampler.connect_timeout">${ms}</stringProp>
      <stringProp name="HTTPSampler.response_timeout">${ms}</stringProp>
    </ConfigTestElement>
    <hashTree/>
  `
}

export function cookieManager() {
  return `
    <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true">
      <collectionProp name="CookieManager.cookies"/>
      <boolProp name="CookieManager.clearEachIteration">true</boolProp>
      <stringProp name="CookieManager.policy">standard</stringProp>
    </CookieManager>
    <hashTree/>
  `
}

export function csvDataSet(fileName: string) {
  return `
    <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="${escapeXml(fileName)}" enabled="true">
      <stringProp name="filename">${escapeXml(fileName)}</stringProp>
      <stringProp name="delimiter">,</stringProp>
      <boolProp name="ignoreFirstLine">false</boolProp>
      <stringProp name="variableNames"></stringProp>
      <boolProp name="quotedData">true</boolProp>
      <boolProp name="recycle">true</boolProp>
      <boolProp name="stopThread">false</boolProp>
      <stringProp name="shareMode">shareMode.all</stringProp>
    </CSVDataSet>
    <hashTree/>
  `
}

export function headerManager(headers: Header[]) {
  if (headers.length === 0) {
    return ''
  }

  const items = headers
    .map(
      ([name, value]) => `
      <elementProp name="" elementType="Header">
        <stringProp name="Header.name">${escapeXml(name)}</stringProp>
        <stringProp name="Header.value">${escapeXml(value)}</stringProp>
      </elementProp>`
    )
    .join('\n')

  return `
    <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
      <collectionProp name="HeaderManager.headers">${items}
      </collectionProp>
    </HeaderManager>
    <hashTree/>
  `
}

export function sampler(request: PlannedRequest) {
  const { protocol, host, port, pathWithQuery } = splitUrl(request.url)
  const hasBody = request.content !== null && request.content !== ''

  const body = hasBody
    ? `
      <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
      <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
        <collectionProp name="Arguments.arguments">
          <elementProp name="" elementType="HTTPArgument">
            <boolProp name="HTTPArgument.always_encode">false</boolProp>
            <stringProp name="Argument.value">${escapeXml(request.content ?? '')}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>`
    : `
      <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>`

  return `
    <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${escapeXml(request.name)}" enabled="true">
      ${body}
      <stringProp name="HTTPSampler.domain">${escapeXml(host)}</stringProp>
      <stringProp name="HTTPSampler.port">${escapeXml(port)}</stringProp>
      <stringProp name="HTTPSampler.protocol">${escapeXml(protocol)}</stringProp>
      <stringProp name="HTTPSampler.path">${escapeXml(pathWithQuery)}</stringProp>
      <stringProp name="HTTPSampler.method">${request.method}</stringProp>
      <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
      <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
      <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
      <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
    </HTTPSamplerProxy>
  `
}

function splitUrl(url: string) {
  try {
    const parsed = new URL(url)

    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname,
      port: parsed.port,
      pathWithQuery: `${parsed.pathname}${parsed.search}`,
    }
  } catch {
    // Markers can make the URL unparseable; fall back to a full-URL path.
    return { protocol: '', host: '', port: '', pathWithQuery: url }
  }
}

export function extractor({ variable, selector }: Extraction) {
  switch (selector.type) {
    case 'begin-end':
      return `
        <BoundaryExtractor guiclass="BoundaryExtractorGui" testclass="BoundaryExtractor" testname="Extract ${escapeXml(variable)}" enabled="true">
          <stringProp name="BoundaryExtractor.useHeaders">${scope(selector.from)}</stringProp>
          <stringProp name="BoundaryExtractor.refname">${escapeXml(variable)}</stringProp>
          <stringProp name="BoundaryExtractor.lboundary">${escapeXml(selector.begin)}</stringProp>
          <stringProp name="BoundaryExtractor.rboundary">${escapeXml(selector.end)}</stringProp>
          <stringProp name="BoundaryExtractor.default"></stringProp>
          <stringProp name="BoundaryExtractor.match_number">1</stringProp>
        </BoundaryExtractor>
        <hashTree/>
      `
    case 'regex':
      return regexExtractor(variable, selector.regex, scope(selector.from))
    case 'header-name':
      return regexExtractor(
        variable,
        `^${escapeRegexLiteral(selector.name)}: (.*)$`,
        'true'
      )
    case 'json':
      return `
        <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="Extract ${escapeXml(variable)}" enabled="true">
          <stringProp name="JSONPostProcessor.referenceNames">${escapeXml(variable)}</stringProp>
          <stringProp name="JSONPostProcessor.jsonPathExprs">${escapeXml(jsonPathFromLodashPath(selector.path))}</stringProp>
          <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>
        </JSONPostProcessor>
        <hashTree/>
      `
    default:
      return exhaustive(selector)
  }
}

function regexExtractor(variable: string, regex: string, useHeaders: string) {
  return `
    <RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="Extract ${escapeXml(variable)}" enabled="true">
      <stringProp name="RegexExtractor.useHeaders">${useHeaders}</stringProp>
      <stringProp name="RegexExtractor.refname">${escapeXml(variable)}</stringProp>
      <stringProp name="RegexExtractor.regex">${escapeXml(regex)}</stringProp>
      <stringProp name="RegexExtractor.template">$1$</stringProp>
      <stringProp name="RegexExtractor.default"></stringProp>
      <stringProp name="RegexExtractor.match_number">1</stringProp>
    </RegexExtractor>
    <hashTree/>
  `
}

function scope(from: 'headers' | 'body' | 'url') {
  switch (from) {
    case 'headers':
      return 'true'
    case 'url':
      return 'URL'
    case 'body':
      return 'false'
    default:
      return exhaustive(from)
  }
}

function escapeRegexLiteral(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** MATCH=1, CONTAINS=2, NOT=4, EQUALS=8, SUBSTRING=16 */
const ASSERTION_TEST_TYPE: Record<Assertion['operator'], number> = {
  equals: 8,
  notEquals: 8 | 4,
  contains: 16,
  notContains: 16 | 4,
  matches: 1,
}

export function assertion(item: Assertion & { value: string }) {
  const field =
    item.target === 'status'
      ? 'Assertion.response_code'
      : 'Assertion.response_data'

  return `
    <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Assert ${item.target} ${item.operator}" enabled="true">
      <collectionProp name="Asserion.test_strings">
        <stringProp name="0">${escapeXml(item.value)}</stringProp>
      </collectionProp>
      <stringProp name="Assertion.custom_message"></stringProp>
      <stringProp name="Assertion.test_field">${field}</stringProp>
      <boolProp name="Assertion.assume_success">false</boolProp>
      <intProp name="Assertion.test_type">${ASSERTION_TEST_TYPE[item.operator]}</intProp>
    </ResponseAssertion>
    <hashTree/>
  `
}

/** Timer attached to a sampler — fires before each request in scope. */
export function timer(timing: ThinkTime['timing']) {
  if (timing.type === 'fixed') {
    return timing.value === null
      ? ''
      : `
        <ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer" testname="Think Time" enabled="true">
          <stringProp name="ConstantTimer.delay">${Math.round(timing.value * 1000)}</stringProp>
        </ConstantTimer>
        <hashTree/>
      `
  }

  return uniformRandomTimer(timing.value.min, timing.value.max)
}

function uniformRandomTimer(min: number, max: number) {
  return `
    <UniformRandomTimer guiclass="UniformRandomTimerGui" testclass="UniformRandomTimer" testname="Think Time" enabled="true">
      <stringProp name="ConstantTimer.delay">${Math.round(min * 1000)}</stringProp>
      <stringProp name="RandomTimer.range">${Math.round((max - min) * 1000)}</stringProp>
    </UniformRandomTimer>
    <hashTree/>
  `
}

/**
 * Synchronizing Timer — holds threads until the whole group has arrived, then
 * releases them together. `groupSize` 0 means "every thread in the thread
 * group".
 *
 * ponytail: the timeout is what stops a ramping profile from deadlocking when
 * fewer threads than the peak ever reach the barrier. Raise it in the GUI if a
 * slow iteration needs longer.
 */
export function syncTimer() {
  return `
    <SyncTimer guiclass="TestBeanGUI" testclass="SyncTimer" testname="Rendezvous" enabled="true">
      <intProp name="groupSize">0</intProp>
      <longProp name="timeoutInMs">30000</longProp>
    </SyncTimer>
    <hashTree/>
  `
}

/**
 * Flow Control Action pause — unlike a timer this runs once where it sits,
 * which is what group- and iteration-level think time needs.
 */
export function testAction(timing: ThinkTime['timing']) {
  if (timing.type === 'fixed' && timing.value === null) {
    return ''
  }

  const duration =
    timing.type === 'fixed' ? Math.round(timing.value! * 1000) : 0

  return `
    <TestAction guiclass="TestActionGui" testclass="TestAction" testname="Think Time" enabled="true">
      <intProp name="ActionProcessor.action">1</intProp>
      <intProp name="ActionProcessor.target">0</intProp>
      <stringProp name="ActionProcessor.duration">${duration}</stringProp>
    </TestAction>
    ${hashTree(timing.type === 'range' ? uniformRandomTimer(timing.value.min, timing.value.max) : '')}
  `
}

/** Re-indents the assembled fragments so the preview is readable. */
export function xml(document: string) {
  let depth = 0

  return document
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const { delta, lowest } = tagDepth(line)
      const indented = `${'  '.repeat(Math.max(0, depth + lowest))}${line}`

      depth = Math.max(0, depth + delta)

      return indented
    })
    .join('\n')
}

/**
 * Net depth change of a line plus the lowest point it dips to, so a line that
 * closes before it opens (`</a></b>`) is outdented by the right amount.
 */
function tagDepth(line: string) {
  let delta = 0
  let lowest = 0

  for (const [, closing, selfClosing] of line.matchAll(
    /<(\/?)[\w-]+[^>]*?(\/?)>/g
  )) {
    if (closing === '/') {
      delta -= 1
    } else if (selfClosing !== '/') {
      delta += 1
    }

    lowest = Math.min(lowest, delta)
  }

  return { delta, lowest }
}
