export interface Call {
  name: string
  /** String literal arguments, in order, unescaped and concatenated. */
  strings: string[]
  /** Bare word arguments such as `LAST`, `EXTRARES`, `LR_AUTO`. */
  words: string[]
  /** `"Key=value"` arguments, keyed by `Key` — `URL`, `Method`, `Body`, … */
  options: Map<string, string>
  /** `"Name=x", "Value=y", ENDITEM` triples of `web_submit_data`. */
  itemData: Array<[string, string]>
  /** Sub-resources listed after `EXTRARES`, which we do not import. */
  extraResources: number
}

/** Reads every `name(...)` call in a VuGen action, in source order. */
export function readCalls(source: string): Call[] {
  const text = stripComments(source)
  const calls: Call[] = []
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g

  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const end = findClosingParen(text, pattern.lastIndex)

    if (end === -1) {
      continue
    }

    calls.push(toCall(match[1] ?? '', text.slice(pattern.lastIndex, end)))
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
    extraResources: 0,
  }

  let inExtraResources = false
  let inItemData = false
  let item: Partial<Record<'Name' | 'Value', string>> = {}

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
          call.extraResources += 1
        } else if (item.Name !== undefined) {
          call.itemData.push([item.Name, item.Value ?? ''])
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

    if (inItemData && (key === 'Name' || key === 'Value')) {
      item[key] = value
      continue
    }

    // Sub-resource `Url=` / `Referer=` must not overwrite the parent's options.
    if (!inExtraResources && !call.options.has(key)) {
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

function stripComments(source: string): string {
  let result = ''
  let index = 0

  while (index < source.length) {
    const rest = source.slice(index, index + 2)

    if (source[index] === '"') {
      const end = readString(source, index)[1]
      result += source.slice(index, end)
      index = end
      continue
    }

    if (rest === '//') {
      const end = source.indexOf('\n', index)
      index = end === -1 ? source.length : end
      continue
    }

    if (rest === '/*') {
      const end = source.indexOf('*/', index)
      index = end === -1 ? source.length : end + 2
      continue
    }

    result += source[index]
    index += 1
  }

  return result
}
