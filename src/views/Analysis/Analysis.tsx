import { Callout, Flex, Select, Text } from '@radix-ui/themes'
import { useQuery } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import { useState } from 'react'

import { View } from '@/components/Layout/View'
import { ExportReportButton } from '@/components/Validator/ExportReportButton'
import { MetricsSection } from '@/components/Validator/MetricsSection'

/**
 * Reads a finished load test back from the Results folder — the Controller runs
 * a test, this analyses what it produced and exports the PDF report.
 */
export function Analysis() {
  const [selected, setSelected] = useState<string | null>(null)

  const { data: results = [] } = useQuery({
    queryKey: ['run-results'],
    queryFn: () => window.studio.ui.listResults(),
  })

  // Runs are listed newest first, so the last run is what opens by default.
  const id = selected ?? results[0]?.id ?? null

  const { data: result } = useQuery({
    queryKey: ['run-result', id],
    enabled: id !== null,
    queryFn: () => (id === null ? null : window.studio.ui.readResult(id)),
  })

  return (
    <View
      title="Analysis"
      subTitle={result?.testName}
      actions={
        <ExportReportButton
          stats={result?.stats ?? null}
          testName={result?.testName ?? 'k6'}
          isRunning={false}
        />
      }
    >
      <Flex direction="column" p="3" gap="3" height="100%" minHeight="0">
        {results.length === 0 ? (
          <Callout.Root size="1">
            <Callout.Icon>
              <InfoIcon />
            </Callout.Icon>
            <Callout.Text>
              No runs yet — start a load test in the Controller and it shows up
              here when it finishes.
            </Callout.Text>
          </Callout.Root>
        ) : (
          <Flex gap="2" align="center" flexShrink="0">
            <Text size="2" color="gray">
              Run
            </Text>
            <Select.Root value={id ?? ''} onValueChange={setSelected}>
              <Select.Trigger />
              <Select.Content>
                {results.map((run) => (
                  <Select.Item key={run.id} value={run.id}>
                    {run.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Flex>
        )}
        <Flex direction="column" flexGrow="1" minHeight="0" minWidth="0">
          <MetricsSection stats={result?.stats ?? null} />
        </Flex>
      </Flex>
    </View>
  )
}
