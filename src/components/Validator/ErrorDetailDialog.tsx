import { css } from '@emotion/react'
import {
  Badge,
  Button,
  Callout,
  Code,
  DataList,
  Dialog,
  Flex,
  Heading,
  ScrollArea,
  SegmentedControl,
} from '@radix-ui/themes'
import { InfoIcon } from 'lucide-react'
import { useLocalStorage } from 'react-use'

import { Table } from '@/components/Table'
import { RunErrorGroup } from '@/utils/k6/stats'

import { hintFor, Lang, TEXT } from './ErrorDetailDialog.text'
import {
  describeCategory,
  describeCode,
  describeError,
  formatCount,
} from './format'

interface ErrorDetailDialogProps {
  error: RunErrorGroup | undefined
  onClose: () => void
}

export function ErrorDetailDialog({ error, onClose }: ErrorDetailDialogProps) {
  const [storedLang, setLang] = useLocalStorage<Lang>('errorDetailLang', 'en')
  const lang: Lang = storedLang === 'vi' ? 'vi' : 'en'
  const text = TEXT[lang]

  return (
    <Dialog.Root
      open={error !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <Dialog.Content maxWidth="800px" width="90vw">
        <Flex justify="between" align="center" mb="3">
          <Dialog.Title size="4" mb="0">
            {text.title}
          </Dialog.Title>
          <SegmentedControl.Root
            size="1"
            value={lang}
            onValueChange={(value) => setLang(value as Lang)}
          >
            <SegmentedControl.Item value="en">EN</SegmentedControl.Item>
            <SegmentedControl.Item value="vi">VI</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>
        {error && <ErrorDetail error={error} lang={lang} />}
        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft">{text.close}</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function ErrorDetail({ error, lang }: { error: RunErrorGroup; lang: Lang }) {
  const text = TEXT[lang]
  const category = describeCategory(error)
  const occurrences = error.occurrences ?? []
  const hint = hintFor(error, lang)

  return (
    <Flex direction="column" gap="4">
      <Flex gap="2" align="center" wrap="wrap">
        <Badge color={category === 'HTTP 4xx' ? 'orange' : 'red'} size="2">
          {category}
        </Badge>
        <Badge color="gray" size="2">
          HTTP {describeCode(error)}
        </Badge>
        <Badge color="gray" variant="outline" size="2">
          k6 code {error.code}
        </Badge>
      </Flex>

      <DataList.Root size="2">
        <DataList.Item>
          <DataList.Label minWidth="120px">{text.message}</DataList.Label>
          <DataList.Value>{describeError(error)}</DataList.Value>
        </DataList.Item>
        {error.group && (
          <DataList.Item>
            <DataList.Label minWidth="120px">{text.transaction}</DataList.Label>
            <DataList.Value>{error.group}</DataList.Value>
          </DataList.Item>
        )}
        {error.url && (
          <DataList.Item>
            <DataList.Label minWidth="120px">{text.request}</DataList.Label>
            <DataList.Value>
              <Code variant="ghost" css={breakAll}>
                {error.url}
              </Code>
            </DataList.Value>
          </DataList.Item>
        )}
        <DataList.Item>
          <DataList.Label minWidth="120px">{text.occurrences}</DataList.Label>
          <DataList.Value>{formatCount(error.count)}</DataList.Value>
        </DataList.Item>
        {error.dataRows.length > 0 && (
          <DataList.Item>
            <DataList.Label minWidth="120px">{text.dataRows}</DataList.Label>
            <DataList.Value>
              <Flex gap="1" wrap="wrap">
                {error.dataRows.map((row) => (
                  <Badge key={row} color="gray" variant="surface">
                    {row}
                  </Badge>
                ))}
              </Flex>
            </DataList.Value>
          </DataList.Item>
        )}
      </DataList.Root>

      {occurrences.length > 0 && (
        <Flex direction="column" gap="2">
          <Heading as="h3" size="2">
            {text.failedUsers} ({formatCount(occurrences.length)}
            {occurrences.length < error.count &&
              ` ${text.of} ${formatCount(error.count)}`}
            )
          </Heading>
          <ScrollArea scrollbars="vertical" css={tableScroll}>
            <Table.Root size="1" variant="surface">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell width="60px">
                    #
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell width="100px">
                    VU
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell width="100px">
                    {text.iteration}
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>
                    {text.dataRow}
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {occurrences.map(({ vu, iter, dataRow }, index) => (
                  <Table.Row key={index}>
                    <Table.Cell>{index + 1}</Table.Cell>
                    <Table.Cell>{vu || '—'}</Table.Cell>
                    {/* iterationInTest counts from 0; people count from 1. */}
                    <Table.Cell>{iter ? Number(iter) + 1 : '—'}</Table.Cell>
                    <Table.Cell>{dataRow || '—'}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </ScrollArea>
        </Flex>
      )}

      {hint.length > 0 && (
        <Callout.Root color="gray" size="1">
          <Callout.Icon>
            <InfoIcon size={16} />
          </Callout.Icon>
          <Flex direction="column" gap="2">
            {hint.map((line) => (
              <Callout.Text key={line}>{line}</Callout.Text>
            ))}
          </Flex>
        </Callout.Root>
      )}
    </Flex>
  )
}

const breakAll = css`
  word-break: break-all;
  user-select: text;
`

const tableScroll = css`
  max-height: 220px;
`
