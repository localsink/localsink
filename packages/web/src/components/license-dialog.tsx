import { EditionBadge } from '@/components/edition-badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { SubmitEvent } from 'react';

import { licenseKeyInputSchema } from '@localsink/contract';
import type { LicenseActivation, LicenseStatus } from '@localsink/contract';

import {
  activateLicense,
  checkLicense,
  fetchLicense,
  removeLicense,
} from '../lib/api.ts';

// A local read of state the server already holds — it never makes the server
// contact the licensing service, so it can poll freely. An expiry shows up
// within a minute without the page reloading.
const LICENSE_POLL_MS = 60_000;
const PRODUCTION_LICENSING_HOST = 'licensing.localsink.io';
const PRICING_URL = 'https://localsink.io/pricing';
const BILLING_URL = 'https://paddle.net';

const LICENSE_KEY = ['license'];

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const REASONS = {
  inactive: 'This commercial license is no longer active.',
  revoked: 'This license key has been revoked.',
  not_found: "This license key wasn't recognized.",
  unverified: "This license key hasn't been verified yet.",
};

// Why the current key isn't licensing this install, if there is one.
function describeReason(status: LicenseStatus): string | null {
  if (status.reason === null) return null;
  if (status.reason !== 'expired') return REASONS[status.reason];
  const on =
    status.expires_at === null ? '' : ` on ${formatDate(status.expires_at)}`;
  return status.dead
    ? `Your license expired${on}. Renewed? Check again.`
    : `Your license ended${on}, and localsink couldn't reach the licensing server to confirm a renewal. It will keep trying.`;
}

const REJECTIONS = {
  expired: 'That license has expired.',
  inactive: 'That commercial license is no longer active.',
  revoked: 'That license key has been revoked.',
  not_found: "That license key wasn't recognized.",
};

// Why an activation didn't take, or null when it did.
function describeActivation(result: LicenseActivation): string | null {
  if (result.outcome === 'activated') return null;
  if (result.outcome === 'unreachable') {
    return "Couldn't reach the licensing server. Check your connection and try again.";
  }
  if (result.outcome === 'save_failed') {
    return "The key is valid, but localsink couldn't save it. Check that your user config directory is writable.";
  }
  return REJECTIONS[result.reason ?? 'not_found'];
}

function Note({
  tone,
  children,
}: {
  tone: 'neutral' | 'warn';
  children: string;
}) {
  return (
    <p
      role={tone === 'warn' ? 'status' : undefined}
      className={
        tone === 'warn'
          ? 'rounded-[7px] bg-[var(--ls-warn-bg)] px-3 py-2 text-[var(--ls-fg)]'
          : 'text-[var(--ls-fg-dim)]'
      }
    >
      {children}
    </p>
  );
}

