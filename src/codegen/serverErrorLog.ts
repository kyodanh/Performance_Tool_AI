/**
 * Script-side helper: k6 records no headers or body for a failed request, so a
 * 5xx alone never says which tier broke. This logs one line per 5xx with the
 * tier the response looks like it came from, the headers that name it and the
 * start of the body — enough to tell a gateway page from an app stack trace.
 *
 * ponytail: the tier is a heuristic over common gateway pages and DB error
 * text. Ceiling — a custom gateway page or a masked error reads as "app".
 * Upgrade path: match the target's own error format once it is known.
 */
export const SERVER_ERROR_LOG_HELPER = `
    function serverErrorTier(resp, body) {
      const server = String(resp.headers['Server'] || '')
      const isHtml = /<html|<!doctype/i.test(body)

      if (/sql|jdbc|ora-\\d|hibernate|deadlock|connection is not available|connection pool|mongo|redis/i.test(body)) {
        return 'database'
      }

      if (
        (isHtml && /nginx|apache|envoy|haproxy|cloudflare|bad gateway|gateway time-?out|service unavailable/i.test(body + server)) ||
        // Kong answered on its own: it never reached the upstream app.
        (resp.headers['X-Kong-Proxy-Latency'] !== undefined && resp.headers['X-Kong-Upstream-Latency'] === undefined)
      ) {
        return 'gateway'
      }

      return 'app'
    }

    function logServerError(resp) {
      if (resp.status < 500) {
        return
      }

      const body = typeof resp.body === 'string' ? resp.body.replace(/\\s+/g, ' ').slice(0, 300) : ''

      console.error(
        '[5xx] tier=' + serverErrorTier(resp, body) +
        ' status=' + resp.status +
        ' ' + resp.request.method + ' ' + resp.url +
        ' time=' + Math.round(resp.timings.duration) + 'ms' +
        ' server=' + (resp.headers['Server'] || '-') +
        ' via=' + (resp.headers['Via'] || '-') +
        ' body=' + (body || '-')
      )
    }
`
