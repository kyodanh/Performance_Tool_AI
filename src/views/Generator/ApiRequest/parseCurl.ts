import { ApiRequestFormData, HTTP_METHODS } from './ApiRequest.utils'

const DATA_FLAGS = [
  '-d',
  '--data',
  '--data-raw',
  '--data-ascii',
  '--data-binary',
]

/**
 * Turns a `curl` command into form data, so pasting one from the browser's
 * "Copy as cURL" fills the request instead of landing in the URL field.
 * Returns null when the text isn't a curl command.
 */
export function parseCurl(command: string): ApiRequestFormData | null {
  const tokens = tokenize(command)

  if (tokens[0] !== 'curl') {
    return null
  }

  let method = ''
  let url = ''
  let isGet = false
  const headers: ApiRequestFormData['headers'] = []
  const data: string[] = []

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i] ?? ''

    if (token === '-X' || token === '--request') {
      method = tokens[++i] ?? ''
    } else if (token === '-H' || token === '--header') {
      const header = parseHeader(tokens[++i] ?? '')
      if (header) headers.push(header)
    } else if (token === '-b' || token === '--cookie') {
      headers.push({ name: 'Cookie', value: tokens[++i] ?? '' })
    } else if (DATA_FLAGS.includes(token)) {
      data.push(tokens[++i] ?? '')
    } else if (token === '-G' || token === '--get') {
      isGet = true
    } else if (token === '--url') {
      url = tokens[++i] ?? ''
    } else if (url === '' && /^https?:\/\//.test(token)) {
      // Only full URLs, so a value of a flag we don't know isn't mistaken for one.
      url = token
    }
  }

  const content = data.join('&')

  return {
    method: toMethod(method) ?? (content !== '' && !isGet ? 'POST' : 'GET'),
    url,
    headers,
    content,
  }
}

function toMethod(method: string) {
  return HTTP_METHODS.find((known) => known === method.toUpperCase())
}

function parseHeader(header: string) {
  const [name = '', ...value] = header.split(':')

  if (name.trim() === '' || value.length === 0) {
    return undefined
  }

  return { name: name.trim(), value: value.join(':').trim() }
}

// Splits on whitespace, keeping quoted sections together and dropping the
// backslashes curl uses to continue a command on the next line.
function tokenize(command: string) {
  const tokens: string[] = []
  let current = ''
  let started = false
  let quote: "'" | '"' | null = null

  for (let i = 0; i < command.length; i++) {
    const char = command[i] ?? ''

    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else if (
        quote === '"' &&
        char === '\\' &&
        command[i + 1] !== undefined
      ) {
        current += command[++i]
      } else {
        current += char
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      started = true
    } else if (char === '\\') {
      // Line continuation, the newline that follows ends the token.
    } else if (/\s/.test(char)) {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
    } else {
      current += char
      started = true
    }
  }

  if (started) {
    tokens.push(current)
  }

  return tokens
}
