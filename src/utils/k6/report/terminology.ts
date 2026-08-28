/** Closing glossary page, mirroring the terminology section of a LoadRunner
 *  Analysis report but written against k6 concepts. */

const TERMS: Array<[string, string]> = [
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
  ['Hits', 'The number of HTTP requests the VUs made against the server.'],
  [
    'Response time',
    'The time taken to complete a request or a transaction, measured in seconds.',
  ],
  [
    'Throughput',
    'The amount of data, in bytes, the VUs received from the server per second.',
  ],
  [
    'Load profile',
    'The schedule of the run: how many VUs are started, how fast they ramp up, how long they hold, and how they ramp down.',
  ],
  [
    'Standard Deviation (SD)',
    'The square root of the mean of the squared deviations from the mean — how much the measurement spreads around its average.',
  ],
  [
    'Median',
    'The middle value of the measurement across the run, less sensitive to outliers than the average.',
  ],
  [
    'TTFB (First Buffer)',
    'Time to first byte: the part of the response time the server spent processing before sending data back.',
  ],
]

export const TERMINOLOGY = `
  <section class="page">
    <h2>Terminology</h2>
    <table class="data">
      <thead><tr><th style="width:22%">Term</th><th>Definition</th></tr></thead>
      <tbody>
        ${TERMS.map(([term, definition]) => `<tr><td>${term}</td><td>${definition}</td></tr>`).join('')}
      </tbody>
    </table>
  </section>
`
