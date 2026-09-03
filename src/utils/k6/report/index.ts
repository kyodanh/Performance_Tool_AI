import { RunStats } from '@/utils/k6/stats'

import { barChart, ChartSeries, lineChart } from './charts'
import { day, duration, escapeHtml, timestamp } from './format'
import {
  businessProcessSection,
  checksSection,
  definitionTable,
  errorsSection,
  executiveSummarySection,
  httpResponsesSection,
  loadGeneratorsSection,
  measurementTable,
  MeasurementRow,
  overviewSection,
  resourceConsumingUrlsSection,
  scriptTransactionsSection,
  timingsSection,
  transactionSummarySection,
  workloadSection,
  workloadSummaryTable,
  worstUrlsSection,
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

/** k6 emits one sample per second, so every graph is drawn at that resolution. */
const GRANULARITY = '1 Second'

function runNames(meta: ReportMeta) {
  return { runName: meta.title, scriptName: meta.testName }
}

interface GraphOptions {
  title: string
  /** The `Filters` line of the graph header. */
  filters: string
  groupBy?: string
  description: string
  chart: string
  rows: MeasurementRow[]
  /** Omitted for graphs whose x axis is not time, e.g. the bar summary. */
  granularity?: string
}

/**
 * One graph per page, laid out the way an analysis report does it: the graph
 * header, the plot, the per-measurement summary, then the description.
 */
function graphPage(
  { title, filters, groupBy = 'None', description, chart, rows }: GraphOptions,
  meta: ReportMeta,
  granularity: string | null = GRANULARITY
) {
  const header = [
    { label: 'Title', value: title },
    { label: 'Current Results', value: meta.title },
    { label: 'Filters', value: filters },
    { label: 'Group By', value: groupBy },
    ...(granularity === null
      ? []
      : [{ label: 'Granularity', value: granularity }]),
  ]

  return `
    <section class="page">
      ${definitionTable(title, header)}
      ${chart}
      ${measurementTable(rows)}
      <p class="description">Description: ${escapeHtml(description)}</p>
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

/**
 * The cover's author block. k6 Studio collects one author field, so the name is
 * split on the first space to fill the report's First Name / Surname rows.
 */
function authorNames(author: string) {
  const parts = author.trim().split(/\s+/).filter(Boolean)

  return { firstName: parts[0] ?? '', surname: parts.slice(1).join(' ') }
}

function coverPage(
  stats: RunStats,
  meta: ReportMeta,
  runLabels: string[] = []
) {
  const start = stats.buckets[0]?.time ?? Date.now() / 1000
  const { firstName, surname } = authorNames(meta.author)

  const details = [
    ['First Name', firstName],
    ['Surname', surname],
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
      ${
        runLabels.length === 0
          ? ''
          : `<h3>Runs Included</h3><ol class="runs">${runLabels
              .map((label) => `<li>${escapeHtml(label)}</li>`)
              .join('')}</ol>`
      }
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
    rows: series.map<MeasurementRow>((entry, index) => ({
      color: index,
      measurement: entry.label,
      values: entry.points.map((point) => point.y),
      scale: 1000,
      digits: 3,
    })),
  }
}

/**
 * Every page one run contributes — what the report prints between the cover and
 * the glossary.
 */
function runSections(stats: RunStats, meta: ReportMeta) {
  const names = runNames(meta)
  const responseTime = transactionResponseTime(stats)

  return [
    `<section class="page">
      ${generalSection(stats, meta)}
      ${executiveSummarySection(stats)}
      ${businessProcessSection(stats, names)}
      ${scriptTransactionsSection(stats, names)}
    </section>`,
    `<section class="page">
      ${workloadSection(stats)}
      ${workloadSummaryTable(stats)}
      ${overviewSection(stats, names)}
    </section>`,
    `<section class="page">
      ${httpResponsesSection(stats)}
      ${transactionSummarySection(stats, names)}
    </section>`,
    `<section class="page">
      ${worstUrlsSection(stats)}
    </section>`,
    `<section class="page">
      ${resourceConsumingUrlsSection(stats)}
      ${timingsSection(stats)}
    </section>`,
    `<section class="page">
      ${checksSection(stats)}
      ${errorsSection(stats)}
    </section>`,
    ...(loadGeneratorsSection(stats) === ''
      ? []
      : [`<section class="page">${loadGeneratorsSection(stats)}</section>`]),
    graphPage(
      {
        title: 'Running VUs',
        filters: 'VU Status = (Run)',
        description:
          'Displays the number of virtual users that executed the test script during each second of the run. Use it to see the load applied to the server at any given moment.',
        chart: lineChart([bucketSeries(stats, 'Running VUs', (b) => b.vus)], {
          yLabel: 'VUs',
        }),
        rows: [
          {
            color: 0,
            measurement: 'Run',
            values: stats.buckets.map((bucket) => bucket.vus),
            digits: 1,
          },
        ],
      },
      meta
    ),
    graphPage(
      {
        title: 'Hits per Second',
        filters: 'None',
        description:
          'Displays the number of HTTP requests made against the server during each second of the run. It shows the load the VUs generate in terms of request rate.',
        chart: lineChart(
          [bucketSeries(stats, 'Requests/s', (b) => b.requests)],
          { yLabel: 'Requests/s' }
        ),
        rows: [
          {
            color: 0,
            measurement: 'Hits',
            values: stats.buckets.map((bucket) => bucket.requests),
            digits: 1,
          },
        ],
      },
      meta
    ),
    graphPage(
      {
        title: 'Throughput',
        filters: 'None',
        description:
          'Displays the amount of data, in bytes per second, that the VUs received from the server during the run.',
        chart: lineChart(
          [bucketSeries(stats, 'Throughput (bytes/s)', (b) => b.throughput)],
          { yLabel: 'Bytes/s' }
        ),
        rows: [
          {
            color: 0,
            measurement: 'Throughput',
            values: stats.buckets.map((bucket) => bucket.throughput),
            digits: 0,
          },
        ],
      },
      meta
    ),
    graphPage(
      {
        title: 'Transaction Summary',
        filters: '(do not Include Think Time)',
        description:
          'Displays the number of transaction executions that passed and failed during the run.',
        chart: barChart(
          stats.groups.map((group) => ({
            label: group.name,
            passed: Math.max(0, group.count - group.failed),
            failed: group.failed,
          }))
        ),
        rows: [
          {
            color: 0,
            measurement: 'Pass',
            values: stats.groups.map((group) =>
              Math.max(0, group.count - group.failed)
            ),
            digits: 0,
          },
          {
            color: 1,
            measurement: 'Fail',
            values: stats.groups.map((group) => group.failed),
            digits: 0,
          },
        ],
      },
      meta,
      null
    ),
    graphPage(
      {
        title: 'Average Transaction Response Time',
        filters: 'Transaction End Status = (Pass)(do not Include Think Time)',
        description:
          'Displays the average time taken by each transaction during every second of the run. Use it to check whether the server stays within the response time range defined for the system.',
        chart: responseTime.chart,
        rows: responseTime.rows,
      },
      meta
    ),
  ].join('')
}

export interface ReportRun {
  stats: RunStats
  /** Names the run in its own sections when the report covers several. */
  label?: string
}

/**
 * Renders a standalone, self-contained HTML document — the source the main
 * process prints to PDF. Several runs print as one report: a shared cover
 * listing them, then each run's own pages.
 */
export function buildReportHtml(
  input: RunStats | ReportRun[],
  meta: ReportMeta
) {
  const runs = Array.isArray(input) ? input : [{ stats: input }]
  const first = runs[0]

  if (first === undefined) {
    throw new Error('A report needs at least one run')
  }

  // A single run keeps the plain title, so its report is unchanged.
  const single = runs.length === 1
  const body = [
    coverPage(
      first.stats,
      meta,
      single ? [] : runs.map((run, index) => run.label ?? `Run ${index + 1}`)
    ),
    ...runs.map((run) =>
      runSections(
        run.stats,
        single || run.label === undefined
          ? meta
          : { ...meta, title: `${meta.title} — ${run.label}` }
      )
    ),
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

/**
 * The left-hand header block the printer stamps on every page — one line each,
 * the way an analysis report prints it.
 */
export function reportHeaderLines(stats: RunStats, meta: ReportMeta) {
  const start = stats.buckets[0]?.time ?? Date.now() / 1000

  return [
    `Date: ${day(start)}`,
    `Report Title: ${meta.title}`,
    ...(meta.author === '' ? [] : [`Author: ${meta.author}`]),
  ]
}
