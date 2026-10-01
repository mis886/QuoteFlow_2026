import { supabase } from './supabase';
import type { Customer } from './types';
import { findCustomerByName, isLead, last10Digits } from './utils';

// A change to a customer's contacts that must be confirmed by the user before
// it is written (see ContactSyncPrompt.tsx for the in-app box).
export interface ContactSyncPrompt {
  kind: 'add' | 'update';
  customerId: string;
  customerName: string;
  title: string;
  detail: string;
  patch: Record<string, string | null>;   // contact columns only
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

async function writePatch(customerId: string, patch: Record<string, string | null>) {
  const { error } = await supabase.from('customers').update(patch).eq('customer_id', customerId);
  if (error) throw error;
}

/** Writes a change the user confirmed ([Add] / [Update]). */
export async function applyContactSync(prompt: ContactSyncPrompt): Promise<void> {
  await writePatch(prompt.customerId, prompt.patch);
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
 *   full    — no name match and all 3 slots occupied; caller shows a message
 */
export async function syncContactToCustomer(
  custName: string,
  contact: string,
  phone: string,
  email: string,
  customers: Customer[],
): Promise<ContactSyncResult> {
  const name = contact.trim();
  const ph   = phone.trim();
  const em   = email.trim();

  if (!name && !ph && !em) return { action: 'none' };

  const customer = findCustomerByName(custName, customers);
  if (!customer) return { action: 'none' };
  const lead = isLead(customer);

  const contacts = customer.sites?.[0]?.contacts ?? [];
  const slots = [
    { c: contacts.find(c => c.id === 'C1') ?? null, col: 'primary_contact' },
    { c: contacts.find(c => c.id === 'C2') ?? null, col: 'contact2' },
    { c: contacts.find(c => c.id === 'C3') ?? null, col: 'contact3' },
  ];

  // Case 1 — name match in any slot: only phone / email that actually differ.
  // A blank value on the transaction never clears what the profile has.
  const match = name ? slots.find(s => s.c && (s.c.name ?? '').trim().toLowerCase() === name.toLowerCase()) : undefined;
  if (match?.c) {
    const oldPh = match.c.phone ?? '';
    const oldEm = match.c.email ?? '';
    const patch: Record<string, string | null> = {};
    const parts: string[] = [];
    let overwrites = false;
    if (ph && !samePhone(oldPh, ph)) {
      patch[`${match.col}_phone`] = ph;
      parts.push(oldPh.trim() ? `phone from ${oldPh.trim()} to ${ph}` : `phone to ${ph}`);
      if (oldPh.trim()) overwrites = true;
    }
    if (em && !sameEmail(oldEm, em)) {
      patch[`${match.col}_email`] = em;
      parts.push(oldEm.trim() ? `email from ${oldEm.trim()} to ${em}` : `email to ${em}`);
      if (oldEm.trim()) overwrites = true;
    }
    if (parts.length === 0) return { action: 'none' };
    if (lead && !overwrites) {
      await writePatch(customer.id, patch);
      return { action: 'updated' };
    }
    return {
      action: 'ask',
      prompt: {
        kind: 'update', customerId: customer.id, customerName: customer.name, patch,
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

  // Case 2 — no name match: next empty slot (C2 first, then C3).
  // Never fill C1 automatically — primary contact is managed from Customers module.
  const empty = slots.slice(1).find(s => !s.c || (!s.c.name && !s.c.email));
  if (empty) {
    const patch = {
      [`${empty.col}_name`]: name || null,
      [`${empty.col}_phone`]: ph || null,
      [`${empty.col}_email`]: em || null,
    };
    if (lead) {
      await writePatch(customer.id, patch);
      return { action: 'updated' };
    }
    return {
      action: 'ask',
      prompt: {
        kind: 'add', customerId: customer.id, customerName: customer.name, patch,
        title: `Add contact to ${customer.name}?`,
        detail: `Add contact ${[name, ph, em].filter(Boolean).join(', ')} to ${customer.name}?`,
      },
    };
  }

  // Case 3 — all 3 slots full, cannot save
  return {
    action: 'full',
    message: 'New contact could not be saved to customer profile — all 3 slots are full. Please update manually in the Customers module.',
  };
}
