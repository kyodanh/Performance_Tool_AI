import { K6_EXPORTS, REQUIRED_IMPORTS } from '@/constants/imports'
import { getCustomCodeSnippet } from '@/rules/parameterization'
import { applyRules } from '@/rules/rules'
import { ProxyData, RequestSnippetSchema } from '@/types'
import { GeneratorFileData } from '@/types/generator'
import { CustomCodeValue, ParameterizationRule, TestRule } from '@/types/rules'
import { DataFile, Variable } from '@/types/testData'
import { TestOptions, ThinkTime } from '@/types/testOptions'
import { safeBtoa } from '@/utils/format'
import { groupProxyData } from '@/utils/groups'
import { getContentTypeWithCharsetHeader } from '@/utils/headers'
import * as path from '@/utils/path'
import { requestKey, resolveThinkTime } from '@/utils/thinkTime'
import { exhaustive } from '@/utils/typescript'

import {
  cleanupRecording,
  generateScriptHeader,
  processRedirectChains,
  shouldIncludeHeaderInScript,
} from './codegen.utils'
import { generateImportStatement } from './imports'
import { generateOptions } from './options'

interface GenerateScriptParams {
  recording: ProxyData[]
  generator: GeneratorFileData
  scriptPath: string
}

export function generateScript({
  recording,
  generator,
  scriptPath,
}: GenerateScriptParams): string {
  const hasBinaryContent = recording.some(
    ({ request }) => request.content != null && isBinaryContent(request.content)
  )

  return `
    // ${generateScriptHeader(generator.wizardUsed)}

    ${generateImports(generator, { hasBinaryContent })}

    export const options = ${generateOptions(generator.options)}

    // Applies to every request below. Raise it for slow report / export
    // endpoints, lower it to make a hung server fail fast.
    const HTTP_TIMEOUT = '${generator.options.httpTimeout}s'

    ${generateVariableDeclarations(generator.testData.variables)}
    ${generateDataFileDeclarations(generator.testData.files, scriptPath)}
    ${generateGetUniqueItemFunction(generator.testData.files)}

    export default function() {
      ${generateVUCode(recording, generator.rules, generator.options.thinkTime, generator.options.rendezvous, generator.testData.variables)}
    }
  `
}

interface GenerateImportsOptions {
  hasBinaryContent?: boolean
}

export function generateImports(
  generator: GeneratorFileData,
  options: GenerateImportsOptions = {}
): string {
  const hasCSVDataFiles = generator.testData.files.some(({ name }) =>
    name.toLowerCase().endsWith('csv')
  )
  const hasJSONDataFiles = generator.testData.files.some(({ name }) =>
    name.toLowerCase().endsWith('json')
  )
  const imports = [
    ...REQUIRED_IMPORTS,
    // Import SharedArray for JSON files
    ...(hasJSONDataFiles ? [K6_EXPORTS['k6/data']] : []),
    // Import k6/experimental/csv for CSV files
    ...(hasCSVDataFiles
      ? [K6_EXPORTS['k6/experimental/csv'], K6_EXPORTS['k6/experimental/fs']]
      : []),
    // Import k6/encoding for binary content
    ...(options.hasBinaryContent ? [K6_EXPORTS['k6/encoding']] : []),
  ]

  return imports.map(generateImportStatement).join('\n')
}

export function generateVariableDeclarations(variables: Variable[]): string {
  if (variables.length === 0) {
    return ''
  }

  const variableKeyValuePairs = variables
    .filter(({ name }) => name)
    .map(({ name, value, file }) =>
      file
        ? // Getter, not a value: it must be read per iteration so each VU gets its
          // own row. Lazy evaluation also keeps it valid before FILES is awaited.
          `get "${name}"() { return getUniqueItem(FILES['${path.name(file.fileName)}'])['${file.propertyName}'] }`
        : `"${name}": ${JSON.stringify(value)}`
    )
    .join(',\n')

  return `const VARS = {\n${variableKeyValuePairs}\n};`
}

export function generateDataFileDeclarations(
  files: DataFile[],
  scriptPath: string
): string {
  if (files.length === 0) {
    return ''
  }

  const scriptDir = path.dirname(scriptPath)

  const fileKeyValuePairs = files
    .map(({ name }) => {
      const displayName = path.name(name)
      const relativePath = path.relative(scriptDir, name)
      const isCSV = name.toLowerCase().endsWith('csv')

      if (isCSV) {
        return `
        "${displayName}": await csv.parse(await fs.open('${relativePath}'), { asObjects: true })`
      }

      return `
        "${displayName}": new SharedArray("${displayName}", () => {
          const data = JSON.parse(open('${relativePath}'));
          return Array.isArray(data) ? data : [data];
        })`
    })
    .join(',\n')

  return `const FILES = {\n${fileKeyValuePairs}\n};`
}

