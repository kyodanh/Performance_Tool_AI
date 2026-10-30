import { VuGenImport, VuGenRequest } from './parseVuGen'

/**
 * VuGen writes non-ASCII text as UTF-8 bytes shown as Latin-1/cp1252 chars
 * (`Khám phá` -> `KhaÌ\x81m phaÌ\x81`). Maps each char back to its byte and
 * decodes; text that is not such a byte string comes back unchanged.
 */
export function fixMojibake(text: string): string {
  const cp1252 = new TextDecoder('windows-1252')
  const bytes: number[] = []

  for (const char of text) {
    const code = char.charCodeAt(0)
    const byte =
      code < 256
        ? code
        : Array.from({ length: 32 }, (_, i) => 0x80 + i).find(
            (b) => cp1252.decode(new Uint8Array([b])) === char
          )

    if (byte === undefined) {
      return text
    }

    bytes.push(byte)
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(bytes)
    )
  } catch {
    return text
  }
}

const squash = (text: string) =>
  text.normalize('NFC').replace(/\s+/g, '').toLowerCase()

/** The href of the `ordinal`-th anchor whose text matches `text`, absolute. */
export function findLink(
  html: string,
  base: string,
  text: string,
  ordinal: number
): string | null {
  const wanted = squash(fixMojibake(text))
  const anchors = [
    ...new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelectorAll('a[href]'),
  ]
  const label = (a: Element) => squash(a.textContent ?? '')
  const exact = anchors.filter((a) => label(a) === wanted)
  // Nested markup or truncated labels: fall back to containment.
  const matches =
    exact.length > 0 ? exact : anchors.filter((a) => label(a).includes(wanted))
  const href = matches[ordinal - 1]?.getAttribute('href')

  try {
    return href ? new URL(href, base).href : null
  } catch {
    return null
  }
}

/**
 * Fills in the URL of every `web_link` by fetching the page it was clicked on.
 * Links that cannot be found are dropped and counted in `skipped`; later steps
 * keep their place.
 */
export async function resolveVuGenLinks(
  result: VuGenImport
): Promise<VuGenImport> {
  const html = new Map<number, string | null>()
  const kept: VuGenRequest[] = []
  let skipped = result.skipped
  let resolved = 0

  for (const request of result.requests) {
    const { link } = request

    if (link === undefined) {
      kept.push(request)
      continue
    }

    const page = result.requests[link.from]
    let url: string | null = null

    if (page !== undefined && page.url !== '') {
      if (!html.has(link.from)) {
        const response = await window.studio.httpRequest.send({
          method: 'GET',
          url: page.url,
          headers: page.headers.map(({ name, value }): [string, string] => [
            name,
            value,
          ]),
          content: null,
        })

        html.set(
          link.from,
          response.type === 'success' ? response.response.content : null
        )
      }

      const body = html.get(link.from)
      url = body ? findLink(body, page.url, link.text, link.ordinal) : null
    }

    if (url === null) {
      skipped += 1
      continue
    }

    resolved += 1
    // Mutated in place: the next click's page is this request.
    request.url = url
    delete request.link
    kept.push(request)
  }

  return { ...result, requests: kept, skipped, resolvedLinks: resolved }
}
