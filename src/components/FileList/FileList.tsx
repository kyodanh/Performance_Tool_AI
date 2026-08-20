import { css } from '@emotion/react'

import { useActiveFilePath } from '@/hooks/useCurrentFile'
import * as path from '@/utils/path'

import { File, NoFileMessage } from './File'
import { FileItem } from './types'

interface FileListProps {
  files: FileItem[]
  noFilesMessage: string
  /** Where clicking a file navigates. Defaults to the file viewer. */
  getPath?: (filePath: string) => string
}

export function FileList({ files, noFilesMessage, getPath }: FileListProps) {
  const activeFilePath = useActiveFilePath()

  if (files.length === 0) {
    return <NoFileMessage message={noFilesMessage} />
  }

  return (
    <ul
      css={css`
        list-style: none;
        padding: 0;
        margin: var(--space-1) 0 0;
      `}
    >
      {files.map((file) => (
        <li key={file.displayName}>
          <File
            file={file}
            getPath={getPath}
            isSelected={
              activeFilePath !== undefined &&
              path.equal(file.path, activeFilePath)
            }
          />
        </li>
      ))}
    </ul>
  )
}
