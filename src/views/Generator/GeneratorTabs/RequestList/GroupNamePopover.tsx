import { Text } from '@radix-ui/themes'
import { ReactNode, useState } from 'react'

import { ComboBox } from '@/components/ComboBox'
import { PopoverDialog } from '@/components/PopoverDialogs'

import { useGroupNames } from '../../ApiRequest'

interface GroupNamePopoverProps {
  trigger: ReactNode
  hint: string
  onSubmit: (name: string) => void
  // Set both to open the popover from somewhere other than its trigger.
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Picks an existing group or names a new one, for both moving and creating.
 * Picking is the whole interaction, so there is no separate confirm button.
 */
export function GroupNamePopover({
  trigger,
  hint,
  onSubmit,
  open: controlledOpen,
  onOpenChange,
}: GroupNamePopoverProps) {
  const groupNames = useGroupNames()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)

  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  function handleChange(name: string) {
    if (name.trim() === '') {
      return
    }

    onSubmit(name.trim())
    setOpen(false)
  }

  return (
    <PopoverDialog
      open={open}
      onOpenChange={setOpen}
      width="280px"
      trigger={trigger}
    >
      <Text as="p" size="1" color="gray" mb="2">
        {hint}
      </Text>
      <ComboBox
        value=""
        placeholder="Search or type a new name"
        options={groupNames.map((name) => ({ label: name, value: name }))}
        onChange={handleChange}
      />
    </PopoverDialog>
  )
}
