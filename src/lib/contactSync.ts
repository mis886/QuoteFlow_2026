import { supabase } from './supabase';
import type { Customer } from './types';

export type ContactSyncResult =
  | { action: 'none' }
  | { action: 'updated' }
  | { action: 'full'; message: string };

/**
 * After saving a transaction, silently sync the contact details back to the
 * customer profile.  Four cases:
 *   none    — values are already in the profile (unchanged), skip
 *   updated — name matched a slot (update phone/email) OR empty slot filled
 *   full    — no name match and all 3 slots occupied; caller shows a message
 *
 * The function patches only the specific contact columns via a direct Supabase
 * update so that site/address columns are never accidentally overwritten.
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

  const customer = customers.find(c => c.name === custName);
  if (!customer) return { action: 'none' };

  const contacts = customer.sites?.[0]?.contacts ?? [];
  const c1 = contacts.find(c => c.id === 'C1') ?? null;
  const c2 = contacts.find(c => c.id === 'C2') ?? null;
  const c3 = contacts.find(c => c.id === 'C3') ?? null;

  // Case 4 — exact match in any slot means nothing changed, skip silently
  const unchanged = [c1, c2, c3].some(c =>
    c &&
    (c.name  ?? '') === name &&
    (c.phone ?? '') === ph   &&
    (c.email ?? '') === em
  );
  if (unchanged) return { action: 'none' };

  // Case 1 — name match in any slot: update only phone + email for that slot
  if (name) {
    if (c1 && c1.name === name) {
      await supabase.from('customers')
        .update({ primary_contact_phone: ph || null, primary_contact_email: em || null })
        .eq('customer_id', customer.id);
      return { action: 'updated' };
    }
    if (c2 && c2.name === name) {
      await supabase.from('customers')
        .update({ contact2_phone: ph || null, contact2_email: em || null })
        .eq('customer_id', customer.id);
      return { action: 'updated' };
    }
    if (c3 && c3.name === name) {
      await supabase.from('customers')
        .update({ contact3_phone: ph || null, contact3_email: em || null })
        .eq('customer_id', customer.id);
      return { action: 'updated' };
    }
  }

  // Case 2 — no name match: fill next empty slot (C2 first, then C3)
  // Never fill C1 automatically — primary contact is managed from Customers module.
  const c2Empty = !c2 || (!c2.name && !c2.email);
  if (c2Empty) {
    await supabase.from('customers')
      .update({ contact2_name: name || null, contact2_phone: ph || null, contact2_email: em || null })
      .eq('customer_id', customer.id);
    return { action: 'updated' };
  }

  const c3Empty = !c3 || (!c3.name && !c3.email);
  if (c3Empty) {
    await supabase.from('customers')
      .update({ contact3_name: name || null, contact3_phone: ph || null, contact3_email: em || null })
      .eq('customer_id', customer.id);
    return { action: 'updated' };
  }

  // Case 3 — all 3 slots full, cannot save
  return {
    action: 'full',
    message: 'New contact could not be saved to customer profile — all 3 slots are full. Please update manually in the Customers module.',
  };
}
