import { z } from 'zod'

import { syntheticKey } from '@/utils/zod'

import { LoadZoneSchema } from './loadZone'
import { ThresholdSchema } from './thresholds'

export const SleepTypeSchema = z.enum(['groups', 'requests', 'iterations'])

export const FixedTimingSchema = z.object({
  type: z.literal('fixed'),
  value: z.number().nonnegative().nullable(),
})

export const RangeTimingSchema = z.object({
  type: z.literal('range'),
  value: z
    .object({
      min: z.number().nonnegative(),
      max: z.number().nonnegative(),
    })
    .refine(({ min, max }) => max > min, {
      message: 'Max must be greater than min',
      path: ['max'],
    }),
})

export const TimingSchema = z.discriminatedUnion('type', [
  FixedTimingSchema,
  RangeTimingSchema,
])

export const ThinkTimeSchema = z.object({
  sleepType: SleepTypeSchema,
  timing: TimingSchema,
  // Per-request think time, keyed by `METHOD URL`. Recording request ids are
  // regenerated on every load, so the key is derived from the request itself
  // and identical requests share an override.
  overrides: z.record(z.string(), TimingSchema).optional(),
})

export const CommonOptionsSchema = z.object({
  executor: z.enum(['shared-iterations', 'ramping-vus']),
})

export const SharedIterationsOptionsSchema = CommonOptionsSchema.extend({
  executor: z.literal('shared-iterations'),
  vus: z.number().nonnegative().int().optional(),
  iterations: z.number().nonnegative().int().optional(),
})

export const RampingStageSchema = z.object({
  key: syntheticKey(),
  target: z.number().nonnegative().int(),
  duration: z
    .string()
    .regex(
      /^(\d+([hms]))$|^(\d+h)(\d+m)(\d+s)$|^(\d+h)(\d+m)$|^(\d+m)(\d+s)$/,
      {
        message: 'Must be in format 1m30s',
      }
    ),
})

export const RampingVUsOptionsSchema = CommonOptionsSchema.extend({
  executor: z.literal('ramping-vus'),
  stages: RampingStageSchema.array(),
})

export const LoadProfileExecutorOptionsSchema = z.discriminatedUnion(
  'executor',
  [SharedIterationsOptionsSchema, RampingVUsOptionsSchema]
)

export const TestOptionsSchema = z.object({
  loadProfile: LoadProfileExecutorOptionsSchema,
  thinkTime: ThinkTimeSchema,
  // Requests where every VU waits for the others before firing, keyed by
  // `requestKey` — same per-request override shape as think time.
  rendezvous: z.record(z.string(), z.literal(true)).default({}),
  thresholds: z.array(ThresholdSchema).default([]),
  cloud: z
    .object({
      loadZones: LoadZoneSchema,
    })
    .default({ loadZones: { distribution: 'even', zones: [] } }),
})
