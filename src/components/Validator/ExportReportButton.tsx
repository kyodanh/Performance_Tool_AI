import {
  Button,
  Dialog,
  Flex,
  Text,
  TextField,
  Tooltip,
} from '@radix-ui/themes'
import { FileTextIcon } from 'lucide-react'
import { useState } from 'react'

import { useToast } from '@/store/ui/useToast'
import { buildReportHtml, reportHeaderText } from '@/utils/k6/report'
import { RunStats } from '@/utils/k6/stats'

/** Cover details are per-team rather than per-run, so they are remembered. */
const AUTHOR_KEY = 'report-author'
const ORGANIZATION_KEY = 'report-organization'

function exportHint(hasRun: boolean, isRunning: boolean) {
  if (isRunning) {
    return 'Available when the run finishes'
  }

  if (!hasRun) {
    return 'Run the test to collect metrics for the report'
  }

  return 'Export the last run as a PDF report'
}

interface ExportReportButtonProps {
  stats: RunStats | null
  testName: string
  /** A run in flight has partial metrics, so the report waits for it to end. */
  isRunning: boolean
}

export function ExportReportButton({
  stats,
  testName,
  isRunning,
}: ExportReportButtonProps) {
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [title, setTitle] = useState(`${testName}_Performance_Report`)
  const [author, setAuthor] = useState(
    () => localStorage.getItem(AUTHOR_KEY) ?? ''
  )
  const [organization, setOrganization] = useState(
    () => localStorage.getItem(ORGANIZATION_KEY) ?? ''
  )

  const hasRun = stats !== null && stats.buckets.length > 0
  const canExport = hasRun && !isRunning

  const handleExport = async () => {
    if (stats === null || isRunning) {
      return
    }

    localStorage.setItem(AUTHOR_KEY, author)
    localStorage.setItem(ORGANIZATION_KEY, organization)

    const meta = { title, testName, author, organization }
    setExporting(true)

    try {
      const filePath = await window.studio.ui.exportReport({
        html: buildReportHtml(stats, meta),
        fileName: title,
        header: reportHeaderText(stats, meta),
        footer: organization === '' ? '' : `Organization: ${organization}`,
      })

      setOpen(false)

      if (filePath !== null) {
        showToast({ title: 'Report exported successfully', status: 'success' })
      }
    } catch {
      showToast({ title: 'Failed to export the report', status: 'error' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Tooltip content={exportHint(hasRun, isRunning)}>
        {/* A disabled button swallows pointer events, so the tooltip needs a
            wrapper to hang off. */}
        <span>
          <Dialog.Trigger>
            <Button variant="soft" radius="full" disabled={!canExport}>
              <FileTextIcon /> Export PDF report
            </Button>
          </Dialog.Trigger>
        </span>
      </Tooltip>
      <Dialog.Content maxWidth="420px">
        <Dialog.Title size="3">Export performance report</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          The report covers the finished run shown below.
        </Dialog.Description>
        <Flex direction="column" gap="3">
          <label>
            <Text as="div" size="2" mb="1">
              Report title
            </Text>
            <TextField.Root
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            <Text as="div" size="2" mb="1">
              Author
            </Text>
            <TextField.Root
              value={author}
              placeholder="Optional"
              onChange={(event) => setAuthor(event.target.value)}
            />
          </label>
          <label>
            <Text as="div" size="2" mb="1">
              Organization
            </Text>
            <TextField.Root
              value={organization}
              placeholder="Optional"
              onChange={(event) => setOrganization(event.target.value)}
            />
          </label>
        </Flex>
        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            onClick={handleExport}
            disabled={exporting || title.trim() === ''}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
