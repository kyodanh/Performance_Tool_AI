import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  IconButton,
  ScrollArea,
  SegmentedControl,
  Select,
  Text,
  Tooltip,
} from '@radix-ui/themes'
import { useQueries, useQuery } from '@tanstack/react-query'
import { CheckIcon, InfoIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { View } from '@/components/Layout/View'
import { ExportReportButton } from '@/components/Validator/ExportReportButton'
import { MetricsSection } from '@/components/Validator/MetricsSection'
import { SlaSection } from '@/components/Validator/SlaSection'
import { useDeleteResults } from '@/hooks/useDeleteResults'
import { evaluateSla } from '@/utils/k6/sla'

import { groupRuns, runLabel } from './Analysis.utils'
import { CompareRunsTable } from './CompareRunsTable'

const NO_COMPARE = 'none'

/**
 * The results of one test, read back from the Results folder — the Controller
 * runs a test and saves it here, this shows every version saved for it and
 * exports the PDF report. The test is picked in the Analysis sidebar.
 */
export function Analysis() {
  const { project } = useParams<{ project: string }>()
  const [selected, setSelected] = useState<string | null>(null)
  const [compareId, setCompareId] = useState<string>(NO_COMPARE)
  const [tab, setTab] = useState<'metrics' | 'sla'>('metrics')
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

  // Every version is read so each button can carry its SLA verdict. Shares the
  // cache key of the selected run, so switching versions reads nothing twice.
  // ponytail: reads every version up front, page it if a test grows hundreds
  const versionResults = useQueries({
    queries: versions.map((run) => ({
      queryKey: ['run-result', run.id],
      queryFn: () => window.studio.ui.readResult(run.id),
    })),
  })
  // Only runs saved with the SLA check on carry one — the rest show no verdict.
  const verdictOf = (index: number) => {
    const data = versionResults[index]?.data

    return data?.sla ? evaluateSla(data.stats, data.sla) : null
  }

  const { data: result } = useQuery({
    queryKey: ['run-result', id],
    enabled: id !== null,
    queryFn: () => (id === null ? null : window.studio.ui.readResult(id)),
  })

  // Any saved run can be the base, including another test's — comparing
  // Pro_360_v2 against the generator run it came from is a common question.
  const currentRun = versions.find((run) => run.id === id)
  const compareCandidates = results.filter((run) => run.id !== id)
  const compareRun = compareCandidates.find((run) => run.id === compareId)
  const baseId = compareRun?.id ?? null
  const compareLabel = (run: (typeof results)[number]) =>
    run.testName === active?.testName
      ? runLabel(run)
      : `${run.testName} — ${runLabel(run)}`

  const { data: baseResult } = useQuery({
    queryKey: ['run-result', baseId],
    enabled: baseId !== null,
    queryFn: () =>
      baseId === null ? null : window.studio.ui.readResult(baseId),
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
            {versions.map((run, index) => {
              const verdict = verdictOf(index)

              return (
                <Button
                  key={run.id}
                  size="1"
                  variant={run.id === id ? 'soft' : 'outline'}
                  color={
                    verdict === null
                      ? undefined
                      : verdict.passed
                        ? 'green'
                        : 'red'
                  }
                  title={
                    verdict === null
                      ? undefined
                      : verdict.passed
                        ? 'SLA met'
                        : `SLA missed (${verdict.failedRows})`
                  }
                  onClick={() => setSelected(run.id)}
                >
                  {verdict !== null &&
                    (verdict.passed ? <CheckIcon /> : <XIcon />)}
                  {runLabel(run)}
                </Button>
              )
            })}
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
            {compareCandidates.length > 0 && (
              <Flex gap="2" align="center" ml="auto">
                <Text size="1" color="gray">
                  Compare with
                </Text>
                <Select.Root
                  size="1"
                  value={compareRun === undefined ? NO_COMPARE : compareRun.id}
                  onValueChange={setCompareId}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value={NO_COMPARE}>No comparison</Select.Item>
                    {compareCandidates.map((run) => (
                      <Select.Item key={run.id} value={run.id}>
                        {compareLabel(run)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Flex>
            )}
          </Flex>
          {/* While comparing, the comparison takes the whole area — pick
              "No comparison" to get this run's full details back. */}
          <Flex direction="column" flexGrow="1" minHeight="0" minWidth="0">
            {compareRun !== undefined ? (
              <ScrollArea scrollbars="vertical">
                {baseResult && result && (
                  <Box p="3">
                    <CompareRunsTable
                      base={baseResult.stats}
                      current={result.stats}
                      baseLabel={compareLabel(compareRun)}
                      currentLabel={
                        currentRun ? runLabel(currentRun) : 'Current'
                      }
                      baseSla={baseResult.sla}
                      currentSla={result.sla}
                    />
                  </Box>
                )}
              </ScrollArea>
            ) : (
              <>
                {result?.sla && (
                  <SegmentedControl.Root
                    size="1"
                    value={tab}
                    onValueChange={(value) => setTab(value as typeof tab)}
                    css={{ alignSelf: 'flex-start', flexShrink: 0 }}
                  >
                    <SegmentedControl.Item value="metrics">
                      Metrics
                    </SegmentedControl.Item>
                    <SegmentedControl.Item value="sla">
                      SLA
                    </SegmentedControl.Item>
                  </SegmentedControl.Root>
                )}
                {result?.sla && tab === 'sla' ? (
                  <SlaSection
                    sla={result.sla}
                    verdict={evaluateSla(result.stats, result.sla)}
                  />
                ) : (
                  <MetricsSection stats={result?.stats ?? null} />
                )}
              </>
            )}
          </Flex>
        </Flex>
      )}
    </View>
  )
}
