import { z } from 'zod';

export const PinoLogSchema = z
  .object({
    level: z.number(),
    time: z.number().optional(),
    msg: z.string().optional(),
    pid: z.number().optional(),
    hostname: z.string().optional(),
    v: z.number().optional(),
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
