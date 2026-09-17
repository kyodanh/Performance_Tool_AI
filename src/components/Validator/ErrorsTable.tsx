import { css } from '@emotion/react'
import { Text } from '@radix-ui/themes'
import { useState } from 'react'

import { Table } from '@/components/Table'
import { RunErrorGroup } from '@/utils/k6/stats'

import { ErrorDetailDialog } from './ErrorDetailDialog'
import {
  describeCategory,
  describeCode,
  describeError,
  errorCategories,
  formatCount,
} from './format'

function errorKey(error: RunErrorGroup) {
  return `${error.code}|${error.message}|${error.url}|${error.group}`
}

/** `file=index` pairs the run tagged, or a dash when no data file was used. */
function describeDataRows(error: RunErrorGroup) {
  return error.dataRows.join(', ') || '—'
}

interface ErrorsTableProps {
  errors: RunErrorGroup[]
}

/**
 * Errors grouped by code, message, request and transaction. A row opens the
 * full text, which the truncated cell can never show on its own.
 */
export function ErrorsTable({ errors }: ErrorsTableProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedError = errors.find((error) => errorKey(error) === selected)

  // The column is dead weight for a run with no data file, which is most of
  // them — only the scripts that parameterize get the tag.
  const hasDataRows = errors.some((error) => error.dataRows.length > 0)
  const categories = errorCategories(errors)

  return (
    <>
      {categories.length > 0 && (
        <Text as="p" size="1" color="gray" mb="2">
          {categories
            .map(({ category, count }) => `${category}: ${formatCount(count)}`)
            .join(' · ')}
        </Text>
      )}
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell width="80px">Code</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="110px">
              Category
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="80px" align="right">
              Count
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Message</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Transaction</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Request</Table.ColumnHeaderCell>
            {hasDataRows && (
              <Table.ColumnHeaderCell width="140px">
                Data rows
              </Table.ColumnHeaderCell>
            )}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {errors.map((error) => (
            <Table.Row
              key={errorKey(error)}
              onClick={() => setSelected(errorKey(error))}
              css={rowStyles}
            >
              <Table.Cell>{describeCode(error)}</Table.Cell>
              <Table.Cell>{describeCategory(error)}</Table.Cell>
              <Table.Cell align="right">{formatCount(error.count)}</Table.Cell>
              <Table.Cell css={truncate}>{describeError(error)}</Table.Cell>
              <Table.Cell>{error.group || '—'}</Table.Cell>
              <Table.Cell css={truncate}>{error.url}</Table.Cell>
              {hasDataRows && (
                <Table.Cell css={truncate}>
                  {describeDataRows(error)}
                </Table.Cell>
              )}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      <ErrorDetailDialog
        error={selectedError}
        onClose={() => setSelected(null)}
      />
    </>
  )
}

const rowStyles = css`
  cursor: pointer;

  &:hover {
    background-color: var(--gray-3);
  }
`

const truncate = css`
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`
