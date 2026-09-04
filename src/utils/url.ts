const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function validateExternalUrl(url: string): string {
  const parsed = new URL(url)
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Blocked URL with disallowed protocol: ${parsed.protocol}`)
  }
  return url
}

/**
 * Path + query exactly as written, unlike `new URL().pathname` which
 * percent-encodes template markers (`/contacts/{token}` → `/contacts/%7Btoken%7D`).
 */
export function rawPath(url: string): string {
  const start = url.indexOf('/', url.indexOf('://') + 3)

  if (start === -1) {
    return '/'
  }

  const hash = url.indexOf('#', start)

  return hash === -1 ? url.slice(start) : url.slice(start, hash)
}