export function generateGetUniqueItemFunction(files: DataFile[]) {
  if (files.length === 0) {
    return ''
  }

  return `
    function getUniqueItem(array){
      return array[execution.scenario.iterationInTest % array.length]
    }`
}

export function generateVUCode(
  recording: ProxyData[],
  rules: TestRule[],
  thinkTime: ThinkTime,
  rendezvous: TestOptions['rendezvous'] = {},
  variables: Variable[] = []
): string {
  const cleanedRecording = cleanupRecording(recording)
  const enabledRules = rules.filter((rule) => rule.enabled)

  const { requestSnippetSchemas, affectedRequestIds } = applyRules(
    cleanedRecording,
    enabledRules,
    variables
  )

  const snippets = processRedirectChains(
    requestSnippetSchemas,
    affectedRequestIds
  )
  const requestSnippets = generateRequestSnippetsFromSchemas(
    snippets,
    thinkTime,
    rendezvous
  )

  const parameterizationRules = enabledRules.filter(
    (rule) => rule.type === 'parameterization'
  )
  const parameterizationCustomCode = generateParameterizationCustomCode(
    parameterizationRules
  )

  // Group requests after applying rules to correlate requests between different groups
  const groups = Object.entries(groupProxyData(requestSnippets))

  const groupSnippets = groups
    .map(([groupName, requestSnippetSchemas]) => {
      const requestSnippet = requestSnippetSchemas
        .map(({ snippet }) => snippet)
        .join('\n')

      return generateGroupSnippet(groupName, requestSnippet, thinkTime)
    })
    .join('\n')

  return [
    `
    let params
    let resp
    let match
    let regex
    let url
    const correlation_vars = {}
    `,
    snippets.some(({ data }) => rendezvous[requestKey(data)])
      ? RENDEZVOUS_HELPER
      : '',
    parameterizationCustomCode,
    groupSnippets,
    thinkTime.sleepType === 'iterations' ? generateSleep(thinkTime.timing) : '',
  ].join('\n')
}

type GenerateRequestSnippetReturnValue = Array<{
  snippet: string
  group?: string
}>

export function generateRequestSnippetsFromSchemas(
  requestSnippetSchemas: RequestSnippetSchema[],
  thinkTime: ThinkTime,
  rendezvous: TestOptions['rendezvous'] = {}
): GenerateRequestSnippetReturnValue {
  return requestSnippetSchemas.reduce<GenerateRequestSnippetReturnValue>(
    (acc, requestSnippetSchema) => {
      const requestSnippet = generateSingleRequestSnippet(requestSnippetSchema)
      const timing = resolveThinkTime(thinkTime, requestSnippetSchema.data)
      const meets = rendezvous[requestKey(requestSnippetSchema.data)] === true

      return [
        ...acc,
        {
          group: requestSnippetSchema.data.group,
          snippet: `
            ${meets ? 'rendezvous()' : ''}
            ${requestSnippet}
            ${timing ? generateSleep(timing) : ''}
          `,
        },
      ]
    },
    []
  )
}

export function generateGroupSnippet(
  groupName: string,
  requestSnippets: string,
  thinkTime: ThinkTime
): string {
  return `group('${groupName}', function() {
    ${requestSnippets}
  });
  ${thinkTime.sleepType === 'groups' ? `${generateSleep(thinkTime.timing)}` : ''}`
}

export function generateSingleRequestSnippet(
  requestSnippetSchema: RequestSnippetSchema
): string {
  const {
    before,
    after,
    data: { request },
    checks,
    noRedirect,
  } = requestSnippetSchema

  const method = `'${request.method}'`
  const url = `\`${escapeTemplateLiteral(request.url)}\``
  let content = 'null'

  try {
    if (request.content) {
      if (isBinaryContent(request.content)) {
        const base64Content = safeBtoa(request.content)
        content = `encoding.b64decode('${base64Content}')`
      } else {
        const escapedContent = escapeTemplateLiteral(request.content)
        content = `\`${escapedContent}\``

        // if we have postData parameters we need to pass an object to the k6 post function because if it receives
        // a stringified json it won't correctly post the data.
        const contentTypeHeader =
          getContentTypeWithCharsetHeader(request.headers) ?? ''
        if (contentTypeHeader.includes('application/x-www-form-urlencoded')) {
          content = `JSON.parse(\`${escapedContent}\`)`
        }

        if (contentTypeHeader.includes('multipart/form-data')) {
          content = `\`${escapedContent.replace(/(?:\r\n|\r|\n)/g, '\\r\\n')}\``
        }
      }
    }
  } catch (error) {
    console.error('Failed to serialize request content', error)
  }

  const params = generateRequestParams(request, {
    disableRedirects: noRedirect,
  })

  const main = `
    url = http.url${url}
    resp = http.request(${method}, url, ${content}, params)
  `

  return [params, ...before, main, generateChecks(checks), ...after].join('\n')
}

