import { Button } from '@radix-ui/themes'
import { UploadIcon } from 'lucide-react'
import { ComponentProps } from 'react'

import { useImportPostman } from './useImportPostman'

type ImportPostmanButtonProps = Pick<
  ComponentProps<typeof Button>,
  'variant' | 'size' | 'color'
>

export function ImportPostmanButton(props: ImportPostmanButtonProps) {
  const { importPostman, fileInput } = useImportPostman()

  return (
    <>
      <Button {...props} onClick={importPostman}>
        <UploadIcon />
        Import Postman
      </Button>
      {fileInput}
    </>
  )
}
