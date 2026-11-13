
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActionState } from '../lib/action-types';
import { Icon } from './Icon';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SecretBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret" role="status">
      <span className="small muted">{label}</span>
      <b>{value}</b>
      <button
        type="button"
        className="btn sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            /* clipboard blocked: the PIN is visible anyway */
          }
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/**
 * A form wired to a server action. Keeps what the user typed when the server
 * reports a problem, disables the button while saving, and shows the result.
 */
export function ActionForm({
  action,
  children,
  submit = 'Save',
  pending = 'Saving…',
  submitClass = 'btn primary',
  resetOnSuccess = false,
  extra,
  className,
  hideActions = false,
  confirm,
}: {
  action: Action;
  children: ReactNode;
  submit?: ReactNode;
  pending?: string;
  submitClass?: string;
  resetOnSuccess?: boolean;
  extra?: ReactNode;
  className?: string;
  hideActions?: boolean;
  /** ask before submitting */
  confirm?: string;
}) {
  const [state, run, isPending] = useActionState(action, { ok: false } as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state.n, state.ok, resetOnSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (isPending) return;
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
    >
      {children}
      {state.error && (
        <div className="alert error" role="alert" style={{ marginTop: 14 }}>
          {state.error}
        </div>
      )}
      {state.ok && state.message && (
        <div className="alert success" role="status" style={{ marginTop: 14, flexDirection: 'column', gap: 0 }}>
          <span>{state.message}</span>
          {state.secret && <SecretBox label={state.secret.label} value={state.secret.value} />}
        </div>
      )}
      {!hideActions && (
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className={submitClass} type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending && <span className="spinner" aria-hidden="true" />}
            {isPending ? pending : submit}
          </button>
          {extra}
        </div>
      )}
    </form>
  );
}
