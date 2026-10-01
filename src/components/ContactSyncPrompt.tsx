import React, { useRef, useState } from 'react';
import { useAppStore } from '../store';
import { ConfirmDialog } from './ConfirmDialog';
import { syncContactToCustomer, applyContactSync, ContactSyncPrompt } from '../lib/contactSync';

// Contact sync for the New Enquiry / Quote / Order forms. run() is called
// after the record is saved; when the change needs the user's OK (see
// syncContactToCustomer) it shows the in-app "Add contact …? [Add] [Skip]" /
// "Update …'s phone from X to Y? [Update] [Skip]" box and resolves only once
// the user has answered, so the form can navigate away afterwards. Returns the
// "all 3 slots are full" message when there is one, else null.
// Render `dialog` somewhere in the page.
export function useContactSyncPrompt() {
  const { data, refreshData } = useAppStore();
  const [prompt, setPrompt] = useState<ContactSyncPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<(() => void) | null>(null);
  // Questions already answered on this page (Save, then Generate PDF, …) —
  // never asked twice.
  const answered = useRef<Set<string>>(new Set());

  const run = async (custName: string, contact: string, phone: string, email: string): Promise<string | null> => {
    const r = await syncContactToCustomer(custName, contact, phone, email, data.customers);
    if (r.action === 'full') return r.message;
    if (r.action === 'ask') {
      const key = `${r.prompt.customerId}|${JSON.stringify(r.prompt.patch)}`;
      if (answered.current.has(key)) return null;
      answered.current.add(key);
      await new Promise<void>(resolve => { resolver.current = resolve; setPrompt(r.prompt); });
    }
    return null;
  };

  const close = () => {
    setPrompt(null);
    resolver.current?.();
    resolver.current = null;
  };

  const confirm = async () => {
    if (!prompt) return;
    setBusy(true);
    try {
      await applyContactSync(prompt);
      await refreshData();
    } catch (e) {
      console.error('Contact sync failed:', e);
    } finally {
      setBusy(false);
      close();
    }
  };

  const dialog = prompt ? (
    <ConfirmDialog
      title={prompt.title}
      confirmLabel={prompt.kind === 'add' ? 'Add' : 'Update'}
      cancelLabel="Skip"
      busy={busy}
      onConfirm={confirm}
      onCancel={close}
    >
      {prompt.detail}
    </ConfirmDialog>
  ) : null;

  return { run, dialog };
}
