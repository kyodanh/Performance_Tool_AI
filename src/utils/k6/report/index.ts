import { RunStats } from '@/utils/k6/stats'

import { barChart, ChartSeries, lineChart } from './charts'
import {
  day,
  decimal,
  duration,
  escapeHtml,
  summarize,
  timestamp,
} from './format'
import {
  checksSection,
  definitionTable,
  errorsSection,
  httpResponsesSection,
  loadGeneratorsSection,
  overviewSection,
  timingsSection,
  transactionSummarySection,
  workloadSection,
  worstRequestsSection,
} from './sections'
import { REPORT_STYLES } from './styles'
import { TERMINOLOGY } from './terminology'

export interface ReportMeta {
  title: string
  /** The test the run came from, shown as the scenario/script name. */
  testName: string
  author: string
  organization: string
}

/** Response-time chart series are capped so the legend stays readable. */
const MAX_TRANSACTION_SERIES = 10

interface GraphOptions {
  title: string
  description: string
  values: number[]
  chart: string
  /** Divides the summary values before printing, e.g. ms → s. */
  scale?: number
  digits?: number
}

function graphPage({
  title,
  description,
  values,
  chart,
  scale = 1,
  digits = 3,
}: GraphOptions) {
  const stats = summarize(values.map((value) => value / scale))
  const format = (value: number) => decimal(value, digits)

  return `
    <section class="page">
      <h2>${escapeHtml(title)}</h2>
      ${chart}
      <table class="data">
        <thead>
          <tr><th>Measurement</th><th>Minimum</th><th>Average</th><th>Maximum</th><th>Median</th><th>Std. Deviation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(title)}</td>
            <td>${format(stats.min)}</td>
            <td>${format(stats.avg)}</td>
            <td>${format(stats.max)}</td>
            <td>${format(stats.median)}</td>
            <td>${format(stats.std)}</td>
          </tr>
        </tbody>
      </table>
      <p class="description">${escapeHtml(description)}</p>
    </section>
  `
}

function bucketSeries(
  stats: RunStats,
  label: string,
  select: (bucket: RunStats['buckets'][number]) => number
): ChartSeries {
  return {
    label,
    points: stats.buckets.map((bucket) => ({
      x: bucket.time,
      y: select(bucket),
    })),
  }
}

function generalSection(stats: RunStats, meta: ReportMeta) {
  const start = stats.buckets[0]?.time ?? 0
  const end = stats.buckets[stats.buckets.length - 1]?.time ?? start

  return definitionTable('General Details', [
    { label: 'Scenario Name', value: meta.testName },
    { label: 'Run Name', value: meta.title },
    { label: 'Run Date', value: timestamp(start) },
    { label: 'Period', value: `${timestamp(start)} - ${timestamp(end)}` },
    { label: 'Run Duration', value: duration(stats.elapsed) },
    { label: 'Tool', value: 'k6 Studio' },
  ])
}

function coverPage(stats: RunStats, meta: ReportMeta) {
  const start = stats.buckets[0]?.time ?? Date.now() / 1000

  const details = [
    ['Author', meta.author],
    ['Job Title', meta.title],
    ['Organization', meta.organization],
  ]
    .filter(([, value]) => value !== '')
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label ?? '')}</th><td>${escapeHtml(value ?? '')}</td></tr>`
    )
    .join('')

  return `
    <section class="page cover">
      <h1>${escapeHtml(meta.title)}</h1>
      <p class="date">${escapeHtml(day(start))}</p>
      ${details === '' ? '' : `<h3>Author Details</h3><table class="definition">${details}</table>`}
    </section>
  `
}

/** The chart plus the samples it plots, so the summary row matches the lines. */
function transactionResponseTime(stats: RunStats) {
  const series = [...stats.groups]
    .sort((a, b) => b.avg - a.avg)
    .slice(0, MAX_TRANSACTION_SERIES)
    .map((group) => ({
      label: group.name,
      points: group.series.map((sample) => ({
        x: sample.time,
        y: sample.value,
      })),
    }))

  return {
    chart: lineChart(series, { yLabel: 'Response time (s)', scale: 0.001 }),
    values: series.flatMap((entry) => entry.points.map((point) => point.y)),
  }
}

/**
 * Renders a standalone, self-contained HTML document for the run — the source
 * the main process prints to PDF.
 */
export function buildReportHtml(stats: RunStats, meta: ReportMeta) {
  const responseTime = transactionResponseTime(stats)

  const body = [
    coverPage(stats, meta),
    `<section class="page">
      ${generalSection(stats, meta)}
      ${workloadSection(stats)}
      ${overviewSection(stats)}
    </section>`,
    `<section class="page">
      ${httpResponsesSection(stats)}
      ${timingsSection(stats)}
      ${transactionSummarySection(stats)}
    </section>`,
    `<section class="page">
      ${worstRequestsSection(stats)}
      ${checksSection(stats)}
      ${errorsSection(stats)}
    </section>`,
    ...(loadGeneratorsSection(stats) === ''
      ? []
      : [`<section class="page">${loadGeneratorsSection(stats)}</section>`]),
    graphPage({
      title: 'Running VUs',
      description:
        'Displays the number of virtual users that executed the test script during each second of the run. Use it to see the load applied to the server at any given moment.',
      values: stats.buckets.map((bucket) => bucket.vus),
      chart: lineChart([bucketSeries(stats, 'Running VUs', (b) => b.vus)], {
        yLabel: 'VUs',
      }),
      digits: 1,
    }),
    graphPage({
      title: 'Hits per Second',
      description:
        'Displays the number of HTTP requests made against the server during each second of the run. It shows the load the VUs generate in terms of request rate.',
      values: stats.buckets.map((bucket) => bucket.requests),
      chart: lineChart([bucketSeries(stats, 'Requests/s', (b) => b.requests)], {
        yLabel: 'Requests/s',
      }),
      digits: 1,
    }),
    graphPage({
      title: 'Throughput',
      description:
        'Displays the amount of data, in bytes per second, that the VUs received from the server during the run.',
      values: stats.buckets.map((bucket) => bucket.throughput),
      chart: lineChart(
        [bucketSeries(stats, 'Throughput (bytes/s)', (b) => b.throughput)],
        { yLabel: 'Bytes/s' }
      ),
      digits: 0,
    }),
    graphPage({
      title: 'Average Transaction Response Time',
      description:
        'Displays the average time taken by each transaction during every second of the run. Use it to check whether the server stays within the response time range defined for the system.',
      values: responseTime.values,
      chart: responseTime.chart,
      scale: 1000,
      digits: 3,
    }),
    `<section class="page">
      <h2>Transaction Summary</h2>
      ${barChart(
        stats.groups.map((group) => ({
          label: group.name,
          passed: Math.max(0, group.count - group.failed),
          failed: group.failed,
        }))
      )}
      <p class="description">Displays the number of transaction executions that passed and failed during the run.</p>
    </section>`,
    TERMINOLOGY,
  ].join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(meta.title)}</title>
    <style>${REPORT_STYLES}</style>
  </head>
  <body>${body}</body>
</html>`
}

/** Header/footer lines the printer stamps on every page. */
export function reportHeaderText(stats: RunStats, meta: ReportMeta) {
  const start = stats.buckets[0]?.time ?? Date.now() / 1000
  const author = meta.author === '' ? '' : ` Author: ${meta.author}`

  return `Date: ${day(start)} Report Title: ${meta.title}${author}`
}
