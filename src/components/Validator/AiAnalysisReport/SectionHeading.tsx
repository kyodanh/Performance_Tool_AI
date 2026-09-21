import { css } from '@emotion/react'
import { Box, Flex, Text } from '@radix-ui/themes'

import { mono } from './styles'

/** `NGUYÊN NHÂN LỖI  TypeSafe Jev ────────` */
export function SectionHeading({
  title,
  source,
}: {
  title: string
  source?: string
}) {
  return (
    <Flex align="baseline" gap="2" mb="3">
      <Text
        size="1"
        weight="bold"
        css={css`
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--gray-11);
        `}
      >
        {title}
      </Text>
      {source && (
        <Text size="1" color="gray" css={mono}>
          {source}
        </Text>
      )}
      <Box
        flexGrow="1"
        css={css`
          height: 1px;
          background: var(--gray-a5);
        `}
      />
    </Flex>
  )
}
