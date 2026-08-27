import { LoadGenerator } from '@/types/loadGenerator'

/**
 * VUs a generator will be asked to run, given the profile's peak and how the
 * weights divide it. Mirrors the execution segments the controller computes.
 */
export function generatorShare(
  generator: LoadGenerator,
  generators: LoadGenerator[],
  peakVus: number,
  includeLocal: boolean
): number {
  const total =
    (includeLocal ? 1 : 0) +
    generators.reduce((sum, current) => sum + current.weight, 0)

  if (total === 0) {
    return 0
  }

  return Math.round((peakVus * generator.weight) / total)
}

/** Number of ephemeral ports in a `first-last` range, or null if unreadable. */
function portCount(ports: string): number | null {
  const [first, last] = ports.split('-').map(Number)

  if (
    first === undefined ||
    last === undefined ||
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    last <= first
  ) {
    return null
  }

  return last - first + 1
}

/**
 * Warns only when the machine's socket limits actually fall short of the share
 * it has been given — a 200 VU run on a machine with 16k ports needs no advice,
 * and warning anyway trains the user to ignore the column.
 *
 * Returns null when there is nothing to say, which includes not knowing.
 */
export function capacityWarning(
  generator: LoadGenerator,
  share: number
): string | null {
  if (share === 0) {
    return null
  }

  const ports = portCount(generator.ports)

  if (ports !== null && ports < share) {
    return `≈${ports.toLocaleString()} ephemeral ports for ${share} VUs — connections will start failing.`
  }

  // `unlimited` on macOS, `n/a` on Windows, which caps sockets through the port
  // range instead.
  const nofile = Number(generator.nofile)

  // Every VU holds at least one socket, plus k6's own descriptors.
  if (Number.isFinite(nofile) && nofile < share * 2) {
    return `open file limit ${nofile} for ${share} VUs — raise it or lower this generator's weight.`
  }

  return null
}
