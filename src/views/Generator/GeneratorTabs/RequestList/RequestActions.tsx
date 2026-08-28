import { Button, DropdownMenu, Flex } from '@radix-ui/themes'
import {
  ClipboardPasteIcon,
  FolderPlusIcon,
  PlusIcon,
  UploadIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { IconButtonWithTooltip } from '@/components/IconButtonWithTooltip'
import { useGeneratorStore } from '@/store/generator'

import {
  ApiRequestDialog,
  ImportVuGenDialog,
  useImportPostman,
} from '../../ApiRequest'

import {
  ButtonGroupDivider,
  buttonGroupCss,
  buttonGroupItemCss,
} from './ButtonGroup'
import { GroupNamePopover } from './GroupNamePopover'

/**
 * One segmented control for every way of getting requests into the script:
 * `Add` lists them all, the two secondary ones are also one click away.
 */
export function RequestActions() {
  const addGroup = useGeneratorStore((store) => store.addGroup)
  const { importPostman, fileInput } = useImportPostman()
  const [isAddingRequest, setIsAddingRequest] = useState(false)
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [isImportingVuGen, setIsImportingVuGen] = useState(false)
  const pendingSelection = useRef<(() => void) | null>(null)

  // Two things would close a layer opened straight from the menu: the click
  // that selected the item, and the focus the menu hands back to its trigger.
  // Running the selection once the menu is gone, with the focus handoff
  // suppressed, avoids both.
  function handleCloseAutoFocus(event: Event) {
    const selection = pendingSelection.current

    if (selection === null) {
      return
    }

    event.preventDefault()
    pendingSelection.current = null
    setTimeout(selection)
  }

  return (
    <Flex align="center" css={buttonGroupCss}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button
            variant="ghost"
            color="gray"
            size="1"
            css={buttonGroupItemCss}
          >
            <PlusIcon />
            Add
            <DropdownMenu.TriggerIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          size="1"
          align="start"
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <DropdownMenu.Item
            onSelect={() => {
              pendingSelection.current = () => setIsAddingRequest(true)
            }}
          >
            <PlusIcon />
            Add request
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={importPostman}>
            <UploadIcon />
            Import Postman
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => {
              pendingSelection.current = () => setIsImportingVuGen(true)
            }}
          >
            <ClipboardPasteIcon />
            Paste LoadRunner script
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => {
              pendingSelection.current = () => setIsCreatingGroup(true)
            }}
          >
            <FolderPlusIcon />
            Create group
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <ButtonGroupDivider />

      <IconButtonWithTooltip
        tooltip="Import Postman"
        variant="ghost"
        color="gray"
        size="1"
        css={buttonGroupItemCss}
        onClick={importPostman}
      >
        <UploadIcon />
      </IconButtonWithTooltip>

      <ButtonGroupDivider />

      <GroupNamePopover
        open={isCreatingGroup}
        onOpenChange={setIsCreatingGroup}
        hint="Name the group, then move requests into it."
        onSubmit={addGroup}
        trigger={
          <IconButtonWithTooltip
            tooltip="Create group"
            variant="ghost"
            color="gray"
            size="1"
            css={buttonGroupItemCss}
          >
            <FolderPlusIcon />
          </IconButtonWithTooltip>
        }
      />

      {fileInput}
      {/* Mounted only while open so the form starts from a clean request. */}
      {isAddingRequest && (
        <ApiRequestDialog open onOpenChange={setIsAddingRequest} />
      )}
      {isImportingVuGen && (
        <ImportVuGenDialog open onOpenChange={setIsImportingVuGen} />
      )}
    </Flex>
  )
}
