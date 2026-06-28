import type { LogRow } from '@localsink/contract';

// Renders the inner lines of an expanded row; the caller styles the container
// (border, padding, level accent). Mirrors the prototype's DetailBody but reads
// the real LogRow shape: error.stack / error fields + attributes, not a
// pre-baked detail object.

function formatValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
}

function StackLines({ stack }: { stack: string }) {
  return stack.split('\n').map((line, index) => (
    <div
      // Stack lines have no stable id; index + text keeps keys unique.
      key={`${String(index)}:${line}`}
      className={
        index === 0
          ? 'text-[var(--ls-error)]'
          : 'pl-[14px] text-[var(--ls-fg-faint)]'
      }
    >
      {line}
    </div>
  ));
}

type DetailBodyProps = { log: LogRow };

export function DetailBody({ log }: DetailBodyProps) {
  const attrs = log.attributes ? Object.entries(log.attributes) : [];
  const stack = log.error?.stack;
  // Error present but no stack → a single type: message line.
  const errorLine =
    log.error && !stack
      ? `${log.error.type ?? 'Error'}: ${log.error.message ?? ''}`
      : null;

  if (!log.error && attrs.length === 0) {
    return (
      <div className="text-[var(--ls-fg-faint)]">no additional fields</div>
    );
  }

  const hasErrorBlock = stack !== undefined || errorLine !== null;

  return (
    <>
      {stack !== undefined ? <StackLines stack={stack} /> : null}
      {errorLine !== null ? (
        <div className="text-[var(--ls-error)]">{errorLine}</div>
      ) : null}
      {attrs.length > 0 ? (
        <div
          className={
            hasErrorBlock
              ? 'mt-2 border-t border-[var(--ls-border-soft)] pt-2'
              : undefined
          }
        >
          {attrs.map(([key, value]) => (
            <div key={key}>
              <span className="text-[var(--ls-fg-faint)]">{key}</span> ={' '}
              {formatValue(value)}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
