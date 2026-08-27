import { z } from 'zod'

import { ManualRequestSchema } from './manualRequests'
import { TestRuleSchema } from './rules'
import { TestDataSchema } from './testData'
import { TestOptionsSchema } from './testOptions'

export const GeneratorFileDataSchema = z.object({
  version: z.literal('3.0'),
  recordingPath: z.string(),
  options: TestOptionsSchema,
  testData: TestDataSchema,
  rules: TestRuleSchema.array(),
  allowlist: z.string().array(),
  manualRequests: ManualRequestSchema.array().default([]),
  // Recorded requests dropped from the test, keyed by `requestKey` since the
  // requests themselves get fresh ids on every recording load.
  excludedRequests: z.string().array().default([]),
  // Recorded requests edited by hand, keyed by the `requestKey` of the
  // recorded request each one replaces, for the same reason.
  requestOverrides: z.record(z.string(), ManualRequestSchema).default({}),
  includeStaticAssets: z.boolean(),
  scriptName: z.string().default('my-script.js'),
  // True when the test setup wizard configured this generator, either at
  // creation or by re-running it later. Used for adoption reporting.
  wizardUsed: z.boolean().default(false),
})

export type GeneratorSchema = z.infer<typeof GeneratorFileDataSchema>

// TODO: Migrate generator to the next version
export function migrate(generator: z.infer<typeof GeneratorFileDataSchema>) {
  return { ...generator }
}
