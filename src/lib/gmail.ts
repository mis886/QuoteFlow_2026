// Gmail API via Google Identity Services (browser OAuth2 – no backend needed)
// Requires VITE_GOOGLE_CLIENT_ID in .env and Gmail API enabled in Google Cloud Console.

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

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

// Cached token so we don't re-prompt on every send/sync
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

export function hasActiveToken(): boolean {
  return !!_cachedToken && Date.now() < _tokenExpiry;
}

async function getAccessToken(silent = false): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  await loadScript('https://accounts.google.com/gsi/client');
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set in .env');

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      login_hint: 'info@himalayaterpene.com',
      callback: (resp: any) => {
        if (resp.error) { reject(new Error(resp.error_description ?? resp.error)); return; }
        _cachedToken = resp.access_token as string;
        _tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000;
        resolve(_cachedToken);
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
