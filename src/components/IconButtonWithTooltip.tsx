import { IconButton, IconButtonProps, Tooltip } from '@radix-ui/themes'
import { forwardRef } from 'react'

/**
 * An icon-only button always needs its label somewhere, so the tooltip doubles
 * as the accessible name.
 */
export const IconButtonWithTooltip = forwardRef<
  HTMLButtonElement,
  IconButtonProps & { tooltip: string }
>(function IconButtonWithTooltip({ tooltip, ...props }, ref) {
  return (
    <Tooltip content={tooltip}>
      <IconButton aria-label={tooltip} {...props} ref={ref} />
    </Tooltip>
  )
})
