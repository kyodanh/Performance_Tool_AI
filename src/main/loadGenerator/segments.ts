/**
 * Splits one load profile across several generators using k6's execution
 * segments. The profile the user sets is always the *total*: k6 applies the
 * segment to the resolved options, so `--vus 100 --execution-segment 0:1/2`
 * runs 50 VUs. Iterations and arrival rates are divided the same way.
 */
export interface ExecutionSegment {
  /** Value for `--execution-segment`, e.g. `1/4:2/4`. */
  segment: string
  /** Value for `--execution-segment-sequence`, identical for every generator. */
  sequence: string
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

/** k6 accepts rationals, so exact fractions avoid rounding gaps between shares. */
function fraction(numerator: number, denominator: number): string {
  if (numerator === 0) {
    return '0'
  }

  if (numerator === denominator) {
    return '1'
  }

  const divisor = greatestCommonDivisor(numerator, denominator)

  return `${numerator / divisor}/${denominator / divisor}`
}

/**
 * One segment per weight, in order. Weights must be positive integers: a zero
 * weight would produce an empty segment, which k6 rejects — leave that generator
 * out of the run instead.
 */
export function computeSegments(weights: number[]): ExecutionSegment[] {
  if (weights.length === 0) {
    return []
  }

  if (weights.some((weight) => !Number.isInteger(weight) || weight < 1)) {
    throw new Error('Load generator weights must be positive whole numbers')
  }

  const total = weights.reduce((sum, weight) => sum + weight, 0)

  const boundaries = weights.reduce<number[]>(
    (accumulated, weight) => [
      ...accumulated,
      (accumulated[accumulated.length - 1] ?? 0) + weight,
    ],
    [0]
  )

  const sequence = boundaries
    .map((boundary) => fraction(boundary, total))
    .join(',')

  return weights.map((_, index) => ({
    segment: `${fraction(boundaries[index] ?? 0, total)}:${fraction(
      boundaries[index + 1] ?? total,
      total
    )}`,
    sequence,
  }))
}
