import { z } from 'zod';

const errorPayloadSchema = z.looseObject({
  message: z.string().optional(),
  stack: z.string().optional(),
  type: z.string().optional(),
});

// ── Ingest (POST /api/logs) ────────────────────────────────────────────────

export const ingestPayloadSchema = z.object({
  service_name: z.string(),
  timestamp: z.number().int(),
  level: z.string(),
  message: z.string(),
  trace_id: z.string().nullable().optional(),
  span_id: z.string().nullable().optional(),
  logger: z.string().nullable().optional(),
  error: errorPayloadSchema.nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

// ── Query (GET /api/logs) ──────────────────────────────────────────────────

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const CURSOR_REGEX = /^(\d+):(\d+)$/;

const multiValueFilter = (description: string) =>
  z
    .preprocess((val: unknown) => {
      if (val === undefined) return undefined;
      return (Array.isArray(val) ? val : [val])
        .flatMap((v: unknown) => (typeof v === 'string' ? v.split(',') : [v]))
        .map((v: unknown) => (typeof v === 'string' ? v.trim() : v))
        .filter((v: unknown) => v !== '');
    }, z.array(z.string().min(1)).min(1).optional())
    .meta({ description });

export const logsQuerySchema = z
  .object({
    service_name: multiValueFilter(
      'Filter logs by one or more service names (repeat the param, pass an array, or comma-separate). Matches any listed service.',
    ),
    level: multiValueFilter(
      'Filter logs by one or more levels (e.g., info, error, debug). Repeat the param, pass an array, or comma-separate. Matches any listed level.',
    ),
    logger: z
      .string()
      .min(1)
      .meta({
        description: 'Filter logs by logger (e.g., pino, winston, console).',
      })
      .optional(),
    trace_id: z
      .string()
      .min(1)
      .meta({ description: 'Filter logs by trace ID.' })
      .optional(),
    from: z.coerce
      .number()
      .int()
      .min(0)
      .meta({
        description:
          'Filter logs starting from this epoch millisecond timestamp (inclusive).',
      })
      .optional(),
    to: z.coerce
      .number()
      .int()
      .min(0)
      .meta({
        description:
          'Filter logs up to this epoch millisecond timestamp (exclusive).',
      })
      .optional(),
    q: z
      .string()
      .trim()
      .min(1)
      .meta({
        description:
          'FTS5 free-text query across message, error, and attributes (recursive over nested JSON; attribute keys are searchable too). Supports prefix queries like "err*", phrases like "\\"failed connection\\"", boolean operators "AND/OR/NOT", and column scoping like "error_text:timeout", "attributes_text:user_id", or "message:login". Input that is not valid FTS5 (e.g. free text containing punctuation like "key-2024-q1") is automatically retried as a literal phrase, so plain-text searches still match.',
      })
      .optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .default(DEFAULT_LIMIT)
      .meta({
        description: `Maximum number of logs to return (default ${String(DEFAULT_LIMIT)}, max ${String(MAX_LIMIT)}).`,
      }),
    cursor: z
      .string()
      .regex(CURSOR_REGEX, 'Cursor must be in the format "<timestamp>:<id>".')
      .meta({
        description:
          "Opaque pagination cursor from a previous response's next_cursor field. Mutually exclusive with offset.",
      })
      .optional(),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .meta({
        description: 'Pagination offset. Mutually exclusive with cursor.',
      })
      .optional(),
    after_id: z
      .preprocess(
        (val) => (val === '' ? undefined : val),
        z.coerce.number().int().min(0),
      )
      .meta({
        description:
          'Return only logs with id greater than this value, ordered by id ASC. Used for polling new logs since a known high-water mark. Mutually exclusive with cursor and offset.',
      })
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (d.cursor !== undefined && d.offset !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['cursor'],
        message: 'Cannot use both cursor and offset.',
      });
    }
    if (d.after_id !== undefined && d.cursor !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['after_id'],
        message: 'Cannot use both after_id and cursor.',
      });
    }
    if (d.after_id !== undefined && d.offset !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['after_id'],
        message: 'Cannot use both after_id and offset.',
      });
    }
  });

export type LogFilter = z.infer<typeof logsQuerySchema>;

// ── Log row (GET /api/logs/:id, items in GET /api/logs) ───────────────────

export const logRowSchema = z.object({
  id: z.number().int(),
  service_name: z.string(),
  timestamp: z.number().int(),
  level: z.string(),
  message: z.string(),
  trace_id: z.string().nullable(),
  span_id: z.string().nullable(),
  logger: z.string().nullable(),
  error: errorPayloadSchema.nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
});

export type LogRow = z.infer<typeof logRowSchema>;

// ── Page (GET /api/logs) ───────────────────────────────────────────────────

export const logPageSchema = z.object({
  data: z.array(logRowSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});

export type LogPage = z.infer<typeof logPageSchema>;

// ── Meta (GET /api/logs/meta) ──────────────────────────────────────────────

export const logMetaSchema = z.object({
  total: z.number().int(),
  services: z.array(z.string()),
  levels: z.array(z.string()),
  loggers: z.array(z.string()),
  timestamp_range: z
    .object({
      min: z.number().int(),
      max: z.number().int(),
    })
    .nullable(),
});

export type LogMeta = z.infer<typeof logMetaSchema>;
