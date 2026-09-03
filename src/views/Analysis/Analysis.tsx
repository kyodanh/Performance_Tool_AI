import {
  Badge,
  Button,
  Callout,
  Flex,
  IconButton,
  Text,
  Tooltip,
} from '@radix-ui/themes'
import { useQuery } from '@tanstack/react-query'
import { InfoIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { View } from '@/components/Layout/View'
import { ExportReportButton } from '@/components/Validator/ExportReportButton'
import { MetricsSection } from '@/components/Validator/MetricsSection'
import { useDeleteResults } from '@/hooks/useDeleteResults'

import { groupRuns, runLabel } from './Analysis.utils'

/**
 * The results of one test, read back from the Results folder — the Controller
 * runs a test and saves it here, this shows every version saved for it and
 * exports the PDF report. The test is picked in the Analysis sidebar.
 */
export function Analysis() {
  const { project } = useParams<{ project: string }>()
  const [selected, setSelected] = useState<string | null>(null)
  const deleteResults = useDeleteResults()

  const { data: results = [] } = useQuery({
    queryKey: ['run-results'],
    queryFn: () => window.studio.ui.listResults(),
  })

  const projects = useMemo(() => groupRuns(results), [results])

  // Without a test in the URL the newest one opens — runs are listed newest
  // first, so that is the last test run.
  const active =
    project === undefined
      ? projects[0]
      : projects.find((entry) => entry.testName === project)

  const versions = active?.runs ?? []
  // Falling back keeps a version selected in the previous test from sticking.
  const id =
    (selected !== null && versions.some((run) => run.id === selected)
      ? selected
      : versions[0]?.id) ?? null

  const { data: result } = useQuery({
    queryKey: ['run-result', id],
    enabled: id !== null,
    queryFn: () => (id === null ? null : window.studio.ui.readResult(id)),
  })

  return (
    <View
      title="Analysis"
      subTitle={active?.testName}
      actions={
        <ExportReportButton
          stats={result?.stats ?? null}
          testName={result?.testName ?? active?.testName ?? 'k6'}
          isRunning={false}
          versions={versions.map((run) => ({
            id: run.id,
            label: runLabel(run),
          }))}
          selectedId={id}
        />
      }
    >
      {active === undefined ? (
        <Flex p="3">
          <Callout.Root size="1">
            <Callout.Icon>
              <InfoIcon />
            </Callout.Icon>
            <Callout.Text>
              {results.length === 0
                ? 'No saved runs yet — start a load test in the Controller and save it to Analysis when it finishes.'
                : 'No saved runs for this test. Pick another one in the sidebar.'}
            </Callout.Text>
          </Callout.Root>
        </Flex>
      ) : (
        <Flex direction="column" p="3" gap="3" height="100%" minHeight="0">
          <Flex gap="2" align="center" wrap="wrap" flexShrink="0">
            <Text size="1" color="gray">
              Versions
            </Text>
            <Badge variant="soft" radius="full">
              {versions.length}
            </Badge>
            {versions.map((run) => (
              <Button
                key={run.id}
                size="1"
                variant={run.id === id ? 'soft' : 'outline'}
                onClick={() => setSelected(run.id)}
              >
                {runLabel(run)}
              </Button>
            ))}
            {id !== null && (
              <Tooltip content="Move this version to Trash">
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label="Delete this version"
                  onClick={() => {
                    setSelected(null)
                    void deleteResults(
                      [id],
                      `${active.testName} — ${
                        versions.find((run) => run.id === id)?.label ?? id
                      }`
                    )
                  }}
                >
                  <Trash2Icon />
                </IconButton>
              </Tooltip>
            )}
          </Flex>
          <Flex direction="column" flexGrow="1" minHeight="0" minWidth="0">
            <MetricsSection stats={result?.stats ?? null} />
          </Flex>
        </Flex>
      )}
    </View>
  )
}