function KeyForm({
  replacing,
  onDone,
}: {
  replacing: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activation = useMutation({
    mutationFn: activateLicense,
    onSuccess: (result) => {
      queryClient.setQueryData(LICENSE_KEY, result.status);
      const message = describeActivation(result);
      setError(message);
      if (message === null) {
        setKey('');
        onDone();
      }
    },
    onError: () => {
      setError("Couldn't reach localsink. Try again.");
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = licenseKeyInputSchema.safeParse({ key });
    if (!parsed.success) {
      setError("That doesn't look like a license key.");
      return;
    }
    setError(null);
    activation.mutate(parsed.data.key);
  };

  return (
    <form onSubmit={submit} className="grid gap-2">
      <label htmlFor={inputId} className="text-[var(--ls-fg-dim)]">
        {replacing ? 'New license key' : 'License key'}
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
          }}
          aria-invalid={error === null ? undefined : true}
          className="h-9 text-[12.5px]"
        />
        <Button type="submit" disabled={activation.isPending || key === ''}>
          {activation.isPending
            ? 'Checking…'
            : replacing
              ? 'Replace'
              : 'Activate'}
        </Button>
      </div>
      {error === null ? null : (
        <p role="alert" className="text-[var(--ls-error)]">
          {error}
        </p>
      )}
    </form>
  );
}

function LicensePanel({ status }: { status: LicenseStatus }) {
  const queryClient = useQueryClient();
  const [replacing, setReplacing] = useState(false);
  const licensed = status.edition === 'licensed';

  const check = useMutation({
    mutationFn: checkLicense,
    onSuccess: (next) => {
      queryClient.setQueryData(LICENSE_KEY, next);
    },
  });
  const removal = useMutation({
    mutationFn: removeLicense,
    onSuccess: (next) => {
      queryClient.setQueryData(LICENSE_KEY, next);
      setReplacing(false);
    },
  });

  const reason = describeReason(status);
  const busy = check.isPending || removal.isPending || status.checking;
  const showForm =
    status.source === 'none' ||
    (status.source === 'file' && (replacing || status.dead));

  return (
    <div className="grid gap-4 font-mono text-[12.5px]">
      <DialogHeader>
        <DialogTitle>
          {licensed ? 'Licensed Edition' : 'Community Edition'}
        </DialogTitle>
        <DialogDescription>
          {licensed
            ? 'Licensed for commercial use.'
            : 'Free for personal and non-commercial use. Using localsink at work, on paid projects or for clients needs a commercial license — the same software, with nothing held back.'}
        </DialogDescription>
      </DialogHeader>

      {licensed ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-[var(--ls-fg-faint)]">Licensed to</dt>
          <dd>{status.customer}</dd>
          <dt className="text-[var(--ls-fg-faint)]">Seats</dt>
          <dd>{status.seats}</dd>
          {status.expires_at === null ? null : (
            <>
              <dt className="text-[var(--ls-fg-faint)]">Valid through</dt>
              <dd>{formatDate(status.expires_at)}</dd>
            </>
          )}
          {status.checked_at === null ? null : (
            <>
              <dt className="text-[var(--ls-fg-faint)]">Last checked</dt>
              <dd>{formatDate(status.checked_at)}</dd>
            </>
          )}
          <dt className="text-[var(--ls-fg-faint)]">Key</dt>
          <dd>•••• {status.key_hint}</dd>
        </dl>
      ) : null}

      {reason === null ? null : <Note tone="warn">{reason}</Note>}
      {status.unreachable && status.reason !== 'expired' ? (
        <Note tone="warn">
          Couldn't reach the licensing server. localsink will retry
          automatically.
        </Note>
      ) : null}

      {status.source === 'env' ? (
        <Note tone="neutral">
          This license key is set by LOCALSINK_LICENSE_KEY. Change that
          environment variable to use a different key.
        </Note>
      ) : null}

      {showForm ? (
        <KeyForm
          replacing={status.source === 'file'}
          onDone={() => {
            setReplacing(false);
          }}
        />
      ) : null}

      {status.source === 'none' ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              check.mutate();
            }}
          >
            {check.isPending || status.checking ? 'Checking…' : 'Check now'}
          </Button>
          {status.source === 'file' && !showForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setReplacing(true);
              }}
            >
              Replace key
            </Button>
          ) : null}
          {status.source === 'file' ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                removal.mutate();
              }}
            >
              Remove from this computer
            </Button>
          ) : null}
        </div>
      )}

      {status.source === 'file' ? (
        <Note tone="neutral">
          Removing the key only affects this computer. Your subscription and
          billing are unchanged.
        </Note>
      ) : null}
      {check.isError || removal.isError ? (
        <p role="alert" className="text-[var(--ls-error)]">
          Couldn't reach localsink. Try again.
        </p>
      ) : null}

      {status.licensing_host === PRODUCTION_LICENSING_HOST ? null : (
        <Note tone="neutral">{`Licensing server: ${status.licensing_host}`}</Note>
      )}

      <a
        href={licensed ? BILLING_URL : PRICING_URL}
        target="_blank"
        rel="noreferrer"
        className="text-[var(--ls-accent)] underline-offset-4 hover:underline"
      >
        {licensed ? 'Manage billing →' : 'Buy a commercial license →'}
      </a>
    </div>
  );
}

// The edition badge, and the dialog it opens: what the editions are, and
// where a license key is entered, checked and removed.
export function LicenseDialog() {
  const license = useQuery({
    queryKey: LICENSE_KEY,
    queryFn: ({ signal }) => fetchLicense(signal),
    retry: false,
    refetchInterval: LICENSE_POLL_MS,
  });
  const status = license.data;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) void license.refetch();
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="cursor-pointer rounded-[5px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        }
      >
        {status ? (
          <EditionBadge edition={status.edition} />
        ) : license.isError ? (
          // Never loaded: nothing says a key is in force.
          <EditionBadge edition="community" />
        ) : (
          <Skeleton className="h-3.5 w-28" />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {status ? (
          <LicensePanel status={status} />
        ) : (
          <DialogTitle>License status unavailable</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}
