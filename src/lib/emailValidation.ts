// 2026-11-16: ONE email address per box — shared by the Customer form
// (NewCustomer.tsx) and the Email to Client popup (SendEmailModal.tsx).
//
// Why: a contact email "mayur.patil@mitsuboshi.comsanket.chavan@mitsuboshi.com"
// (two addresses stuck together) was saved, auto-ticked in CC, and Gmail
// rejected the whole email with "Invalid Cc header".

// local-part @ domain with at least one dot, letters-only ending (com, in, co.in…).
// No spaces, commas, semicolons, < > or a second "@".
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/** True when `value` is exactly one valid email address (surrounding spaces ignored). */
export function isValidEmail(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  return v.length > 0 && v.length <= 254 && EMAIL_RE.test(v) && !v.includes('..');
}

/** Why a typed email is not OK, or null when it is fine (a blank box is fine). */
export function emailProblem(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  if ((v.match(/@/g) ?? []).length > 1 || /[\s,;]/.test(v)) {
    return 'Only one email per box — use "+ Add Email" for another address.';
  }
  return isValidEmail(v) ? null : 'Not a valid email address (e.g. name@company.com).';
}

/** Lower-cased, trimmed — for duplicate checks. */
export const emailKey = (value: string) => value.trim().toLowerCase();
