import {
  Button,
  Checkbox,
  Dialog,
  Flex,
  ScrollArea,
  Text,
  TextField,
  Tooltip,
} from '@radix-ui/themes'
import { FileTextIcon } from 'lucide-react'
import { useState } from 'react'

import { useToast } from '@/store/ui/useToast'
import {
  buildReportHtml,
  ReportRun,
  reportHeaderLines,
} from '@/utils/k6/report'
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

export interface ExportVersion {
  id: string
  label: string
}

interface ExportReportButtonProps {
  stats: RunStats | null
  testName: string
  /** A run in flight has partial metrics, so the report waits for it to end. */
  isRunning: boolean
  /**
   * Saved versions of this test, so the report can cover several runs. Left out
   * for a live run, which exports the metrics it just collected.
   */
  versions?: ExportVersion[]
  /** The version on screen — checked when the dialog opens. */
  selectedId?: string | null
}

export function ExportReportButton({
  stats,
  testName,
  isRunning,
  versions,
  selectedId = null,
}: ExportReportButtonProps) {
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [checked, setChecked] = useState<string[]>([])
  const [title, setTitle] = useState(`${testName}_Performance_Report`)
  const [author, setAuthor] = useState(
    () => localStorage.getItem(AUTHOR_KEY) ?? ''
  )
  const [organization, setOrganization] = useState(
    () => localStorage.getItem(ORGANIZATION_KEY) ?? ''
  )

  const hasRun =
    versions === undefined
      ? stats !== null && stats.buckets.length > 0
      : versions.length > 0
  const canExport = hasRun && !isRunning
  const selected = (versions ?? []).filter((version) =>
    checked.includes(version.id)
  )
  const nothingPicked = versions !== undefined && selected.length === 0

  const handleOpenChange = (next: boolean) => {
    // The version on screen is the one a plain export means.
    if (next) {
      setChecked(selectedId === null ? [] : [selectedId])
    }

    setOpen(next)
  }

  const handleToggle = (id: string, on: boolean) => {
    setChecked((current) =>
      on ? [...current, id] : current.filter((entry) => entry !== id)
    )
  }

  /** The runs the report covers: the picked versions, or the live run. */
  const collectRuns = async (): Promise<ReportRun[]> => {
    if (versions === undefined) {
      return stats === null ? [] : [{ stats }]
    }

    const results = await Promise.all(
      selected.map((version) => window.studio.ui.readResult(version.id))
    )

    return results.flatMap((result, index) => {
      const version = selected[index]

      if (result === null || version === undefined) {
        return []
      }

      return [{ stats: result.stats, label: version.label }]
    })
  }

  const handleExport = async () => {
    if (isRunning) {
      return
    }

    localStorage.setItem(AUTHOR_KEY, author)
    localStorage.setItem(ORGANIZATION_KEY, organization)

    const meta = { title, testName, author, organization }
    setExporting(true)

    try {
      const runs = await collectRuns()
      const first = runs[0]

      if (first === undefined) {
        showToast({ title: 'No run to export', status: 'error' })

        return
      }

      const filePath = await window.studio.ui.exportReport({
        html: buildReportHtml(runs, meta),
        fileName: title,
        headerLines: reportHeaderLines(first.stats, meta),
        organization,
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
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
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
          {versions === undefined
            ? 'The report covers the finished run shown below.'
            : 'Pick the runs the report covers — each one gets its own pages.'}
        </Dialog.Description>
        <Flex direction="column" gap="3">
          {versions !== undefined && (
            <div>
              <Text as="div" size="2" mb="1">
                Runs
              </Text>
              <ScrollArea scrollbars="vertical" style={{ maxHeight: 160 }}>
                <Flex direction="column" gap="1" pr="2">
                  {versions.map((version) => (
                    <Text as="label" size="2" key={version.id}>
                      <Flex gap="2" align="center">
                        <Checkbox
                          checked={checked.includes(version.id)}
                          onCheckedChange={(on) =>
                            handleToggle(version.id, on === true)
                          }
                        />
                        {version.label}
                      </Flex>
                    </Text>
                  ))}
                </Flex>
              </ScrollArea>
            </div>
          )}
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
            disabled={exporting || nothingPicked || title.trim() === ''}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
