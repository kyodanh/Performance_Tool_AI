import { get, set } from 'lodash-es'

import { Request } from '@/types'
import { JsonSelector } from '@/types/rules'
import { safeJsonParse } from '@/utils/json'

import { isJsonReqResp } from '../utils'

/**
 * Paths are read with `lodash.get`, so a JSONPath-style `$.` prefix would look
 * for a key named `$`. Strip it on input so `$.token`, `$['token']` and `token`
 * all address the same value. A key literally named `$` still works via
 * `["$"]["token"]`. Applied where the path is used, not in the
 * schema: `GeneratorFileCodec` encodes as well as decodes, so a `z.transform`
 * there is unidirectional and breaks saving (ZodEncodeError), and generator
 * files already on disk may hold a prefixed path.
 */
export function stripJsonPathPrefix(path: string) {
  return path.replace(/^\$\.?/, '')
}

export function getJsonObjectFromPath(json: string, path: string) {
  // TODO: https://github.com/grafana/k6-studio/issues/277
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return get(safeJsonParse(json), stripJsonPathPrefix(path))
}

function setJsonObjectFromPath(json: string, path: string, value: string) {
  const jsonObject = safeJsonParse(json)
  set(jsonObject ?? {}, stripJsonPathPrefix(path), value)
  return JSON.stringify(jsonObject)
}

export function replaceJsonBody(
  selector: JsonSelector,
  request: Request,
  value: string
): Request {
  if (!isJsonReqResp(request) || !request.content) {
    return request
  }

  // since we are using lodash and its `set` function creates missing paths we will first check that the path really
  // exists before setting it
  // TODO: https://github.com/grafana/k6-studio/issues/277
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const match = getJsonObjectFromPath(request.content, selector.path)

  if (match === undefined) return request

  const content = setJsonObjectFromPath(request.content, selector.path, value)
  return { ...request, content }
}
