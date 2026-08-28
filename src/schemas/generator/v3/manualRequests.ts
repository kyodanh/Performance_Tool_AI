import { z } from 'zod'

const KeyValueTupleSchema = z.tuple([z.string(), z.string()])

const MethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  'HEAD',
  'CONNECT',
  'TRACE',
])

const ResponseSchema = z.object({
  headers: KeyValueTupleSchema.array(),
  cookies: KeyValueTupleSchema.array(),
  reason: z.string(),
  statusCode: z.number(),
  content: z.string().nullable(),
  path: z.string(),
  timestampStart: z.number(),
  timestampEnd: z.number(),
  httpVersion: z.string(),
  contentLength: z.number(),
})

const RequestSchema = z.object({
  headers: KeyValueTupleSchema.array(),
  cookies: KeyValueTupleSchema.array(),
  query: KeyValueTupleSchema.array(),
  scheme: z.string(),
  host: z.string(),
  method: MethodSchema,
  path: z.string(),
  content: z.string().nullable(),
  timestampStart: z.number(),
  timestampEnd: z.number(),
  contentLength: z.number(),
  httpVersion: z.string(),
  url: z.string(),
})

// Requests added by hand in the generator, kept in the .k6g file since they
// have no HAR recording to come from.
export const ManualRequestSchema = z.object({
  id: z.string(),
  request: RequestSchema,
  response: ResponseSchema.optional(),
  comment: z.string().optional(),
  group: z.string().optional(),
  // Absent in files written before re-import replaced instead of appended.
  source: z.literal('vugen').optional(),
})
