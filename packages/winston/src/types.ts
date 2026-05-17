import { z } from 'zod';

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
      .looseObject({
        message: z.string().optional(),
        stack: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
    error: z
      .looseObject({
        message: z.string().optional(),
        stack: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
  })
  .catchall(z.unknown());
