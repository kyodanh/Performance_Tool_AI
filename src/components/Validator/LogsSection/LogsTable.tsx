import { css } from '@emotion/react'
import { Text, VisuallyHidden } from '@radix-ui/themes'

import { LogEntry } from '@/schemas/k6'

import { formatTime } from './LogsSection.utils'
import { LogEntryWithSource } from './types'

const colors: Record<LogEntry['level'], string> = {
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
              <pre
                css={css`
                  margin: 0;
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
