import { z } from 'zod';

export const TransportOptionsSchema = z.object({
  serviceName: z.string().min(1),
  url: z.url().optional(),
});

export type TransportOptions = z.infer<typeof TransportOptionsSchema>;

export interface IngestPayload {
  service_name: string;
  timestamp: number;
  level: string;
  message: string;
  trace_id: string | null;
  span_id: string | null;
  logger: string | null;
  error: { message?: string; stack?: string; type?: string } | null;
  attributes: Record<string, unknown> | null;
}

export const WinstonLogSchema = z
  .object({
    level: z.string(),
    message: z.string(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    traceId: z.string().optional(),
    trace_id: z.string().optional(),
    spanId: z.string().optional(),
    span_id: z.string().optional(),
    logger: z.string().optional(),
    err: z
      .object({
        message: z.string().optional(),
        stack: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
    error: z
      .object({
        message: z.string().optional(),
        stack: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
  })
  .catchall(z.unknown());
