import { Header, ProxyData } from '@/types'
import { GeneratorFileData } from '@/types/generator'
import { ThinkTime } from '@/types/testOptions'
import { getContentTypeWithCharsetHeader } from '@/utils/headers'
import * as path from '@/utils/path'
import { exhaustive } from '@/utils/typescript'

import { generateScriptHeader } from '../codegen.utils'

import {
  Assertion,
  Extraction,
  ExportPlan,
  PlannedRequest,
  buildExportPlan,
  jsonPathFromLodashPath,
  parseDurationSeconds,
  rewriteMarkers,
} from './plan'

interface GenerateVUGenScriptParams {
  recording: ProxyData[]
  generator: GeneratorFileData
}

/**
 * Emits a VuGen Web (HTTP/HTML) `Action.c`. Parameters use VuGen's `{name}`
 * syntax and must be declared in the script's parameter list — the header
 * comment lists the ones this script expects.
 */
export function generateVUGenScript({
  recording,
  generator,
}: GenerateVUGenScriptParams): string {
  const plan = buildExportPlan({ recording, generator })
  const warnings = [...plan.warnings, ...parameterNotes(plan)]

  const rewrite = (value: string) =>
    rewriteMarkers(value, (name) => `{${name}}`, warnings)

  const body = plan.groups
    .map((group) => renderGroup(group, plan.thinkTime, rewrite))
    .join('\n\n')

  const iterationPause =
    plan.thinkTime.sleepType === 'iterations'
      ? indent(thinkTime(plan.thinkTime.timing), 1)
      : ''

  return `${[
    comment([generateScriptHeader(generator.wizardUsed), ...warnings]),
    '#include "web_api.h"',
    'Action()\n{',
    timeouts(plan.httpTimeout),
    body,
    iterationPause,
    '    return 0;\n}',
  ]
    .filter((section) => section !== '')
    .join('\n\n')}\n`
}

function parameterNotes({ variables, dataFiles, load }: ExportPlan) {
  return [
    loadProfileNote(load),
    ...variables.map(({ name, value, file }) =>
      file
        ? `Declare parameter {${name}} as type File, reading column "${file.propertyName}" of "${path.basename(file.fileName)}".`
        : `Declare parameter {${name}} as type Constant with value: ${value}`
    ),
    ...dataFiles.map(
      (file) =>
        `Declare the columns of "${file}" as File parameters (VuGen cannot read the CSV directly).`
    ),
  ]
}

function loadProfileNote(load: ExportPlan['load']) {
  if (load.executor === 'shared-iterations') {
    return `Load profile (${load.vus ?? 1} VUs, ${load.iterations ?? 1} iterations) belongs in the Controller scenario, not in this script.`
  }

  const total = load.stages.reduce(
    (seconds, stage) => seconds + parseDurationSeconds(stage.duration),
    0
  )

  return `Load profile (${load.stages.length} ramping stages, ${total}s total) belongs in the Controller scenario schedule, not in this script.`
}

