import { applyRules } from '@/rules/rules'
import { matchFilter } from '@/rules/utils'
import { Header, Method, ProxyData, Response } from '@/types'
import { GeneratorFileData } from '@/types/generator'
import { ExtractorSelector, VerificationRule } from '@/types/rules'
import { Variable } from '@/types/testData'
import { TestOptions, ThinkTime } from '@/types/testOptions'
import { groupProxyData } from '@/utils/groups'
import * as path from '@/utils/path'

import { isBinaryContent } from '../codegen'
import {
  cleanupRecording,
  processRedirectChains,
  shouldIncludeHeaderInScript,
} from '../codegen.utils'

export interface Extraction {
  variable: string
  selector: ExtractorSelector
}

export interface Assertion {
  target: VerificationRule['target']
  operator: VerificationRule['operator']
  value: string | number
  negated: boolean
}

export interface PlannedRequest {
  id: string
  name: string
  method: Method
  url: string
  headers: Header[]
  /** Correlated cookies only — the rest is handled by the target's cookie jar. */
  cookies: Header[]
  content: string | null
  /** Extracted from *this* request's response, so emitters register them before it. */
  extractions: Extraction[]
  assertions: Assertion[]
}

export interface PlannedGroup {
  name: string
  requests: PlannedRequest[]
}

export interface ExportPlan {
  load: TestOptions['loadProfile']
  thinkTime: ThinkTime
  variables: Variable[]
  dataFiles: string[]
  groups: PlannedGroup[]
  warnings: string[]
}

interface BuildExportPlanParams {
  recording: ProxyData[]
  generator: GeneratorFileData
}

export function buildExportPlan({
  recording,
  generator,
}: BuildExportPlanParams): ExportPlan {
  const warnings: string[] = []
  const enabledRules = generator.rules.filter((rule) => rule.enabled)

  const { requestSnippetSchemas, ruleInstances, affectedRequestIds } =
    applyRules(cleanupRecording(recording), generator.rules)

  const snippets = processRedirectChains(
    requestSnippetSchemas,
    affectedRequestIds
  )

  const extractions = collectExtractions(ruleInstances)

  const verificationRules = enabledRules.filter(
    (rule): rule is VerificationRule => rule.type === 'verification'
  )

  const planned = snippets.map(
    ({ data }): PlannedRequest & { group?: string } => {
      const { request, response } = data
      const content = request.content

      if (content !== null && isBinaryContent(content)) {
        warnings.push(
          `${request.method} ${request.path}: binary request body cannot be exported and was dropped.`
        )
      }

      return {
        group: data.group,
        id: data.id,
        name: `${request.method} ${request.path || '/'}`,
        method: request.method,
        url: request.url,
        headers: request.headers.filter(([name]) =>
          shouldIncludeHeaderInScript(name)
        ),
        cookies: request.cookies.filter(([, value]) => hasMarker(value)),
        content: content !== null && isBinaryContent(content) ? null : content,
        extractions: extractions.get(data.id) ?? [],
        assertions: response
          ? collectAssertions(verificationRules, request.url, response)
          : [],
      }
    }
  )

  for (const rule of enabledRules) {
    if (rule.type === 'customCode') {
      warnings.push(
        `Custom code rule (${rule.placement} ${rule.filter.path}) is JavaScript and was not exported.`
      )
    }

    if (rule.type === 'parameterization' && rule.value.type === 'customCode') {
      warnings.push(
        `Parameterization rule (${rule.filter.path}) uses custom code and was not exported.`
      )
    }
  }

  return {
    load: generator.options.loadProfile,
    thinkTime: generator.options.thinkTime,
    variables: generator.testData.variables.filter(({ name }) => name),
    dataFiles: generator.testData.files.map(({ name }) => path.name(name)),
    groups: Object.entries(groupProxyData(planned)).map(([name, requests]) => ({
      name,
      requests,
    })),
    warnings,
  }
}

type RuleInstances = ReturnType<typeof applyRules>['ruleInstances']

function collectExtractions(ruleInstances: RuleInstances) {
  const byRequestId = new Map<string, Extraction[]>()

  for (const instance of ruleInstances) {
    if (instance.type !== 'correlation') {
      continue
    }

    const { generatedUniqueId, responsesExtracted } = instance.state

    if (generatedUniqueId === undefined) {
      continue
    }

    const extraction: Extraction = {
      variable: `correlation_${generatedUniqueId}`,
      selector: instance.rule.extractor.selector,
    }

    for (const { id } of responsesExtracted) {
      byRequestId.set(id, [...(byRequestId.get(id) ?? []), extraction])
    }
  }

  return byRequestId
}

function collectAssertions(
  rules: VerificationRule[],
  url: string,
  response: Response
): Assertion[] {
  return rules
    .filter((rule) => matchFilter({ ...EMPTY_REQUEST, url }, rule.filter))
    .map((rule) => ({
      target: rule.target,
      operator: rule.operator,
      value: resolveAssertionValue(rule, response),
      negated: rule.operator === 'notEquals' || rule.operator === 'notContains',
    }))
}

function resolveAssertionValue(
  rule: VerificationRule,
  response: Response
): string | number {
  switch (rule.value.type) {
    case 'recordedValue':
      return rule.target === 'status'
        ? response.statusCode
        : (response.content ?? '')
    case 'string':
      return rule.value.value
    case 'regex':
      return rule.value.regex
    case 'number':
      return rule.value.number
    case 'variable':
      return `\${VARS['${rule.value.variableName}']}`
  }
}

/**
 * k6 interpolations left in the request by the rules engine. Emitters rewrite
 * them into their own parameter syntax via `rewriteMarkers`.
 */
const MARKER =
  /\$\{(?:correlation_vars\['([^']*)'\]|VARS\['([^']*)'\]|getUniqueItem\(FILES\['[^']*'\]\)\['([^']*)'\]|getParameterizationValue(\d+)\(\))\}/g

export function hasMarker(value: string) {
  return new RegExp(MARKER.source).test(value)
}

/**
 * Rewrites k6 interpolations into the target tool's parameter syntax. Custom
 * code parameterizations have no equivalent, so they are left verbatim and
 * reported instead of being silently dropped.
 */
export function rewriteMarkers(
  value: string,
  wrap: (name: string) => string,
  warnings: string[]
): string {
  return value.replace(
    MARKER,
    (match, correlation?: string, variable?: string, column?: string) => {
      const name = correlation ?? variable ?? column

      if (name === undefined) {
        warnings.push(
          `Custom code parameterization left as-is: ${match}. Replace it manually.`
        )
        return match
      }

      return wrap(name)
    }
  )
}

/** Only `url` is read by `matchFilter`, the rest satisfies the type. */
const EMPTY_REQUEST = {
  headers: [],
  cookies: [],
  query: [],
  scheme: 'https',
  host: '',
  method: 'GET' as Method,
  path: '',
  content: null,
  timestampStart: 0,
  timestampEnd: 0,
  contentLength: 0,
  httpVersion: '1.1',
  url: '',
}

export function parseDurationSeconds(duration: string): number {
  const units: Record<string, number> = { h: 3600, m: 60, s: 1 }

  return [...duration.matchAll(/(\d+)([hms])/g)].reduce(
    (total, [, value, unit]) => total + Number(value) * (units[unit!] ?? 0),
    0
  )
}

export function jsonPathFromLodashPath(lodashPath: string) {
  return lodashPath.startsWith('[') ? `$${lodashPath}` : `$.${lodashPath}`
}
