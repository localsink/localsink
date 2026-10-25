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

// Keyset cursor codec. The encoding is a wire-format detail owned by the
// contract: everything that mints or parses a cursor (server pagination, the
// web tail's window slide, the MSW pseudo-backend) goes through these two
// functions instead of assuming "<timestamp>:<id>".
export function encodeCursor(row: { timestamp: number; id: number }): string {
  return `${String(row.timestamp)}:${String(row.id)}`;
}

export function decodeCursor(cursor: string): {
  timestamp: number;
  id: number;
} {
  const [tsStr = '', idStr = ''] = cursor.split(':');
  return { timestamp: Number(tsStr), id: Number(idStr) };
}

const multiValueFilter = (description: string) =>
  z
    .preprocess(
      (val: unknown) => {
        if (val === undefined) return undefined;
        return (Array.isArray(val) ? val : [val])
          .flatMap((v: unknown) => (typeof v === 'string' ? v.split(',') : [v]))
          .map((v: unknown) => (typeof v === 'string' ? v.trim() : v))
          .filter((v: unknown) => v !== '');
      },
      z.array(z.string().min(1)).min(1).optional(),
    )
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
    span_id: z
      .string()
      .min(1)
      .meta({ description: 'Filter logs by span ID.' })
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

// ── License (/api/license) ─────────────────────────────────────────────────

// The shape of a license key: the lowercase UUID the licensing service mints.
// Structural only — whether the key exists is the licensing service's call.
const LICENSE_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// PUT /api/license. Trimmed and lowercased before the shape check, so a key
// pasted with stray whitespace or in uppercase still activates.
export const licenseKeyInputSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(LICENSE_KEY_REGEX, 'Not a license key.'),
});

export type LicenseKeyInput = z.infer<typeof licenseKeyInputSchema>;

// Why a key isn't licensing this install. `inactive` means the license ended
// before its paid period did (a refund); `unverified` means the key has never
// been confirmed because the licensing service couldn't be reached.
export const licenseReasonSchema = z.enum([
  'expired',
  'inactive',
  'revoked',
  'not_found',
  'unverified',
]);

export type LicenseReason = z.infer<typeof licenseReasonSchema>;

// GET /api/license, and the current state after every license mutation.
// Never carries the key itself — only its last four characters.
export const licenseStatusSchema = z.object({
  edition: z.enum(['community', 'licensed']),
  // Where the key came from: nowhere, the saved license file, or the
  // LOCALSINK_LICENSE_KEY environment variable (which makes it read-only).
  source: z.enum(['none', 'file', 'env']),
  reason: licenseReasonSchema.nullable(),
  // The licensing service gave a final answer against this key; it is no
  // longer checked automatically, only on request.
  dead: z.boolean(),
  // The most recent check couldn't reach the licensing service.
  unreachable: z.boolean(),
  checking: z.boolean(),
  customer: z.string().nullable(),
  seats: z.number().int().nullable(),
  // Epoch milliseconds, like log timestamps.
  expires_at: z.number().int().nullable(),
  checked_at: z.number().int().nullable(),
  key_hint: z.string().nullable(),
  licensing_host: z.string(),
});

export type LicenseStatus = z.infer<typeof licenseStatusSchema>;

// PUT /api/license. A failed activation leaves the current key untouched, so
// the outcome is reported separately from the status.
export const licenseActivationSchema = z.object({
  outcome: z.enum(['activated', 'rejected', 'unreachable', 'save_failed']),
  reason: z.enum(['expired', 'inactive', 'revoked', 'not_found']).nullable(),
  status: licenseStatusSchema,
});

export type LicenseActivation = z.infer<typeof licenseActivationSchema>;
