import { Grid } from '@radix-ui/themes'

import { formatBytes, formatTime } from '@/components/Validator/format'
import { MetricPanel, seriesStyle } from '@/components/Validator/MetricPanel'
import { RunStats, StatsBucket } from '@/utils/k6/stats'

import { overlaySeries } from './compareRuns'

export const NOW_STYLE = seriesStyle(0)
export const BASE_STYLE = seriesStyle(1)

const CHARTS: Array<{
  title: string
  unit: string
  select: (bucket: StatsBucket) => number
  format: (value: number) => string
}> = [
  {
    title: 'Running VUsers',
    unit: '# of VUsers',
    select: (b) => b.vus,
    format: (value) => value.toFixed(0),
  },
  {
    title: 'Response time',
    unit: 'sec',
    select: (b) => b.duration,
    format: formatTime,
  },
  {
    title: 'Hits per second',
    unit: '# hits/sec',
    select: (b) => b.requests,
    format: (value) => value.toFixed(0),
  },
  {
    title: 'Failed hits per second',
    unit: '# hits/sec',
    select: (b) => b.failed,
    format: (value) => value.toFixed(0),
  },
  {
    title: 'Throughput',
    unit: 'bytes/sec',
    select: (b) => b.throughput,
    format: formatBytes,
  },
]

/** Both runs drawn over each other, one panel per metric. */
export function CompareCharts({
  base,
  current,
}: {
  base: RunStats
  current: RunStats
}) {
  return (
    <Grid columns="repeat(auto-fit, minmax(320px, 1fr))" gap="3" align="start">
      {CHARTS.map(({ title, unit, select, format }) => {
        const { now, before, start, end } = overlaySeries(base, current, select)

        return (
          <MetricPanel
            key={title}
            title={title}
            unit={unit}
            series={[
              { name: 'Now', ...NOW_STYLE, samples: now },
              { name: 'Base', ...BASE_STYLE, samples: before },
            ]}
            start={start}
            end={end}
            format={format}
          />
        )
      })}
    </Grid>
  )
}
