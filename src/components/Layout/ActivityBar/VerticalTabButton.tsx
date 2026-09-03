import { css, keyframes } from '@emotion/react'
import { Box, Flex, IconButton, Tooltip } from '@radix-ui/themes'
import { ReactNode } from 'react'

const pulse = keyframes`
  50% { opacity: 0.25; }
`

interface VerticalTabButtonProps {
  icon: ReactNode
  active?: boolean
  tooltip: string
  /** Pulsing dot on the icon, for work still going on in that tab's view. */
  badge?: boolean
  ref?: React.Ref<HTMLButtonElement>
  onClick?: () => void
}

export function VerticalTabButton({
  icon,
  tooltip,
  active,
  badge,
  ref,
  onClick,
}: VerticalTabButtonProps) {
  return (
    <Tooltip content={tooltip} side="right">
      <Flex
        position="relative"
        width="100%"
        align="center"
        justify="center"
        css={
          active
            ? css`
                &::before {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 6px;
                  bottom: 6px;
                  width: 4px;
                  background-color: var(--accent-9);
                  border-radius: 0 4px 4px 0;
                }
              `
            : undefined
        }
      >
        <IconButton
          ref={ref}
          highContrast
          aria-label={tooltip}
          variant="ghost"
          color={active ? 'orange' : 'gray'}
          size="4"
          css={css`
            margin: 0;
          `}
          onClick={onClick}
        >
          <Flex position="relative">
            {icon}
            {badge && (
              <Box
                position="absolute"
                width="8px"
                height="8px"
                top="-1px"
                right="-1px"
                css={css`
                  background-color: var(--green-9);
                  border-radius: 50%;
                  animation: ${pulse} 1.6s ease-in-out infinite;
                `}
              />
            )}
          </Flex>
        </IconButton>
      </Flex>
    </Tooltip>
  )
}
