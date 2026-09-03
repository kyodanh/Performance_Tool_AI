import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { css } from '@emotion/react'
import { IconButton } from '@radix-ui/themes'
import { GripVerticalIcon } from 'lucide-react'

import { Group } from './Group'

type SortableGroupProps = React.ComponentProps<typeof Group>

/**
 * A group that can be dragged to another position. Only the handle starts a
 * drag, so the collapse trigger and the rename and remove buttons in the
 * header keep working.
 */
export function SortableGroup({ group, ...props }: SortableGroupProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id })

  return (
    <div
      ref={setNodeRef}
      css={css`
        transform: ${CSS.Translate.toString(transform)};
        transition: ${transition};
        opacity: ${isDragging ? 0.5 : 1};
        position: relative;
        z-index: ${isDragging ? 1 : 'auto'};
      `}
    >
      <Group
        {...props}
        group={group}
        dragHandle={
          <IconButton
            ref={setActivatorNodeRef}
            aria-label={`Reorder ${group.name}`}
            variant="ghost"
            color="gray"
            css={css`
              margin: 0 0 0 var(--space-2);
              align-self: center;
              cursor: grab;

              &:active {
                cursor: grabbing;
              }
            `}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon />
          </IconButton>
        }
      />
    </div>
  )
}
