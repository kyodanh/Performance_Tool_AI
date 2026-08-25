import { css } from '@emotion/react'
import { Box } from '@radix-ui/themes'

/** Segmented control: one outline around buttons that belong together. */
export const buttonGroupCss = css`
  border: 1px solid var(--gray-a6);
  border-radius: var(--radius-3);
  overflow: hidden;
`

// Ghost buttons carry negative margins so they can sit flush with text; inside
// the group they have to fill their own cell instead.
export const buttonGroupItemCss = css`
  margin: 0;
  height: 28px;
  min-width: 28px;
  border-radius: 0;
  padding: 0 var(--space-2);
  gap: var(--space-1);
`

/** Icon-only variant: no label to pad around, so it stays square. */
export const buttonGroupIconCss = css`
  ${buttonGroupItemCss};
  padding: 0;
`

export function ButtonGroupDivider() {
  return <Box css={dividerCss} />
}

const dividerCss = css`
  width: 1px;
  align-self: stretch;
  background-color: var(--gray-a6);
`
