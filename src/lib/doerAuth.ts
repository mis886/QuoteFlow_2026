// Practical (not server-verified) doer identity helpers.
//
// After the Google login, a person picks which doer they are and optionally
// enters a password. The password is hashed here with SHA-256 (Web Crypto) and
// compared to the hash stored on their team_roster row. This is an internal
// honor-tier gate for correct attribution + casual-misuse deterrence — it is
// NOT resistant to a determined user with devtools. Move verification to a
// Supabase Edge Function if real security is ever required.

import type { TeamMember } from './types';

// SHA-256 → lowercase hex.
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hasPassword(member: Pick<TeamMember, 'password_hash'>): boolean {
  return !!member.password_hash && member.password_hash.length > 0;
}

// True when the doer requires no password, or the supplied password matches.
export async function verifyDoerPassword(
  member: Pick<TeamMember, 'password_hash'>,
  password: string,
): Promise<boolean> {
  if (!hasPassword(member)) return true;
  return (await sha256(password)) === member.password_hash;
}
