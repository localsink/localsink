import { mapPinoLog } from './mapper.js';

function notNull<T>(val: T | null): T {
  if (val === null) throw new Error('mapPinoLog unexpectedly returned null');
  return val;
}

describe('mapPinoLog', () => {
  describe('level mapping', () => {
    it.each([
      [10, 'trace'],
      [20, 'debug'],
      [30, 'info'],
      [40, 'warn'],
      [50, 'error'],
      [60, 'fatal'],
    ])('maps level %i to %s', (num, text) => {
      const result = notNull(
        mapPinoLog({ level: num, time: 0, msg: '' }, 'svc'),
      );
      expect(result.level).toBe(text);
    });

    it('maps unknown level to its string representation', () => {
      const result = notNull(
        mapPinoLog({ level: 35, time: 0, msg: '' }, 'svc'),
      );
      expect(result.level).toBe('35');
    });
  });

  describe('field mapping', () => {
    it('maps obj.msg to message', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: 'hello world' }, 'svc'),
      );
      expect(result.message).toBe('hello world');
    });

    it('maps obj.time to timestamp unchanged', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 1700000000000, msg: '' }, 'svc'),
      );
      expect(result.timestamp).toBe(1700000000000);
    });

    it('maps serviceName argument to service_name', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: '' }, 'my-service'),
      );
      expect(result.service_name).toBe('my-service');
    });

    it('maps obj.logger to logger', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: '', logger: 'app' }, 'svc'),
      );
      expect(result.logger).toBe('app');
    });
  });

  describe('error mapping', () => {
    it('maps obj.err with message, stack, type to structured error', () => {
      const result = notNull(
        mapPinoLog(
          {
            level: 50,
            time: 0,
            msg: 'boom',
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
        mapPinoLog({ level: 30, time: 0, msg: '' }, 'svc'),
      );
      expect(result.error).toBeNull();
    });
  });

  describe('trace context', () => {
    it('maps obj.traceId to trace_id', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: '', traceId: 'abc123' }, 'svc'),
      );
      expect(result.trace_id).toBe('abc123');
    });

    it('falls back to obj.trace_id for trace_id', () => {
      const result = notNull(
        mapPinoLog(
          { level: 30, time: 0, msg: '', trace_id: 'fallback' },
          'svc',
        ),
      );
      expect(result.trace_id).toBe('fallback');
    });

    it('maps obj.spanId to span_id', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: '', spanId: 'span-xyz' }, 'svc'),
      );
      expect(result.span_id).toBe('span-xyz');
    });

    it('sets trace_id and span_id to null when neither is present', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: '' }, 'svc'),
      );
      expect(result.trace_id).toBeNull();
      expect(result.span_id).toBeNull();
    });
  });

  describe('attributes', () => {
    it('excludes pino internal fields pid, hostname, v from attributes', () => {
      const result = notNull(
        mapPinoLog(
          { level: 30, time: 0, msg: '', pid: 1234, hostname: 'box', v: 1 },
          'svc',
        ),
      );
      expect(result.attributes).toBeNull();
    });

    it('excludes extracted fields level, time, msg from attributes', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: 'hi' }, 'svc'),
      );
      expect(result.attributes).toBeNull();
    });

    it('includes arbitrary fields userId and requestId in attributes', () => {
      const result = notNull(
        mapPinoLog(
          { level: 30, time: 0, msg: '', userId: 'u1', requestId: 'r1' },
          'svc',
        ),
      );
      expect(result.attributes).toEqual({ userId: 'u1', requestId: 'r1' });
    });

    it('sets attributes to null when no extra fields are present', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: '' }, 'svc'),
      );
      expect(result.attributes).toBeNull();
    });
  });

  describe('null safety', () => {
    it('sets all optional fields to null (not undefined) when absent', () => {
      const result = notNull(
        mapPinoLog({ level: 30, time: 0, msg: '' }, 'svc'),
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
    it('returns null when required fields are missing', () => {
      expect(mapPinoLog({ time: 0, msg: 'hello' }, 'svc')).toBeNull();
      expect(mapPinoLog({ level: 30, msg: 'hello' }, 'svc')).toBeNull();
      expect(mapPinoLog({ level: 30, time: 0 }, 'svc')).toBeNull();
    });

    it('returns null when field types are wrong', () => {
      expect(
        mapPinoLog({ level: 'info', time: 0, msg: 'hello' }, 'svc'),
      ).toBeNull();
    });
  });
});
