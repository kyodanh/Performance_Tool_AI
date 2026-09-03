/** Closing glossary page, mirroring the terminology section of a LoadRunner
 *  Analysis report but written against k6 concepts. */

type Term = [string, string]

const K6_OBJECTS: Term[] = [
  [
    'Test script',
    'The JavaScript the run executes. It describes the actions a VU performs and carries the groups and checks that measure the application under test.',
  ],
  [
    'Scenario',
    'The definition of what happens during a run: how many VUs to emulate, the executor that schedules them, and how long they run for.',
  ],
  [
    'Load test',
    "Tests a system's ability to handle a workload by simulating many concurrent users, and reports on the response times and behaviour observed.",
  ],
  [
    'Run',
    'A single execution of a scenario. Its metric stream is what this report aggregates.',
  ],
  [
    'VU (Virtual User)',
    'A virtual user running the test script. VUs replace human users: a run can execute tens, hundreds or thousands of them concurrently.',
  ],
  [
    'Iteration',
    'One complete execution of the test script by a VU. Iterations per second describe how fast the scenario is being replayed.',
  ],
  [
    'Dropped Iteration',
    'An iteration k6 could not start because the machine running the test had no headroom for the configured arrival rate — a sign the client, not the target, is the bottleneck.',
  ],
  [
    'Transaction (group)',
    'A named block of the script whose duration is measured as a unit, declared with group() in k6. Equivalent to a LoadRunner transaction.',
  ],
  [
    'Check',
    'An assertion on a response, such as a status code. A failed check does not stop the run; it is recorded and reported as a failure rate.',
  ],
  [
    'Load generator',
    'A machine that runs VUs and reports metrics. A distributed run spreads the load across several of them.',
  ],
]

const GRAPH_INFORMATION: Term[] = [
  ['Average', "Average value of the graph measurement's."],
  ['Hits', 'The number of HTTP requests the VUs made against the server.'],
  ['Maximum', "Maximum value of the graph measurement's."],
  ['Measurement', 'The type of resource being monitored.'],
  ['Median', "Middle value of the graph measurement's."],
  ['Minimum', "Minimum value of the graph measurement's."],
  [
    'Response time',
    'The time taken to complete a request or a transaction, measured in seconds.',
  ],
  [
    '90%',
    'The value below which 90% of the measurements fall — less sensitive to a single slow outlier than the maximum.',
  ],
  [
    'Scale (or granularity)',
    'The resolution of the x axis. Every graph in this report is drawn at the one-second resolution k6 emits its metrics at.',
  ],
  [
    'Standard Deviation (SD)',
    'The square root of the mean of the squared deviations from the mean — how much the measurement spreads around its average.',
  ],
  [
    'Throughput',
    'The amount of data, in bytes, the VUs received from the server per second.',
  ],
  [
    'TTFB (First Buffer)',
    'Time to first byte: the part of the response time the server spent processing before sending data back.',
  ],
]

function termTable(title: string, terms: Term[]) {
  return `
    <h3>${title}</h3>
    <table class="data">
      <thead><tr><th style="width:22%">Term</th><th>Definition</th></tr></thead>
      <tbody>
        ${terms.map(([term, definition]) => `<tr><td>${term}</td><td>${definition}</td></tr>`).join('')}
      </tbody>
    </table>
  `
}

export const TERMINOLOGY = `
  <section class="page">
    <h2>Terminology</h2>
    ${termTable('k6 Objects', K6_OBJECTS)}
    ${termTable('Graph Information', GRAPH_INFORMATION)}
  </section>
`