function renderGroup(
  group: ExportPlan['groups'][number],
  think: ThinkTime,
  rewrite: (value: string) => string
) {
  const name = escapeC(group.name)

  const requests = group.requests
    .map((request) => renderRequest(request, rewrite))
    .join('\n\n')

  return [
    indent(`lr_start_transaction("${name}");`, 1),
    '',
    requests,
    think.sleepType === 'groups'
      ? `\n${indent(thinkTime(think.timing), 1)}`
      : '',
    '',
    indent(`lr_end_transaction("${name}", LR_AUTO);`, 1),
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function renderRequest(
  request: PlannedRequest,
  rewrite: (value: string) => string
) {
  const lines = [
    // Every VU meets here before the request goes out. The name is derived from
    // the request, so identical requests share one rendezvous — which is what
    // the per-request key means. Declare it in the Controller to set the
    // release policy.
    request.rendezvous ? `lr_rendezvous("${rendezvousName(request)}");` : '',
    // Registration functions must precede the request they inspect.
    ...request.extractions.map((extraction) => saveParam(extraction)),
    ...request.assertions.flatMap((item) => registerFind(item, rewrite)),
    ...headerLines(request, rewrite),
    customRequest(request, rewrite),
    ...request.assertions.flatMap(statusCheck),
    request.thinkTime ? thinkTime(request.thinkTime) : '',
  ].filter((line) => line !== '')

  return indent(lines.join('\n'), 1)
}

function headerLines(request: PlannedRequest, rewrite: (v: string) => string) {
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

  return [...request.headers, ...cookieHeader].map(
    ([name, value]) =>
      `web_add_header("${escapeC(name)}", "${escapeC(rewrite(value))}");`
  )
}

function customRequest(
  request: PlannedRequest,
  rewrite: (v: string) => string
) {
  const contentType =
    getContentTypeWithCharsetHeader(request.headers) ?? 'text/html'

  const args = [
    `"URL=${escapeC(rewrite(request.url))}"`,
    `"Method=${request.method}"`,
    '"Resource=0"',
    `"RecContentType=${escapeC(contentType)}"`,
    '"Referer="',
    '"Mode=HTTP"',
    ...(request.content !== null && request.content !== ''
      ? [bodyArg(rewrite(request.content))]
      : []),
  ]

  return [
    `web_custom_request("${escapeC(request.name)}",`,
    ...args.map((arg) => indent(`${arg},`, 1)),
    indent('LAST);', 1),
  ].join('\n')
}

function bodyArg(content: string) {
  // VuGen splits the body into one C string literal per source line. Adjacent
  // literals concatenate, so this is the same string as a single long line —
  // it just stays readable in the VuGen editor.
  const literals = content
    .split(/(?<=\n)/)
    .map((line, index) => `"${index === 0 ? 'Body=' : ''}${escapeC(line)}"`)

  return literals.join('\n')
}

function saveParam(extraction: Extraction) {
  const { variable, selector } = extraction

  switch (selector.type) {
    case 'begin-end':
      return regFunction('web_reg_save_param_ex', [
        `"ParamName=${variable}"`,
        `"LB=${escapeC(selector.begin)}"`,
        `"RB=${escapeC(selector.end)}"`,
        ...searchFilters(extraction, vugenScope(selector.from)),
      ])
    case 'header-name':
      return regFunction('web_reg_save_param_ex', [
        `"ParamName=${variable}"`,
        `"LB=${escapeC(selector.name)}: "`,
        '"RB=\\r\\n"',
        ...searchFilters(extraction, 'Headers'),
      ])
    case 'regex':
      return regFunction('web_reg_save_param_regexp', [
        `"ParamName=${variable}"`,
        `"RegExp=${escapeC(selector.regex)}"`,
        ...searchFilters(extraction, vugenScope(selector.from)),
      ])
    case 'json':
      return regFunction('web_reg_save_param_json', [
        `"ParamName=${variable}"`,
        `"QueryString=${escapeC(jsonPathFromLodashPath(selector.path))}"`,
        ...searchFilters(extraction, 'Body'),
      ])
    default:
      return exhaustive(selector)
  }
}

/**
 * `SEARCH_FILTERS` must be followed by at least one filter. The extractor's URL
 * filter becomes `RequestUrl`, wrapped in wildcards because k6 Studio matches
 * the filter as a substring (`matchFilter` escapes it before testing).
 */
function searchFilters({ filterPath }: Extraction, scope: string) {
  return [
    'SEARCH_FILTERS',
    `"Scope=${scope}"`,
    ...(filterPath !== '' ? [`"RequestUrl=*${escapeC(filterPath)}*"`] : []),
  ]
}

function registerFind(item: Assertion, rewrite: (value: string) => string) {
  // Status is verified after the request via HTTP_INFO_RETURN_CODE instead.
  if (item.target !== 'body' || typeof item.value !== 'string') {
    return []
  }

  if (item.operator === 'matches') {
    return [
      regFunction('web_reg_find', [
        `"Text=${escapeC(rewrite(item.value))}"`,
        '"Fail=NotFound"',
        '"SaveCount=matchCount"',
      ]),
      comment(
        ['Regex assertion approximated as a literal search — adjust manually.'],
        1
      ),
    ]
  }

  return [
    regFunction('web_reg_find', [
      `"Text=${escapeC(rewrite(item.value))}"`,
      `"Fail=${item.negated ? 'Found' : 'NotFound'}"`,
    ]),
  ]
}

function statusCheck(item: Assertion) {
  if (item.target !== 'status') {
    return []
  }

  const operator = item.negated ? '==' : '!='

  return [
    `if (web_get_int_property(HTTP_INFO_RETURN_CODE) ${operator} ${item.value})`,
    indent(
      `lr_error_message("Unexpected status %d", web_get_int_property(HTTP_INFO_RETURN_CODE));`,
      1
    ),
  ]
}

function regFunction(name: string, args: string[]) {
  return [
    `${name}(`,
    ...args.map((arg) => indent(`${arg},`, 1)),
    indent('LAST);', 1),
  ].join('\n')
}

/** VuGen rendezvous names allow letters, digits and underscores only. */
function rendezvousName(request: PlannedRequest): string {
  const path = new URL(request.url).pathname
  const name = `${request.method}_${path}`.replace(/[^A-Za-z0-9_]/g, '_')

  return name.replace(/_+/g, '_').replace(/^_|_$/g, '') || 'rendezvous'
}

function thinkTime(timing: ThinkTime['timing']): string {
  if (timing.type === 'fixed') {
    return timing.value === null ? '' : `lr_think_time(${timing.value});`
  }

  // VuGen randomises think time via runtime settings; emit the midpoint and
  // let the tester set the ± range there.
  const { min, max } = timing.value

  return [
    `lr_think_time(${(min + max) / 2});`,
    `/* Recorded range ${min}-${max}s: set "Use random percentage" in Runtime Settings. */`,
  ].join('\n')
}

function vugenScope(from: 'headers' | 'body' | 'url') {
  switch (from) {
    case 'headers':
      return 'Headers'
    case 'url':
      return 'All'
    case 'body':
      return 'Body'
    default:
      return exhaustive(from)
  }
}

function comment(lines: string[], level = 0) {
  return indent(
    ['/*', ...lines.map((line) => ` * ${line}`), ' */'].join('\n'),
    level
  )
}

function escapeC(value: string) {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')

  // VuGen saves scripts in an ANSI codepage, so a character it can't represent
  // is written as "?" and then sent as "?" on the wire. Emitting the UTF-8
  // bytes as escapes keeps the literal pure ASCII, so no codepage can touch it.
  // Octal, not \x: a C hex escape swallows any hex digit that follows it.
  return escaped.replace(/[^\u0020-\u007e\t]/gu, (char) =>
    Array.from(new TextEncoder().encode(char))
      .map((byte) => `\\${byte.toString(8).padStart(3, '0')}`)
      .join('')
  )
}

/**
 * VuGen reads these from Runtime Settings > Internet Protocol > Preferences,
 * which lives in `default.cfg` and is not part of an exported `Action.c` — so
 * set them in the script instead and the timeout travels with the file.
 */
function timeouts(seconds: number): string {
  return ['CONNECT', 'RECEIVE', 'STEP']
    .map((type) => indent(`web_set_timeout(${type}, "${seconds}");`, 1))
    .join('\n')
}

function indent(text: string, level: number) {
  const padding = '    '.repeat(level)

  return text
    .split('\n')
    .map((line) => (line === '' ? line : `${padding}${line}`))
    .join('\n')
}
