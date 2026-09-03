import { Button, Dialog, Flex, TextField } from '@radix-ui/themes'
import { useQueryClient } from '@tanstack/react-query'
import { ChartColumnIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routeMap } from '@/routeMap'
import { useToast } from '@/store/ui/useToast'
import { RunStats } from '@/utils/k6/stats'

interface SaveRunButtonProps {
  /** The test the run came from — saved versions are grouped by it. */
  testName: string
  stats: RunStats
}

/**
 * Saves the finished run to the Results folder under a name of the user's
 * choosing, then opens it in Analysis. The run also auto-saves when it stops,
 * and both writes are keyed on when the run started, so naming a version
 * renames that one save instead of adding a second.
 */
export function SaveRunButton({ testName, stats }: SaveRunButtonProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const showToast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const handleSave = async () => {
    const label = name.trim()

    setIsSaving(true)

    const id = await window.studio.ui
      .saveResult(testName, stats, label === '' ? undefined : label)
      .finally(() => setIsSaving(false))

    if (id === null) {
      showToast({ title: 'Failed to save the run', status: 'error' })

      return
    }

    setOpen(false)
    // Analysis opens on the newest run when the URL names no test, and this
    // one just started later than every saved run — no need to spell out the
    // test name, which the save sanitizes for the file system anyway.
    await queryClient.invalidateQueries({ queryKey: ['run-results'] })
    navigate(routeMap.analysis)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button variant="soft" radius="full">
          <ChartColumnIcon /> Save to Analysis
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="420px">
        <Dialog.Title size="3">Save run to Analysis</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          Saved under {testName}. Name this version to tell it apart from the
          test&apos;s other runs — leave it empty to list it by run time.
        </Dialog.Description>
        <TextField.Root
          autoFocus
          value={name}
          placeholder="Baseline, after pool tuning, …"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleSave()
            }
          }}
        />
        <Flex gap="2" mt="3" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={handleSave} loading={isSaving}>
            Save
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
