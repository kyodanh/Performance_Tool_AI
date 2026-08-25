import { Header, ProxyData } from '@/types'
import { GeneratorFileData } from '@/types/generator'
import { ThinkTime } from '@/types/testOptions'

import { generateScriptHeader } from '../codegen.utils'

import {
  assertion,
  cookieManager,
  csvDataSet,
  escapeXml,
  extractor,
  hashTree,
  headerManager,
  sampler,
  syncTimer,
  testAction,
  threadGroup,
  timer,
  userDefinedVariables,
  xml,
} from './jmeter.elements'
import {
  Assertion,
  ExportPlan,
  PlannedRequest,
  buildExportPlan,
  rewriteMarkers,
} from './plan'

interface GenerateJMeterScriptParams {
  recording: ProxyData[]
  generator: GeneratorFileData
}

export function generateJMeterScript({
  recording,
  generator,
}: GenerateJMeterScriptParams): string {
  const plan = buildExportPlan({ recording, generator })
  const warnings = [...plan.warnings, ...loadProfileWarnings(plan)]

  // JMeter references parameters as ${name} — the same shape markers become.
  const rewrite = (value: string) =>
    rewriteMarkers(value, (name) => `\${${name}}`, warnings)

  const groups = plan.groups
    .map((group) => renderGroup(group, plan.thinkTime, rewrite))
    .join('\n')

  const preamble = [
    cookieManager(),
    ...plan.dataFiles.map((file) => csvDataSet(file)),
  ].join('\n')

  const iterationPause =
    plan.thinkTime.sleepType === 'iterations'
      ? testAction(plan.thinkTime.timing)
      : ''

  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${escapeXml(generator.scriptName)}" enabled="true">
      <stringProp name="TestPlan.comments">${escapeXml([generateScriptHeader(generator.wizardUsed), ...warnings].join('\n'))}</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
      ${userDefinedVariables(plan.variables)}
    </TestPlan>
    ${hashTree(`
      ${threadGroup(plan.load)}
      ${hashTree(`
        ${preamble}
        ${groups}
        ${iterationPause}
      `)}
    `)}
  </hashTree>
</jmeterTestPlan>`)
}

function loadProfileWarnings({ load }: ExportPlan) {
  if (load.executor === 'ramping-vus' && load.stages.length > 1) {
    return [
      `Ramping profile has ${load.stages.length} stages; JMeter's built-in thread group supports one ramp, so it was collapsed to "ramp to peak VUs, then hold". Use the Concurrency Thread Group plugin for exact stages.`,
    ]
  }

  return []
}

function renderGroup(
  group: ExportPlan['groups'][number],
  thinkTime: ThinkTime,
  rewrite: (value: string) => string
) {
  const samplers = group.requests
    .map((request) => renderRequest(request, rewrite))
    .join('\n')

  return `
    <TransactionController guiclass="TransactionControllerGui" testclass="TransactionController" testname="${escapeXml(group.name)}" enabled="true">
      <boolProp name="TransactionController.parent">false</boolProp>
      <boolProp name="TransactionController.includeTimers">false</boolProp>
    </TransactionController>
    ${hashTree(samplers)}
    ${thinkTime.sleepType === 'groups' ? testAction(thinkTime.timing) : ''}
  `
}

function renderRequest(
  request: PlannedRequest,
  rewrite: (value: string) => string
) {
  const cookieHeader: Header[] =
    request.cookies.length > 0
      ? [
          [
            'Cookie',
            request.cookies
              .map(([name, value]) => `${name}=${value}`)
              .join('; '),
          ],
        ]
      : []

  const headers = [...request.headers, ...cookieHeader].map(
    ([name, value]): Header => [name, rewrite(value)]
  )

  const children = [
    // Timers run before the sampler they hang off, so the barrier holds the
    // thread until the group has arrived.
    request.rendezvous ? syncTimer() : '',
    headerManager(headers),
    ...request.extractions.map(extractor),
    ...request.assertions.map((item) => renderAssertion(item, rewrite)),
    request.thinkTime ? timer(request.thinkTime) : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `
    ${sampler({
      ...request,
      url: rewrite(request.url),
      content: request.content === null ? null : rewrite(request.content),
    })}
    ${hashTree(children)}
  `
}

function renderAssertion(item: Assertion, rewrite: (value: string) => string) {
  return assertion({
    ...item,
    value:
      typeof item.value === 'string' ? rewrite(item.value) : String(item.value),
  })
}
