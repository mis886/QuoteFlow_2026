// Gmail API via Google Identity Services (browser OAuth2 – no backend needed)
// Requires VITE_GOOGLE_CLIENT_ID + VITE_GOOGLE_CLIENT_SECRET in Cloudflare Pages env vars.
// VITE_GOOGLE_CLIENT_SECRET is exposed in the JS bundle; acceptable for an internal-only tool.

import { supabase } from './supabase';

const SCOPES_SYNC = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

const SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send';

declare global {
  interface Window { google: any; }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ── Per-user in-memory access token cache ────────────────────────────────────
// Keyed by lowercase email. Cleared on page refresh; DB refresh tokens persist.
const _userTokenCache = new Map<string, { token: string; expiry: number }>();

export function hasActiveToken(email?: string): boolean {
  if (email) {
    const c = _userTokenCache.get(email.toLowerCase());
    return !!c && Date.now() < c.expiry;
  }
  // Legacy: check any cached token (used by the sync status indicator)
  for (const c of _userTokenCache.values()) {
    if (Date.now() < c.expiry) return true;
  }
  return false;
}

function cacheUserToken(email: string, token: string, expiresIn: number) {
  _userTokenCache.set(email.toLowerCase(), { token, expiry: Date.now() + expiresIn * 1000 - 60_000 });
}

// ── Token exchange helpers (call Google's token endpoint from browser) ────────
async function exchangeCodeForTokens(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string;
  if (!clientSecret) throw new Error('VITE_GOOGLE_CLIENT_SECRET is not configured. Add it to Cloudflare Pages environment variables.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: 'postmessage', grant_type: 'authorization_code' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? `Token exchange failed ${res.status}`);
  return data;
}

async function exchangeRefreshToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string;
  if (!clientSecret) throw new Error('VITE_GOOGLE_CLIENT_SECRET is not configured.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? `Token refresh failed ${res.status}`);
  return data;
}

// ── Per-user access token: DB refresh token → in-memory access token ─────────
// Flow: in-memory cache → DB refresh token → full OAuth code flow (popup once).
export async function getAccessTokenForUser(userEmail: string): Promise<string> {
  const emailKey = userEmail.toLowerCase();

  // 1. In-memory cache
  const cached = _userTokenCache.get(emailKey);
  if (cached && Date.now() < cached.expiry) return cached.token;

  // 2. Check team_roster for a stored refresh token
  const { data: row } = await supabase
    .from('team_roster')
    .select('gmail_refresh_token')
    .eq('email', emailKey)
    .maybeSingle();

  if (row?.gmail_refresh_token) {
    try {
      const tokens = await exchangeRefreshToken(row.gmail_refresh_token);
      cacheUserToken(emailKey, tokens.access_token, tokens.expires_in);
      return tokens.access_token;
    } catch {
      // Refresh token revoked — fall through to full OAuth flow
      await supabase.from('team_roster').update({ gmail_refresh_token: null }).eq('email', emailKey);
    }
  }

  // 3. Full OAuth code flow — shows consent popup once, then stores refresh token
  await loadScript('https://accounts.google.com/gsi/client');
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not configured.');

  const authCode = await new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: SCOPE_SEND,
      ux_mode: 'popup',
      login_hint: userEmail,
      access_type: 'offline',
      prompt: 'consent',
      callback: (resp: any) => {
        if (resp.error) { reject(new Error(resp.error_description ?? resp.error)); return; }
        resolve(resp.code as string);
      },
    });
    client.requestCode();
  });

  const tokens = await exchangeCodeForTokens(authCode);

  // Persist refresh token so future sessions skip the popup
  if (tokens.refresh_token) {
    await supabase.from('team_roster').update({ gmail_refresh_token: tokens.refresh_token }).eq('email', emailKey);
  }

  cacheUserToken(emailKey, tokens.access_token, tokens.expires_in);
  return tokens.access_token;
}

// ── Legacy shared-account token (used by Gmail sync / enquiry reader) ─────────
// Kept separate so the reading flow (info@/mis@ account) is unaffected.
let _sharedToken: string | null = null;
let _sharedTokenExpiry = 0;

