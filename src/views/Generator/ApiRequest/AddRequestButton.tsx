import { Button } from '@radix-ui/themes'
import { PlusIcon } from 'lucide-react'
import { ComponentProps, useState } from 'react'

import { ApiRequestDialog } from './ApiRequestDialog'

type AddRequestButtonProps = Pick<
  ComponentProps<typeof Button>,
  'variant' | 'size' | 'color'
>

export function AddRequestButton(props: AddRequestButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>
        <PlusIcon />
        Add request
      </Button>
      <ApiRequestDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
