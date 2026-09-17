import { css } from '@emotion/react'
import { Badge, BadgeProps, Flex, Text, VisuallyHidden } from '@radix-ui/themes'

import { LogEntry } from '@/schemas/k6'

import { formatTime } from './LogsSection.utils'
import { LogEntryWithSource } from './types'

const colors: Record<LogEntry['level'], BadgeProps['color']> = {
  info: 'green',
  debug: 'blue',
  warning: 'yellow',
  error: 'red',
}

interface LogsTableProps {
  logs: LogEntryWithSource[]
}

export function LogsTable({ logs }: LogsTableProps) {
  return (
    <table
      css={css`
        display: grid;
        align-items: center;
        grid-template-columns: 1fr auto auto;

        thead,
        tbody,
        tr {
          display: grid;
          grid-column: 1 / -1;
          grid-template-columns: subgrid;
        }

        tr {
          padding-right: var(--space-2);
        }

        tbody tr {
          border-bottom: 1px solid var(--gray-a3);
        }

        tbody tr:nth-of-type(even) {
          background-color: var(--gray-a2);
        }

        tbody tr:hover {
          background-color: var(--gray-a3);
        }

        td {
          font-family: var(--code-font-family);
          font-size: 13px;
          padding: var(--space-2) var(--space-1);
          /* Grid columns default to their content's width, so a long line —
             a request body logged by k6 — would stretch the table. */
          min-width: 0;
        }
      `}
    >
      <thead>
        <tr
          css={css`
            height: 0;
            padding: 0;
            margin: 0;
          `}
        >
          <th>
            <VisuallyHidden>Message</VisuallyHidden>
          </th>
          <th>
            <VisuallyHidden>Source</VisuallyHidden>
          </th>
          <th>
            <VisuallyHidden>Time</VisuallyHidden>
          </th>
        </tr>
      </thead>
      <tbody>
        {logs.map(({ source, entry }, index) => (
          <tr key={index}>
            <td
              css={css`
                border-left: 4px solid var(--${colors[entry.level]}-9);
                && {
                  padding-left: var(--space-2);
                }
              `}
            >
              <Flex align="baseline" gap="2">
                <Badge
                  color={colors[entry.level]}
                  variant="soft"
                  css={css`
                    flex-shrink: 0;
                    min-width: 52px;
                    justify-content: center;
                    text-transform: uppercase;
                  `}
                >
                  {entry.level === 'warning' ? 'warn' : entry.level}
                </Badge>
                <pre
                  css={css`
                    margin: 0;
                    min-width: 0;
                    white-space: pre-wrap;
                    overflow-wrap: anywhere;
                    /* ponytail: a logged body can be megabytes — scroll it inside
                       its own row rather than paging the whole console. */
                    max-height: 16em;
                    overflow: auto;
                  `}
                >
                  {entry.msg}
                </pre>
              </Flex>
              {entry.detail && (
                <Text
                  as="div"
                  css={css`
                    margin: var(--space-1) 0 0 60px;
                    color: var(--gray-11);
                    overflow-wrap: anywhere;
                  `}
                >
                  {entry.detail}
                </Text>
              )}
              {entry.tags && entry.tags.length > 0 && (
                <Flex
                  wrap="wrap"
                  gap="1"
                  css={css`
                    margin: var(--space-2) 0 0 60px;
                  `}
                >
                  {entry.tags.map((tag, tagIndex) => (
                    <Badge key={tagIndex} color="gray" variant="surface">
                      {tag}
                    </Badge>
                  ))}
                </Flex>
              )}
            </td>
            <Text
              asChild
              css={css`
                color: var(--gray-a9);
              `}
            >
              <td align="right">[{source}]</td>
            </Text>
            <Text
              asChild
              css={css`
                color: var(--gray-a9);
              `}
            >
              <td align="right">{formatTime(entry.time)}</td>
            </Text>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
