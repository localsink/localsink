import { mapWinstonLog } from './mapper.js';

function notNull<T>(val: T | null): T {
  if (val === null) throw new Error('mapWinstonLog unexpectedly returned null');
  return val;
}

describe('mapWinstonLog', () => {
  describe('level mapping', () => {
    it.each([
      ['error', 'error'],
      ['warn', 'warn'],
      ['info', 'info'],
      ['http', 'http'],
      ['verbose', 'verbose'],
      ['debug', 'debug'],
      ['silly', 'silly'],
    ])('passes level %s through unchanged', (level, expected) => {
      const result = notNull(mapWinstonLog({ level, message: '' }, 'svc'));
      expect(result.level).toBe(expected);
    });

    it('passes custom levels through unchanged', () => {
      const result = notNull(
        mapWinstonLog({ level: 'custom', message: '' }, 'svc'),
      );
      expect(result.level).toBe('custom');
    });
  });

  describe('field mapping', () => {
    it('maps message to message', () => {
      const result = notNull(
        mapWinstonLog({ level: 'info', message: 'hello world' }, 'svc'),
      );
      expect(result.message).toBe('hello world');
    });

    it('maps serviceName argument to service_name', () => {
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '' }, 'my-service'),
      );
      expect(result.service_name).toBe('my-service');
    });

    it('maps obj.logger to logger', () => {
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '', logger: 'app' }, 'svc'),
      );
      expect(result.logger).toBe('app');
    });
  });

  describe('timestamp mapping', () => {
    it('converts an ISO 8601 string timestamp to epoch ms', () => {
      const iso = '2024-01-01T00:00:00.000Z';
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '', timestamp: iso }, 'svc'),
      );
      expect(result.timestamp).toBe(new Date(iso).getTime());
    });

    it('passes a numeric timestamp through unchanged', () => {
      const result = notNull(
        mapWinstonLog(
          { level: 'info', message: '', timestamp: 1700000000000 },
          'svc',
        ),
      );
      expect(result.timestamp).toBe(1700000000000);
    });

    it('defaults to the current time when timestamp is absent', () => {
      const before = Date.now();
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '' }, 'svc'),
      );
      const after = Date.now();
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('error mapping', () => {
    it('maps obj.err with message, stack, type to structured error', () => {
      const result = notNull(
        mapWinstonLog(
          {
            level: 'error',
            message: 'boom',
            err: {
              message: 'oops',
              stack: 'Error: oops\n  at ...',
              type: 'TypeError',
            },
          },
          'svc',
        ),
      );
      expect(result.error).toEqual({
        message: 'oops',
        stack: 'Error: oops\n  at ...',
        type: 'TypeError',
      });
    });

    it('sets error to null when obj.err and obj.error are absent', () => {
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '' }, 'svc'),
      );
      expect(result.error).toBeNull();
    });
  });

  describe('trace context', () => {
    it('maps obj.traceId to trace_id', () => {
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '', traceId: 'abc123' }, 'svc'),
      );
      expect(result.trace_id).toBe('abc123');
    });

    it('falls back to obj.trace_id for trace_id', () => {
      const result = notNull(
        mapWinstonLog(
          { level: 'info', message: '', trace_id: 'fallback' },
          'svc',
        ),
      );
      expect(result.trace_id).toBe('fallback');
    });

    it('maps obj.spanId to span_id', () => {
      const result = notNull(
        mapWinstonLog(
          { level: 'info', message: '', spanId: 'span-xyz' },
          'svc',
        ),
      );
      expect(result.span_id).toBe('span-xyz');
    });

    it('sets trace_id and span_id to null when neither is present', () => {
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '' }, 'svc'),
      );
      expect(result.trace_id).toBeNull();
      expect(result.span_id).toBeNull();
    });
  });

  describe('attributes', () => {
    it('excludes extracted fields level, message, timestamp from attributes', () => {
      const result = notNull(
        mapWinstonLog(
          { level: 'info', message: 'hi', timestamp: 1700000000000 },
          'svc',
        ),
      );
      expect(result.attributes).toBeNull();
    });

    it('includes arbitrary fields userId and requestId in attributes', () => {
      const result = notNull(
        mapWinstonLog(
          { level: 'info', message: '', userId: 'u1', requestId: 'r1' },
          'svc',
        ),
      );
      expect(result.attributes).toEqual({ userId: 'u1', requestId: 'r1' });
    });

    it('sets attributes to null when no extra fields are present', () => {
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '' }, 'svc'),
      );
      expect(result.attributes).toBeNull();
    });
  });

  describe('null safety', () => {
    it('sets all optional fields to null (not undefined) when absent', () => {
      const result = notNull(
        mapWinstonLog({ level: 'info', message: '' }, 'svc'),
      );
      expect(result.trace_id).toBeNull();
      expect(result.span_id).toBeNull();
      expect(result.logger).toBeNull();
      expect(result.error).toBeNull();
      expect(result.attributes).toBeNull();

      expect(result.trace_id).not.toBeUndefined();
      expect(result.span_id).not.toBeUndefined();
      expect(result.logger).not.toBeUndefined();
      expect(result.error).not.toBeUndefined();
      expect(result.attributes).not.toBeUndefined();
    });
  });

  describe('schema validation', () => {
    it('returns null when level is missing', () => {
      expect(mapWinstonLog({ message: 'hello' }, 'svc')).toBeNull();
    });

    it('returns null when message is missing', () => {
      expect(mapWinstonLog({ level: 'info' }, 'svc')).toBeNull();
    });

    it('returns null when level is not a string', () => {
      expect(mapWinstonLog({ level: 30, message: 'hello' }, 'svc')).toBeNull();
    });
  });
});
