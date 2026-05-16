import { mapConsoleArgs } from './mapper.ts';

describe('mapConsoleArgs', () => {
  describe('level', () => {
    it.each(['log', 'error', 'warn', 'info', 'debug', 'trace'] as const)(
      'passes level %s through unchanged',
      (level) => {
        const result = mapConsoleArgs(level, ['msg']);
        expect(result.level).toBe(level);
      },
    );
  });

  describe('message formatting', () => {
    it('uses a single string argument as the message', () => {
      const result = mapConsoleArgs('log', ['hello world']);
      expect(result.message).toBe('hello world');
    });

    it('space-joins multiple string arguments', () => {
      const result = mapConsoleArgs('log', ['hello', 'world']);
      expect(result.message).toBe('hello world');
    });

    it('formats %s specifiers', () => {
      const result = mapConsoleArgs('log', ['hello %s', 'world']);
      expect(result.message).toBe('hello world');
    });

    it('formats %d specifiers', () => {
      const result = mapConsoleArgs('log', ['count: %d', 42]);
      expect(result.message).toBe('count: 42');
    });

    it('converts a number argument to a string', () => {
      const result = mapConsoleArgs('log', [42]);
      expect(result.message).toBe('42');
    });
  });

  describe('error extraction', () => {
    it('extracts message, stack, and type when first arg is an Error', () => {
      const err = new TypeError('something went wrong');
      const result = mapConsoleArgs('error', [err]);
      expect(result.error).toMatchObject({
        message: 'something went wrong',
        type: 'TypeError',
      });
      expect(result.error?.stack).toContain('TypeError');
    });

    it('extracts error when it is not the first argument', () => {
      const err = new TypeError('something went wrong');
      const result = mapConsoleArgs('error', ['DB failed', err]);
      expect(result.error).toMatchObject({
        message: 'something went wrong',
        type: 'TypeError',
      });
    });

    it('sets error to null when first arg is a string', () => {
      const result = mapConsoleArgs('error', ['plain message']);
      expect(result.error).toBeNull();
    });

    it('sets error to null when args is empty', () => {
      const result = mapConsoleArgs('log', []);
      expect(result.error).toBeNull();
    });
  });

  describe('timestamp', () => {
    it('sets timestamp to a number close to Date.now()', () => {
      const before = Date.now();
      const result = mapConsoleArgs('log', ['msg']);
      const after = Date.now();
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('logger', () => {
    it('sets logger to "console"', () => {
      const result = mapConsoleArgs('log', ['msg']);
      expect(result.logger).toBe('console');
    });
  });

  describe('null fields', () => {
    it('sets trace_id, span_id, and attributes to null', () => {
      const result = mapConsoleArgs('log', ['msg']);
      expect(result.trace_id).toBeNull();
      expect(result.span_id).toBeNull();
      expect(result.attributes).toBeNull();
    });
  });
});
