import { useQueryClient } from '@tanstack/react-query'
import log from 'electron-log/renderer'
import { useCallback } from 'react'

import { useToast } from '@/store/ui/useToast'

/**
 * Moves saved runs to the OS trash and refreshes the Analysis lists. Deletes
 * go to the trash, so there is nothing to undo in the app — recovering one is
 * the file manager's job.
 */
export function useDeleteResults() {
  const queryClient = useQueryClient()
  const showToast = useToast()

  return useCallback(
    async (ids: string[], description: string) => {
      try {
        await window.studio.ui.deleteResults(ids)
        await queryClient.invalidateQueries({ queryKey: ['run-results'] })

        showToast({
          title: 'Moved to Trash',
          description,
          status: 'success',
        })
      } catch (error) {
        log.error(error)

        showToast({
          title: 'Failed to move to Trash',
          description,
          status: 'error',
        })
      }
    },
    [queryClient, showToast]
  )
}
