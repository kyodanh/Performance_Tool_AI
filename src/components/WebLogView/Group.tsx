import { css } from '@emotion/react'
import styled from '@emotion/styled'
import { ErrorMessage } from '@hookform/error-message'
import { Box, IconButton, Text, TextField } from '@radix-ui/themes'
import {
  CheckIcon,
  CircleXIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { KeyboardEvent, MouseEvent, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useClickAway } from 'react-use'

import { Group as GroupType } from '@/types'
import { mergeRefs } from '@/utils/react'

import { Collapsible } from '../Collapsible'
import { FieldError } from '../Form'

interface GroupProps {
  group: GroupType
  groups?: GroupType[]
  length: number
  children: React.ReactNode
  /**
   * `card` wraps the group in a rounded surface with its own header, so a
   * stack of groups reads as separate blocks instead of one continuous list.
   */
  variant?: 'plain' | 'card'
  /** Rendered at the start of the header, next to the collapse trigger. */
  dragHandle?: React.ReactNode
  onUpdate?: (group: GroupType) => void
  onRemove?: (group: GroupType) => void
}

export function Group({
  group,
  groups = [],
  length,
  children,
  variant = 'plain',
  dragHandle,
  onUpdate,
  onRemove,
}: GroupProps) {
  const isCard = variant === 'card'
  const headerRef = useRef<HTMLDivElement | null>(null)
  const canEdit = onUpdate !== undefined
  // Only an empty group can go away without taking requests with it.
  const canRemove = onRemove !== undefined && length === 0

  const {
    formState: { errors, isValid },
    reset,
    register,
    handleSubmit,
  } = useForm({
    defaultValues: {
      name: group.name,
    },
    mode: 'onChange',
  })

  const setIsEditing = (value: boolean) => {
    onUpdate?.({
      ...group,
      isEditing: value,
    })
  }

  const handleInputMount = (el: HTMLInputElement | null) => {
    if (document.activeElement !== el) {
      el?.focus()
      el?.select()
    }
  }

  const handleKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Escape') {
      handleReset()

      return
    }
  }

  const handleEdit = (ev?: MouseEvent<HTMLElement>) => {
    ev?.preventDefault()

    if (canEdit) {
      setIsEditing(true)
    }
  }

  const handleReset = () => {
    setIsEditing(false)

    reset({
      name: group.name,
    })
  }

  const submit = ({ name }: { name: string }) => {
    onUpdate?.({
      ...group,
      name,
      isEditing: false,
    })
  }

  useClickAway(headerRef, () => {
    if (!group.isEditing) return

    return handleSubmit(submit)()
  })

  const isValidName = (value: string) => {
    if (value.trim() === '') {
      return false
    }

    if (groups.some((g) => g.id !== group.id && g.name === value)) {
      return 'A group with this name already exists.'
    }

    return true
  }

  const { ref: formRef, ...nameProps } = register('name', {
    validate: isValidName,
  })

  return (
    <Box css={isCard && cardCss}>
      <Collapsible.Root defaultOpen>
        <Collapsible.Header ref={headerRef} css={isCard && cardHeaderCss}>
          {dragHandle}
          {group.isEditing && (
            <Collapsible.Heading>
              <InlineForm onSubmit={handleSubmit(submit)}>
                <TextField.Root
                  ref={mergeRefs(formRef, handleInputMount)}
                  size="1"
                  css={css`
                    flex: 1 1 0;
                  `}
                  onKeyDown={handleKeyDown}
                  {...nameProps}
                >
                  <TextField.Slot side="right">
                    <ErrorMessage errors={errors} name="name" as={FieldError} />
                  </TextField.Slot>
                  <TextField.Slot side="right">
                    {errors?.name !== undefined && (
                      <CircleXIcon color="var(--red-11)" />
                    )}
                  </TextField.Slot>
                </TextField.Root>
                <IconButton
                  type="submit"
                  disabled={!isValid}
                  variant="ghost"
                  color="green"
                  style={{ margin: 0 }}
                >
                  <CheckIcon />
                </IconButton>
                <IconButton
                  variant="ghost"
                  color="red"
                  style={{ margin: 0 }}
                  onClick={handleReset}
                >
                  <XIcon />
                </IconButton>
              </InlineForm>
            </Collapsible.Heading>
          )}
          {!group.isEditing && (
            <Collapsible.Heading>
              <Collapsible.Trigger>
                <span
                  css={css`
                    display: flex;
                    align-items: center;
                    min-height: 24px;
                    font-size: 13px;
                    font-weight: 500;
                  `}
                >
                  {group.name}
                  {isCard ? (
                    <Text size="1" color="gray" weight="regular" ml="2">
                      {length === 1 ? '1 request' : `${length} requests`}
                    </Text>
                  ) : (
                    ` (${length})`
                  )}
                </span>
              </Collapsible.Trigger>
              {canEdit && (
                <IconButton
                  aria-label="Rename group"
                  variant="ghost"
                  color="gray"
                  style={{ margin: 0 }}
                  onClick={handleEdit}
                >
                  <PencilIcon />
                </IconButton>
              )}
              {canRemove && (
                <IconButton
                  aria-label="Remove group"
                  variant="ghost"
                  color="gray"
                  style={{ margin: 0 }}
                  onClick={(ev) => {
                    ev.preventDefault()
                    onRemove(group)
                  }}
                >
                  <Trash2Icon />
                </IconButton>
              )}
            </Collapsible.Heading>
          )}
        </Collapsible.Header>
        <Collapsible.Content>
          <Box>{children}</Box>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  )
}

// A real border rather than an inset ring: the request table paints its own
// background over the box edges and would hide a ring.
const cardCss = css`
  border: 1px solid var(--gray-a6);
  border-radius: var(--radius-5);
  background-color: var(--gray-2);
  overflow: hidden;
`

// The card draws its own outline, so the header only needs the divider that
// separates it from the request table below.
const cardHeaderCss = css`
  background-color: var(--gray-a2);
  border-top: none;
  border-bottom: 1px solid var(--gray-a3);
`

const InlineForm = styled.form`
  display: flex;
  flex: 1 1 0;
  width: 100%;
  gap: var(--space-1);
  align-items: center;
`
