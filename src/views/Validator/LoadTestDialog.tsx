import { css } from '@emotion/react'
import { Dialog } from '@radix-ui/themes'
import { useCallback } from 'react'

import { LoadTestRunner } from '@/components/Validator/LoadTestRunner'
import { K6TestOptions } from '@/utils/k6/schema'

interface LoadTestDialogProps {
  scriptPath: string
  options: K6TestOptions
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LoadTestDialog({
  scriptPath,
  options,
  open,
  onOpenChange,
}: LoadTestDialogProps) {
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        window.studio.script.stopScript()
      }

      onOpenChange(next)
    },
    [onOpenChange]
  )

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content maxWidth="1100px" width="90vw">
        <Dialog.Title size="4">Load test</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          Runs the script with its own options instead of the single iteration
          used for debugging. Traffic bypasses the studio proxy, so requests are
          not recorded.
        </Dialog.Description>
        <div
          css={css`
            height: 60vh;
          `}
        >
          <LoadTestRunner scriptPath={scriptPath} options={options} />
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