async function getAccessToken(silent = false): Promise<string> {
  if (_sharedToken && Date.now() < _sharedTokenExpiry) return _sharedToken;

  await loadScript('https://accounts.google.com/gsi/client');
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  if (!clientId) throw new Error('Email feature requires Google OAuth configuration. Please contact your administrator (VITE_GOOGLE_CLIENT_ID must be set in Cloudflare Pages environment variables).');

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES_SYNC,
      callback: (resp: any) => {
        if (resp.error) { reject(new Error(resp.error_description ?? resp.error)); return; }
        _sharedToken = resp.access_token as string;
        _sharedTokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000;
        resolve(_sharedToken);
      },
    });
    client.requestAccessToken({ prompt: silent ? 'none' : '' });
  });
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Send ──────────────────────────────────────────────────────────────────────

export interface Attachment {
  base64: string;
  fileName: string;
  mimeType: string;
}

function buildHtmlBody(plainBody: string, poLink?: string): string {
  const escapedBody = plainBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const poBox = poLink ? `
    <div style="margin:24px 0;">
      <a href="${poLink}" target="_blank" style="display:inline-block;text-decoration:none;">
        <div style="width:264px;height:96px;border:2px dashed #c0392b;border-radius:6px;
                    display:flex;flex-direction:column;align-items:center;justify-content:center;
                    background:#fff8f8;font-family:Arial,sans-serif;cursor:pointer;padding:8px;
                    box-sizing:border-box;">
          <div style="font-size:28px;color:#c0392b;line-height:1;">&#8679;</div>
          <div style="font-size:11px;font-weight:700;color:#c0392b;letter-spacing:0.5px;
                      margin-top:4px;text-align:center;">SUBMIT PURCHASE ORDER</div>
          <div style="font-size:10px;color:#888;margin-top:3px;">Click to upload your PO</div>
        </div>
      </a>
    </div>` : '';

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:13px;color:#222;line-height:1.6;">
<p>${escapedBody}</p>${poBox}
</body></html>`;
}

function buildMimeMessage(opts: {
  to: string; cc: string; subject: string; body: string;
  attachments: Attachment[]; poLink?: string;
}): string {
  const { to, cc, subject, body, attachments, poLink } = opts;
  const outerBoundary = `mrt_${Date.now()}`;
  const altBoundary = `alt_${Date.now() + 1}`;
  const nl = '\r\n';

  const headers = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    `Subject: =?UTF-8?B?${utf8ToBase64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
  ].filter(Boolean).join(nl);

  const altPart = [
    `--${outerBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(body),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(buildHtmlBody(body, poLink)),
    '',
    `--${altBoundary}--`,
  ].join(nl);

  const attachParts = attachments.map(a => [
    `--${outerBoundary}`,
    `Content-Type: ${a.mimeType}; name="${a.fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${a.fileName}"`,
    '',
    a.base64,
  ].join(nl)).join(nl);

  const raw = `${headers}${nl}${nl}${altPart}${nl}${attachParts}${nl}--${outerBoundary}--`;
  return utf8ToBase64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface GmailSendPayload {
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: Attachment[];
  poLink?: string;
}

export async function sendViaGmail(payload: GmailSendPayload): Promise<void> {
  const accessToken = await getAccessToken();
  const raw = buildMimeMessage(payload);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Gmail API error ${res.status}`);
  }
}

// Per-user send: uses the sender's own OAuth token stored in team_roster.
// On first use shows a one-time Google consent popup; all subsequent sends are silent.
export async function sendViaGmailAsUser(payload: GmailSendPayload, senderEmail: string): Promise<void> {
  if (!senderEmail) throw new Error('Sender email is required to send email.');
  const accessToken = await getAccessTokenForUser(senderEmail);
  const raw = buildMimeMessage(payload);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Gmail API error ${res.status}`);
  }
}

// ── Read / Sync ───────────────────────────────────────────────────────────────

export interface ParsedEmail {
  messageId: string;
  from: string;
  fromEmail: string;
  subject: string;
  body: string;
  date: string;
  payload: any;
}

async function gmailGet(path: string, token: string) {
  const res = await fetch(`https://gmail.googleapis.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${path}`);
  return res.json();
}

function parseHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBase64Url(str: string): string {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try { return decodeURIComponent(escape(atob(b64))); } catch { return atob(b64); }
}

function extractBody(payload: any): string {
  // Recursively find the first text/plain part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return '';
}

function parseFromHeader(from: string): { name: string; email: string } {
  const m = from.match(/^(.*?)\s*<([^>]+)>/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() };
  return { name: from.trim(), email: from.trim() };
}

export interface EmailAttachment {
  fileName: string;
  mimeType: string;
  blob: Blob;
}

function collectAttachmentParts(payload: any): { partId: string; fileName: string; mimeType: string; attachmentId: string }[] {
  const results: { partId: string; fileName: string; mimeType: string; attachmentId: string }[] = [];
  if (payload.filename && payload.body?.attachmentId) {
    results.push({
      partId: payload.partId ?? '',
      fileName: payload.filename,
      mimeType: payload.mimeType ?? 'application/octet-stream',
      attachmentId: payload.body.attachmentId,
    });
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      results.push(...collectAttachmentParts(part));
    }
  }
  return results;
}

export async function fetchEmailAttachments(messageId: string, payload: any, silent = false): Promise<EmailAttachment[]> {
  const parts = collectAttachmentParts(payload);
  if (!parts.length) return [];

  const token = await getAccessToken(silent);
  const attachments: EmailAttachment[] = [];

  for (const part of parts) {
    try {
      const res = await gmailGet(
        `/gmail/v1/users/me/messages/${messageId}/attachments/${part.attachmentId}`,
        token,
      );
      const b64 = (res.data as string).replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      attachments.push({
        fileName: part.fileName,
        mimeType: part.mimeType,
        blob: new Blob([bytes], { type: part.mimeType }),
      });
    } catch {
      // skip attachment if it fails
    }
  }

  return attachments;
}

export async function fetchLabelledEmails(
  labelNames: string[],
  since?: string | null,
  silent = false,
): Promise<ParsedEmail[]> {
  if (!labelNames.length) return [];
  const token = await getAccessToken(silent);

  // Resolve label names → IDs
  const labelsRes = await gmailGet('/gmail/v1/users/me/labels', token);
  const allLabels: { id: string; name: string }[] = labelsRes.labels ?? [];
  const labelIds = labelNames
    .map(n => allLabels.find(l => l.name.toLowerCase() === n.toLowerCase())?.id)
    .filter(Boolean) as string[];

  if (!labelIds.length) return [];

  // Build query: one request per label, merge results
  const afterClause = since
    ? `after:${Math.floor(new Date(since).getTime() / 1000)}`
    : '';

  const messageIdSet = new Set<string>();
  for (const labelId of labelIds) {
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams({ labelIds: labelId, maxResults: '50' });
      if (afterClause) qs.set('q', afterClause);
      if (pageToken) qs.set('pageToken', pageToken);
      const listRes = await gmailGet(`/gmail/v1/users/me/messages?${qs}`, token);
      (listRes.messages ?? []).forEach((m: { id: string }) => messageIdSet.add(m.id));
      pageToken = listRes.nextPageToken;
    } while (pageToken);
  }

  const emails: ParsedEmail[] = [];
  for (const id of messageIdSet) {
    try {
      const msg = await gmailGet(`/gmail/v1/users/me/messages/${id}?format=full`, token);
      const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
      const fromRaw = parseHeader(headers, 'From');
      const { name, email } = parseFromHeader(fromRaw);
      emails.push({
        messageId: id,
        from: name || email,
        fromEmail: email,
        subject: parseHeader(headers, 'Subject'),
        body: extractBody(msg.payload).slice(0, 1000),
        date: parseHeader(headers, 'Date') || new Date().toISOString(),
        payload: msg.payload,
      });
    } catch {
      // skip malformed messages
    }
  }

  return emails;
}
