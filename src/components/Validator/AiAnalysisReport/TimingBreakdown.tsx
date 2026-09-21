import { css } from '@emotion/react'
import { Box, Flex, Text } from '@radix-ui/themes'

import { RunSummary } from '@/handlers/ai/errorAnalysis/types'

import { eyebrow, mono } from './styles'

/**
 * Where an average request spent its time. Waiting (time to first byte) is
 * the server; everything else is the client or the network.
 */
export function TimingBreakdown({
  timings,
}: {
  timings: RunSummary['timings']
}) {
  const other =
    timings.blocked +
    timings.connecting +
    timings.tlsHandshaking +
    timings.sending +
    timings.receiving
  const total = timings.waiting + other

  if (total <= 0) {
    return null
  }

  const waitingShare = (timings.waiting / total) * 100

  return (
    <Box
      mt="5"
      p="3"
      css={css`
        background: var(--gray-a2);
        border: 1px solid var(--gray-a4);
        border-radius: var(--radius-4);
      `}
    >
      <Text as="div" mb="2" css={eyebrow}>
        Timing breakdown
      </Text>
      <Flex
        css={css`
          height: 10px;
          border-radius: 5px;
          overflow: hidden;
          background: var(--gray-a4);
        `}
      >
        <Box
          css={css`
            width: ${waitingShare}%;
            background: var(--red-9);
          `}
        />
        <Box
          css={css`
            width: ${100 - waitingShare}%;
            background: var(--sand-7);
          `}
        />
      </Flex>
      <Flex wrap="wrap" gap="4" mt="2">
        <Text size="2">
          <Text color="red" weight="bold" css={mono}>
            waiting
          </Text>{' '}
          {timings.waiting.toFixed(0)} ms trung bình ({waitingShare.toFixed(0)}
          %)
        </Text>
        <Text size="2">
          <Text color="gray" css={mono}>
            blocked / connecting / TLS / sending / receiving
          </Text>{' '}
          {other.toFixed(0)} ms
        </Text>
      </Flex>
    </Box>
  )
}
