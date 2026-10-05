import { supabase } from './supabase';
import type { Customer } from './types';
import { customerOfDoc, isLead, last10Digits, CONTACT_SLOTS, MAX_CONTACTS } from './utils';
import { logActivity } from './activityLog';

// A change to a customer's contacts that must be confirmed by the user before
// it is written (see ContactSyncPrompt.tsx for the in-app box).
export interface ContactSyncPrompt {
  kind: 'add' | 'update';
  customerId: string;
  customerName: string;
  title: string;
  detail: string;
  patch: Record<string, any>;             // contact columns only
  log: ContactChangeLog;                  // what the History Log will show
}

// History Log entry for a contact change: an 'update' on the customer / lead
// whose old → new rows read e.g. "contact Ramesh phone: 98… → 99…" or
// "contact added: — → Ramesh, 98…, r@x.com", plus the page it came from.
interface ContactChangeLog {
  before: Record<string, string | null>;
  after: Record<string, string | null>;
}

// Never awaited and never throws (logActivity console.errors its own
// failures) — a logging problem must not block the save.
function logContactChange(customer: { id: string; name: string }, log: ContactChangeLog, source?: string) {
  logActivity({
    module: 'customers',
    recordId: customer.id,
    recordLabel: customer.name,
    action: 'update',
    before: log.before,
    after: source ? { ...log.after, 'source page': source } : log.after,
  });
}

export type ContactSyncResult =
  | { action: 'none' }
  | { action: 'updated' }
  | { action: 'ask'; prompt: ContactSyncPrompt }
  | { action: 'full'; message: string };

const samePhone = (a: string, b: string) => {
  const da = last10Digits(a), db = last10Digits(b);
  return da && db ? da === db : a.trim() === b.trim();
};
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function writePatch(customerId: string, patch: Record<string, any>) {
  const { error } = await supabase.from('customers').update(patch).eq('customer_id', customerId);
  if (error) throw error;
}

/**
 * Writes a change the user confirmed ([Add] / [Update]) and records it in the
 * History Log. `source` = the page it came from, e.g. "Enquiry ENQ-2026-012".
 * [Skip] never gets here, so it logs nothing.
 */
export async function applyContactSync(prompt: ContactSyncPrompt, source?: string): Promise<void> {
  await writePatch(prompt.customerId, prompt.patch);
  logContactChange({ id: prompt.customerId, name: prompt.customerName }, prompt.log, source);
}

/**
 * After saving a transaction, sync the contact details back to the customer
 * profile. Only ever touches contact columns — never address, GSTIN, terms,
 * tier or customer_status.
 *   none    — the contact is already on the profile, skip
 *   updated — written silently. LEADS only, and only when nothing existing is
 *             overwritten (a new contact, or a blank phone/email filled in)
 *   ask     — nothing written; the caller shows "Add contact …?" /
 *             "Update …'s phone from X to Y?" and calls applyContactSync() on
 *             yes. Always for a CUSTOMER, and for a lead when an existing
 *             phone/email would be replaced
 *   full    — no name match and all 5 slots occupied; caller shows a message
 */
export async function syncContactToCustomer(
  custName: string,
  contact: string,
  phone: string,
  email: string,
  customers: Customer[],
  source?: string,   // page it came from ("Enquiry ENQ-…") — for the History Log
  doc: { customerId?: string } = {},   // the document's customer_id
): Promise<ContactSyncResult> {
  const name = contact.trim();
  const ph   = phone.trim();
  const em   = email.trim();

  if (!name && !ph && !em) return { action: 'none' };

  // customer_id first, company name only as the fallback.
  const customer = customerOfDoc({ cust: custName, customerId: doc.customerId }, customers);
  if (!customer) return { action: 'none' };
  const lead = isLead(customer);

  const contacts = customer.sites?.[0]?.contacts ?? [];
  // The 5 contact slots (C1 = primary_contact … C5 = contact5).
  const slots = CONTACT_SLOTS.map((col, i) => ({ c: contacts.find(c => c.id === `C${i + 1}`) ?? null, col }));

  // Case 1 — name match in any slot: only phone / email that actually differ.
  // A blank value on the transaction never clears what the profile has.
  const match = name ? slots.find(s => s.c && (s.c.name ?? '').trim().toLowerCase() === name.toLowerCase()) : undefined;
  if (match?.c) {
    const oldPh = match.c.phone ?? '';
    const oldEm = match.c.email ?? '';
    const patch: Record<string, string | null> = {};
    const parts: string[] = [];
    const log: ContactChangeLog = { before: {}, after: {} };
    let overwrites = false;
    if (ph && !samePhone(oldPh, ph)) {
      log.before[`contact ${match.c.name} phone`] = oldPh.trim() || null;
      log.after[`contact ${match.c.name} phone`] = ph;
      patch[`${match.col}_phone`] = ph;
      parts.push(oldPh.trim() ? `phone from ${oldPh.trim()} to ${ph}` : `phone to ${ph}`);
      if (oldPh.trim()) overwrites = true;
    }
    if (em && !sameEmail(oldEm, em)) {
      log.before[`contact ${match.c.name} email`] = oldEm.trim() || null;
      log.after[`contact ${match.c.name} email`] = em;
      patch[`${match.col}_email`] = em;
      parts.push(oldEm.trim() ? `email from ${oldEm.trim()} to ${em}` : `email to ${em}`);
      if (oldEm.trim()) overwrites = true;
    }
    if (parts.length === 0) return { action: 'none' };
    if (lead && !overwrites) {
      await writePatch(customer.id, patch);
      logContactChange(customer, log, source);
      return { action: 'updated' };
    }
    return {
      action: 'ask',
      prompt: {
        kind: 'update', customerId: customer.id, customerName: customer.name, patch, log,
        title: `Update contact on ${customer.name}?`,
        detail: `Update ${match.c.name}'s ${parts.join(' and ')}?`,
      },
    };
  }

  // No contact name typed, and the phone / email given are already on the
  // profile — nothing new to add.
  if (!name) {
    const known = slots.filter(s => s.c).map(s => s.c!);
    const phKnown = !ph || known.some(c => samePhone(c.phone ?? '', ph));
    const emKnown = !em || known.some(c => sameEmail(c.email ?? '', em));
    if (phKnown && emKnown) return { action: 'none' };
  }

  // Case 2 — no name match: next empty slot (C2, C3, C4, then C5).
  // Never fill C1 automatically — primary contact is managed from Customers module.
  const empty = slots.slice(1).find(s => !s.c || (!s.c.name && !s.c.email && !s.c.phone));
  if (empty) {
    const patch = {
      [`${empty.col}_name`]: name || null,
      [`${empty.col}_phone`]: ph || null,
      [`${empty.col}_email`]: em || null,
    };
    const log: ContactChangeLog = {
      before: { 'contact added': null },
      after: { 'contact added': [name, ph, em].filter(Boolean).join(', ') },
    };
    if (lead) {
      await writePatch(customer.id, patch);
      logContactChange(customer, log, source);
      return { action: 'updated' };
    }
    return {
      action: 'ask',
      prompt: {
        kind: 'add', customerId: customer.id, customerName: customer.name, patch, log,
        title: `Add contact to ${customer.name}?`,
        detail: `Add contact ${[name, ph, em].filter(Boolean).join(', ')} to ${customer.name}?`,
      },
    };
  }

  // Case 3 — all 5 slots full, cannot save
  return {
    action: 'full',
    message: `New contact could not be saved to customer profile — all ${MAX_CONTACTS} slots are full. Please update manually in the Customers module.`,
  };
}
