import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Box } from '@radix-ui/themes'
import { ComponentType, memo, useMemo } from 'react'
import { useDeepCompareEffect } from 'react-use'

import { Table } from '@/components/Table'
import { Group as GroupType, ProxyDataWithMatches } from '@/types'

import { Group } from './Group'
import { Row, RowProps } from './Row'
import { SortableGroup } from './SortableGroup'

interface WebLogViewProps {
  requests: ProxyDataWithMatches[]
  groups: GroupType[]
  selectedRequestId?: string
  onSelectRequest: (data: ProxyDataWithMatches | null) => void
  onUpdateGroup?: (group: GroupType) => void
  onRemoveGroup?: (group: GroupType) => void
  /** Enables dragging groups into another order. Receives the new order. */
  onReorderGroups?: (order: string[]) => void
  filter?: string
  groupVariant?: 'plain' | 'card'
  RowComponent?: ComponentType<RowProps>
  ListComponent?: ComponentType<RequestListProps>
}

// Memo improves performance when filtering
export const WebLogView = memo(function WebLogView({
  requests,
  groups,
  selectedRequestId,
  onSelectRequest,
  onUpdateGroup,
  onRemoveGroup,
  onReorderGroups,
  filter,
  groupVariant = 'plain',
  RowComponent = Row,
  ListComponent = RequestList,
}: WebLogViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const selectedRequest = useMemo(
    () => requests.find((data) => data.id === selectedRequestId),
    [requests, selectedRequestId]
  )

  // Sync selectedRequest when requests change to show updates in correlation preview
  useDeepCompareEffect(() => {
    if (!selectedRequest) {
      // Close details if selected request no longer displayed
      onSelectRequest(null)
      return
    }

    onSelectRequest(selectedRequest)
  }, [selectedRequest, onSelectRequest])

  const grouped = useMemo(
    () =>
      groups.map((group) => {
        return {
          group,
          requests: requests.filter((data) => data.group === group.id),
        }
      }),
    [requests, groups]
  )
  const groupIds = useMemo(
    () => grouped.map((item) => item.group.id),
    [grouped]
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) {
      return
    }

    const from = groupIds.indexOf(String(active.id))
    const to = groupIds.indexOf(String(over.id))

    if (from === -1 || to === -1) {
      return
    }

    onReorderGroups?.(arrayMove(groupIds, from, to))
  }

  const GroupComponent = onReorderGroups ? SortableGroup : Group

  const content = grouped.map((item) => (
    <GroupComponent
      key={item.group.id}
      group={item.group}
      groups={groups}
      length={item.requests.length}
      variant={groupVariant}
      onUpdate={onUpdateGroup}
      onRemove={onRemoveGroup}
    >
      <ListComponent
        requests={item.requests}
        selectedRequestId={selectedRequestId}
        onSelectRequest={onSelectRequest}
        filter={filter}
        RowComponent={RowComponent}
      />
    </GroupComponent>
  ))

  return (
    <Box
      mb="2"
      css={
        groupVariant === 'card' && {
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }
      }
    >
      {onReorderGroups ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={groupIds}
            strategy={verticalListSortingStrategy}
          >
            {content}
          </SortableContext>
        </DndContext>
      ) : (
        content
      )}
    </Box>
  )
})

export interface RequestListProps {
  requests: ProxyDataWithMatches[]
  selectedRequestId?: string
  onSelectRequest: (data: ProxyDataWithMatches) => void
  filter?: string
  RowComponent?: ComponentType<RowProps>
}

export function RequestList({
  requests,
  selectedRequestId,
  onSelectRequest,
  filter,
  RowComponent = Row,
}: RequestListProps) {
  return (
    <Table.Root size="1" layout="fixed">
      <Table.Header css={{ textWrap: 'nowrap' }}>
        <Table.Row>
          <Table.ColumnHeaderCell width="70px">Method</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="60px">Status</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="50px">Type</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="20%">Host</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="80%">Path</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {requests.map((data) => (
          <RowComponent
            key={data.id}
            data={data}
            isSelected={selectedRequestId === data.id}
            onSelectRequest={onSelectRequest}
            filter={filter}
          />
        ))}
      </Table.Body>
    </Table.Root>
  )
}
