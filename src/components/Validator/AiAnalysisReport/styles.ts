import { css } from '@emotion/react'

/** Small uppercase caption above a figure or a block. */
export const eyebrow = css`
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--gray-10);
`

export const mono = css`
  font-family: var(--code-font-family);
`

/** Jev's certainty, colored the way the dialog reads it: sure, unsure, lost. */
export function confidenceColor(confidence: number | null) {
  if (confidence === null || confidence < 0.5) {
    return 'orange'
  }

  return confidence >= 0.8 ? 'green' : 'amber'
}

/** One color per cause, so a bar reads the same across every card. */
export const CAUSE_COLOR: Record<string, string> = {
  server_error: 'var(--red-9)',
  overload: 'var(--orange-9)',
  correlation: 'var(--sand-8)',
  test_data: 'var(--blue-8)',
  network: 'var(--violet-8)',
  script: 'var(--plum-8)',
  client_resource: 'var(--cyan-8)',
}