/**
 * k6 has no cross-VU barrier, so VUs meet on a shared wall-clock tick instead
 * of counting arrivals: everyone waits for the next 30s boundary and fires
 * together.
 *
 * ponytail: approximate on purpose. Ceiling — no "exactly N VUs" guarantee, and
 * an iteration longer than the period spreads VUs over several boundaries.
 * Upgrade path: a k6/experimental/redis counter if exactness matters.
 */
const RENDEZVOUS_HELPER = `
    function rendezvous(period = 30) {
      const now = Date.now()
      const next = Math.ceil(now / (period * 1000)) * period * 1000
      sleep(Math.max(0, (next - Date.now()) / 1000))
    }
    `

function generateSleep(timing: ThinkTime['timing']): string {
  switch (timing.type) {
    case 'fixed':
      return timing.value !== null ? `sleep(${timing.value})` : ''
    case 'range':
      return `sleep(Math.random() * (${timing.value.max} - ${timing.value.min}) + ${timing.value.min})`
    default:
      return exhaustive(timing)
  }
}

export function generateRequestParams(
  request: ProxyData['request'],
  options: { disableRedirects?: boolean } = {}
): string {
  const headers = request.headers
    .filter(([name]) => shouldIncludeHeaderInScript(name))
    .map(([name, value]) => `'${name}': \`${escapeTemplateLiteral(value)}\``)
    .join(',')

  // A recorded request carries its cookies in `cookies`, and k6's jar already
  // replays everything there that the recording itself set — only a correlated
  // value has to be pinned. An imported or hand-written request is the other
  // way round: empty `cookies`, a `Cookie` header nothing put in the jar, and
  // `shouldIncludeHeaderInScript` drops that header — so read it back here or
  // the cookie is never sent at all.
  const cookieHeader = request.headers.find(
    ([name]) => name.toLowerCase() === 'cookie'
  )?.[1]

  const cookies = (
    request.cookies.length === 0 && cookieHeader !== undefined
      ? parseCookieHeader(cookieHeader)
      : request.cookies.filter(([, value]) =>
          value.includes('${correlation_vars[')
        )
  )
    .map(
      ([name, value]) =>
        `'${name}': {value: \`${escapeTemplateLiteral(value)}\`, replace: true}`
    )
    .join(',\n')

  const params = [
    // ponytail: a script-level const instead of threading the value through
    // every snippet function — one place for the user to edit after export too.
    'timeout: HTTP_TIMEOUT',
    `headers: {
      ${headers}
    }`,
    `cookies: {
      ${cookies}
    }`,
    ...(options.disableRedirects ? ['redirects: 0'] : []),
  ]

  return `params = {
    ${params.join(',\n')}
  }`
}

function parseCookieHeader(header: string): Array<[string, string]> {
  return header
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.includes('='))
    .map((pair) => {
      const separator = pair.indexOf('=')

      return [pair.slice(0, separator), pair.slice(separator + 1)] as [
        string,
        string,
      ]
    })
}

export function generateParameterizationCustomCode(
  rules: ParameterizationRule[]
): string {
  return rules
    .map((rule, index) => ({ rule, parameterizationIndex: index }))
    .filter(({ rule }) => rule.value?.type === 'customCode')
    .map(({ rule, parameterizationIndex }) =>
      getCustomCodeSnippet(
        (rule.value as CustomCodeValue).code,
        parameterizationIndex
      )
    )
    .join('\n')
}

export function isBinaryContent(content: string): boolean {
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i)
    // Null byte or control character that isn't whitespace (tab, newline, carriage return)
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      return true
    }
  }
  return false
}

const SAFE_INTERPOLATION =
  /\$\{(?:correlation_vars\['[^']*'\]|VARS\['[^']*'\]|getUniqueItem\(FILES\['[^']*'\]\)\['[^']*'\]|getParameterizationValue\d+\(\))\}/g

export function escapeTemplateLiteral(content: string): string {
  const sentinels: string[] = []
  const withSentinels = content.replace(SAFE_INTERPOLATION, (match) => {
    sentinels.push(match)
    return `__SAFE_INTERPOLATION_${sentinels.length - 1}__`
  })
  const escaped = withSentinels
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
  return escaped.replace(
    /__SAFE_INTERPOLATION_(\d+)__/g,
    (_, index) => sentinels[Number(index)] ?? ''
  )
}

export function escapeSingleQuotedString(content: string): string {
  return content.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function generateChecks(checks: RequestSnippetSchema['checks']) {
  if (checks.length === 0) {
    return ''
  }

  const checksString = checks
    .map(
      ({ description, expression }) =>
        `'${escapeSingleQuotedString(description)}': ${expression}`
    )
    .join(',')

  // The `name` tag is what ties a failed check back to its request: k6 puts no
  // request context on a check sample, so an untagged check reports as a bare
  // name (see `CheckStats.request`). `url.name` is the same value `http.url`
  // tags the request with, so the two join exactly.
  return `check(resp, { ${checksString} }, { name: url.name })`
}
