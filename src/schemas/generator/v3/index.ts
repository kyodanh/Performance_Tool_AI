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
  // Requests kept in the list but left out of the script, like commented-out
  // code. Recorded ones by occurrence key (`METHOD URL#n`), manual ones by id.
  disabledRequests: z.string().array().default([]),
  // Recorded requests edited by hand, keyed by occurrence (`METHOD URL#n`)
  // like exclusions: a recording repeats the same method and URL, and only the
  // edited occurrence should change. Files saved before this hold a bare
  // `requestKey`, honoured for the first occurrence only.
  requestOverrides: z.record(z.string(), ManualRequestSchema).default({}),
  // Recorded requests moved to another group, keyed by occurrence
  // (`METHOD URL#n`) rather than by `requestKey`: a recording repeats the same
  // request across groups, and only the moved occurrence should follow.
  groupMoves: z.record(z.string(), z.string()).default({}),
  // Renamed groups, from the name a request carries in the recording to the
  // name it shows under. Kept as a mapping because reloading the recording
  // brings the original names back.
  groupRenames: z.record(z.string(), z.string()).default({}),
  // The order groups run in, by name. Groups left out of the list follow the
  // order their requests have in the recording.
  groupOrder: z.string().array().default([]),
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
