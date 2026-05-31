import { z } from 'zod';

export const DEFAULT_URL = 'http://localhost:3000';

export const TransportOptionsSchema = z.object({
  serviceName: z.string().min(1),
  url: z.url().optional(),
});

export type TransportOptions = z.infer<typeof TransportOptionsSchema>;
