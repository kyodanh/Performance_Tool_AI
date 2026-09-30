export interface VuGenSubResource {
  url: string
  /** `Referer=` the item carried — the page LoadRunner fetched it for. */
  referer: string | null
}

export interface VuGenItem {
  name: string
  value: string
  /** `File=Yes`: `value` is a path on the load generator, not the content. */
  file: boolean
  /** `ContentType=` of a file item, null when it had none. */
  contentType: string | null
}

export interface Call {
  name: string
  /** String literal arguments, in order, unescaped and concatenated. */
  strings: string[]
  /** Bare word arguments such as `LAST`, `EXTRARES`, `LR_AUTO`. */
  words: string[]
  /** `"Key=value"` arguments, keyed by `Key` — `URL`, `Method`, `Body`, … */
  options: Map<string, string>
  /** `"Name=x", "Value=y", ENDITEM` items of `web_submit_data`. */
  itemData: VuGenItem[]
  /** Sub-resources listed after `EXTRARES`, in order. */
  extraResources: VuGenSubResource[]
  /** The call sits in a line or block comment. */
  commented: boolean
}

/**
 * Reads every `name(...)` call in a VuGen action, in source order — commented
 * out ones included, flagged, so a disabled step can still be imported.
 */
export function readCalls(source: string): Call[] {
  const { live, commented } = splitComments(source)

  return [...findCalls(live, false), ...findCalls(commented, true)]
    .sort((a, b) => a.index - b.index)
    .map(({ call }) => call)
}

function findCalls(text: string, commented: boolean) {
  const calls: Array<{ index: number; call: Call }> = []
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g

  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const end = findClosingParen(text, pattern.lastIndex)

    if (end === -1) {
      continue
    }

    const call = toCall(match[1] ?? '', text.slice(pattern.lastIndex, end))
    calls.push({ index: match.index, call: { ...call, commented } })
    pattern.lastIndex = end + 1
  }

  return calls
}

function toCall(name: string, inner: string): Call {
  const call: Call = {
    name,
    strings: [],
    words: [],
    options: new Map(),
    itemData: [],
    extraResources: [],
    commented: false,
  }

  let inExtraResources = false
  let inItemData = false
  let item: Partial<
    Record<
      'Name' | 'Value' | 'File' | 'ContentType' | 'Url' | 'Referer',
      string
    >
  > = {}

  for (const argument of splitArguments(inner)) {
    if (argument.type === 'word') {
      call.words.push(argument.value)

      if (argument.value === 'EXTRARES') {
        inExtraResources = true
        inItemData = false
      }

      if (argument.value === 'ITEMDATA') {
        inItemData = true
      }

      if (argument.value === 'ENDITEM') {
        if (inExtraResources) {
          if (item.Url !== undefined) {
            call.extraResources.push({
              url: item.Url,
              referer: item.Referer ?? null,
            })
          }
        } else if (item.Name !== undefined) {
          call.itemData.push({
            name: item.Name,
            value: item.Value ?? '',
            file: item.File?.toLowerCase() === 'yes',
            contentType: item.ContentType ?? null,
          })
        }

        item = {}
      }

      continue
    }

    call.strings.push(argument.value)

    const separator = argument.value.indexOf('=')

    if (separator === -1) {
      continue
    }

    const key = argument.value.slice(0, separator)
    const value = argument.value.slice(separator + 1)

    if (
      inItemData &&
      (key === 'Name' ||
        key === 'Value' ||
        key === 'File' ||
        key === 'ContentType')
    ) {
      item[key] = value
      continue
    }

    // Sub-resource `Url=` / `Referer=` belong to the item, and must not
    // overwrite the parent's options.
    if (inExtraResources) {
      if (key === 'Url' || key === 'Referer') {
        item[key] = value
      }
      continue
    }

    if (!call.options.has(key)) {
      call.options.set(key, value)
    }
  }

  return call
}

type Argument =
  | { type: 'string'; value: string }
  | { type: 'word'; value: string }

/**
 * Splits at top-level commas. Adjacent string literals are one argument: VuGen
 * breaks long values (tokens, bodies) across lines the way C does.
 */
function splitArguments(inner: string): Argument[] {
  const args: Argument[] = []
  let literal: string | null = null
  let word = ''
  let depth = 0
  let index = 0

  function flush() {
    if (literal !== null) {
      args.push({ type: 'string', value: literal })
      literal = null
    }

    if (word.trim() !== '') {
      args.push({ type: 'word', value: word.trim() })
    }

    word = ''
  }

  while (index < inner.length) {
    const char = inner[index]

    if (char === '"') {
      const [value, next] = readString(inner, index)
      literal = (literal ?? '') + value
      index = next
      continue
    }

    if (char === '(') {
      depth += 1
    }

    if (char === ')') {
      depth -= 1
    }

    if (char === ',' && depth === 0) {
      flush()
      index += 1
      continue
    }

    word += char
    index += 1
  }

  flush()

  return args
}

/** Reads the literal starting at `start`, returning its value and the next index. */
function readString(text: string, start: number): [string, number] {
  let value = ''
  let index = start + 1

  while (index < text.length) {
    const char = text[index]

    if (char === '\\') {
      value += unescape(text[index + 1] ?? '')
      index += 2
      continue
    }

    if (char === '"') {
      return [value, index + 1]
    }

    value += char
    index += 1
  }

  return [value, index]
}

function unescape(char: string): string {
  switch (char) {
    case 'n':
      return '\n'
    case 'r':
      return '\r'
    case 't':
      return '\t'
    default:
      return char
  }
}

function findClosingParen(text: string, start: number): number {
  let depth = 1
  let index = start

  while (index < text.length) {
    const char = text[index]

    if (char === '"') {
      index = readString(text, index)[1]
      continue
    }

    if (char === '(') {
      depth += 1
    }

    if (char === ')') {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }

    index += 1
  }

  return -1
}

/**
 * Two same-length copies of the source: the live code with comments blanked,
 * and the comment text with the live code blanked. Same length keeps both in
 * source order; newlines stay in both.
 */
function splitComments(source: string) {
  let live = ''
  let commented = ''
  let index = 0

  const blank = (text: string) => text.replace(/[^\n]/g, ' ')

  while (index < source.length) {
    const rest = source.slice(index, index + 2)

    if (source[index] === '"') {
      const end = readString(source, index)[1]
      live += source.slice(index, end)
      commented += blank(source.slice(index, end))
      index = end
      continue
    }

    if (rest === '//' || rest === '/*') {
      const close = rest === '//' ? '\n' : '*/'
      const found = source.indexOf(close, index + 2)
      const end = found === -1 ? source.length : found
      const inner = source.slice(index + 2, end)
      const tail = rest === '/*' && found !== -1 ? '  ' : ''

      live += blank(`  ${inner}`) + tail
      commented += `  ${inner}` + tail
      index = end + tail.length
      continue
    }

    live += source[index]
    commented += blank(source[index] ?? '')
    index += 1
  }

  return { live, commented }
}
