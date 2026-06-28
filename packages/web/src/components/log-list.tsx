import { LogRow } from '@/components/log-row.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';

import type { LogRow as LogRowData } from '@localsink/contract';

type LogListProps = {
  logs: LogRowData[];
  colorFor: (service: string) => string;
  openIds: Set<number>;
  onToggle: (id: number) => void;
};

export function LogList({ logs, colorFor, openIds, onToggle }: LogListProps) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="px-2 py-1">
        {logs.length === 0 ? (
          <div className="p-6 font-mono text-[var(--ls-fg-faint)]">
            no logs match the current filters
          </div>
        ) : (
          logs.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              serviceColor={colorFor(log.service_name)}
              open={openIds.has(log.id)}
              onToggle={() => {
                onToggle(log.id);
              }}
            />
          ))
        )}
      </div>
    </ScrollArea>
  );
}
