import { z } from 'zod';

export const DEFAULT_URL = 'http://localhost:3000';

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
