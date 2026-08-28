import { Button } from '@radix-ui/themes'
import { ClipboardPasteIcon } from 'lucide-react'
import { ComponentProps, useState } from 'react'

import { ImportVuGenDialog } from './ImportVuGenDialog'

type ImportVuGenButtonProps = Pick<
  ComponentProps<typeof Button>,
  'variant' | 'size' | 'color'
>

export function ImportVuGenButton(props: ImportVuGenButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>
        <ClipboardPasteIcon />
        Paste LoadRunner
      </Button>
      {/* Mounted only while open so the textarea starts empty. */}
      {open && <ImportVuGenDialog open onOpenChange={setOpen} />}
    </>
  )
}
