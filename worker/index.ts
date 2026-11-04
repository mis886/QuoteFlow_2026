// ─────────────────────────────────────────────────────────────────────────────
// EnqBoss server worker
//
// 1. Serves the website exactly as before (everything goes to ./dist).
// 2. DAILY SALES ACTIVITY REPORT: every Mon–Sat at 7 PM IST (cron in
//    wrangler.toml) it reads today's enquiries / quotations / orders / samples
//    from Supabase and emails a table report to the MD from mis@ Gmail.
//
// Gmail: uses mis@'s saved refresh token (team_roster.gmail_refresh_token —
// the same one the app saves when mis@ sends an email from EnqBoss).
//
// Secrets needed in Cloudflare → Worker → Settings → Variables and Secrets
// (all type "Secret"):
//   SUPABASE_SERVICE_KEY  – Supabase service_role key
//   GOOGLE_CLIENT_ID      – same value as VITE_GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET  – same value as VITE_GOOGLE_CLIENT_SECRET
//   REPORT_KEY            – any password you choose, for the manual test link
//
// Manual test / preview link (send nothing, just show):
//   /api/daily-report?key=REPORT_KEY&preview=1&date=2026-11-02
// Manual send to someone (e.g. yourself):
//   /api/daily-report?key=REPORT_KEY&to=mis@himalayaterpene.com&date=2026-11-02
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://nheujyknkqeimgpdfyiw.supabase.co';
const SENDER_EMAIL = 'mis@himalayaterpene.com';     // mail goes out from this Gmail
const MD_EMAIL = 'pc@himalayaterpene.com';           // TEST: report goes to pc@ only (change back to shishir@ after testing)
const CC_EMAIL = '';                                // e.g. 'mis@himalayaterpene.com'
const TZ = 'Asia/Kolkata';

export default {
  // Normal website traffic
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/daily-report') {
      if (!env.REPORT_KEY || url.searchParams.get('key') !== env.REPORT_KEY) {
        return new Response('Not allowed', { status: 403 });
      }
      try {
        const date = url.searchParams.get('date') || todayIST();
        const report = await buildReport(env, date);
        if (url.searchParams.get('preview')) {
          return new Response(`<p><b>Subject:</b> ${report.subject}</p><hr>${report.html}`, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        const to = url.searchParams.get('to') || MD_EMAIL;
        await sendGmail(env, to, '', report.subject, report.html);
        return new Response(`Sent "${report.subject}" to ${to}`);
      } catch (e: any) {
        return new Response('Error: ' + (e?.message || e), { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  },

  // Runs on the cron schedule in wrangler.toml (7 PM IST, Mon–Sat)
  async scheduled(_event: any, env: any, ctx: any) {
    ctx.waitUntil((async () => {
      const report = await buildReport(env, todayIST());
      await sendGmail(env, MD_EMAIL, CC_EMAIL, report.subject, report.html);
      console.log('Daily report sent:', report.subject);
    })());
  },
};

// ─── Dates (India time) ─────────────────────────────────────────────────────

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // yyyy-mm-dd
}
function istDate(ts: string | null): string {
  return ts ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts)) : '';
}
function fmt(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(new Date(dateStr + 'T12:00:00+05:30'));
}

// ─── Supabase ───────────────────────────────────────────────────────────────

async function sb(env: any, path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbCount(env: any, path: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}&limit=1`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  const range = res.headers.get('content-range') || '0/0'; // "0-0/40"
  return Number(range.split('/')[1]) || 0;
}

// ─── Build the report ───────────────────────────────────────────────────────

async function buildReport(env: any, dateStr: string): Promise<{ subject: string; html: string }> {
  const start = new Date(dateStr + 'T00:00:00+05:30');
  const end = new Date(start.getTime() + 86400000);
  const day = `&created_at=gte.${encodeURIComponent(start.toISOString())}&created_at=lt.${encodeURIComponent(end.toISOString())}&order=id.asc`;

  const [enquiries, quotes, orders, samples, pendingReply] = await Promise.all([
    sb(env, 'enquiries?select=id,cust,src,status,items' + day),
    sb(env, 'quotes?select=id,cust,status,items,sent_at' + day),
    sb(env, 'orders?select=id,cust,value,items' + day),
    sb(env, 'samples?select=id,cust,product_name,status,sent_date,created_at,updated_at,courier_details,tracking_number'),
    sbCount(env, 'enquiries?select=id&status=eq.New'),
  ]);

  const subject = `Daily MIS Update – ${fmt(dateStr, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}`;
  const longDate = fmt(dateStr, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

  let h = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#202124;">';
  h += '<p style="margin:0 0 4px;">Dear Sir,</p>';
  h += `<p style="margin:0 0 18px;">Please find below the sales activity report for ${longDate}.</p>`;

  // 1. ENQUIRIES
  h += heading(`1. ENQUIRIES – ${enquiries.length} new today`);
  if (!enquiries.length) h += grey('No new enquiries today.');
  else {
    h += table(['Enq No.', 'Customer', 'Product', 'Qty', 'Source', 'Status'],
      enquiries.map(e => [esc(e.id), esc(e.cust), esc(products(e.items)), esc(qty(e.items)), esc(e.src || ''), statusCell(e.status)]), []);
    const n = (s: string) => enquiries.filter(e => e.status === s).length;
    h += `<p style="margin:0 0 4px;">Converted to order: <b>${n('Won')}</b> &nbsp;|&nbsp; Lost: <b>${n('Lost')}</b> &nbsp;|&nbsp; Still new: <b>${n('New')}</b></p>`;
  }
  h += `<p style="margin:0 0 20px;">⚠️ Total enquiries still waiting for a reply: <b>${pendingReply}</b></p>`;

  // 2. QUOTATIONS
  h += heading(`2. QUOTATIONS – ${quotes.length} made today`);
  if (!quotes.length) h += grey('No quotations today.');
  else {
    let total = 0;
    const rows = quotes.map(q => {
      const v = quoteValue(q.items);
      total += v;
      return [esc(q.id) + (q.sent_at ? '' : ' <span style="color:#b06000;">(draft)</span>'), esc(q.cust), esc(products(q.items)), rupee(v)];
    });
    h += table(['Quote No.', 'Customer', 'Product', 'Value (incl. GST)'], rows, [3], 'Total quoted today', rupee(total));
  }
  h += '<div style="height:16px;"></div>';

  // 3. ORDERS
  h += heading(`3. ORDERS – ${orders.length} received today`);
  if (!orders.length) h += grey('No orders today.');
  else {
    let total = 0;
    const rows = orders.map(o => {
      total += Number(o.value || 0);
      return [esc(o.id), esc(o.cust), esc(products(o.items)), esc(qty(o.items)), rupee(o.value)];
    });
    h += table(['Order No.', 'Customer', 'Product', 'Qty', 'Value (incl. GST)'], rows, [4], 'Total order value today', rupee(total));
  }
  h += '<div style="height:16px;"></div>';

  // 4. SAMPLING
  const sentToday = samples.filter(s => s.sent_date === dateStr && s.status !== 'pending');
  const resultToday = samples.filter(s => (s.status === 'approved' || s.status === 'rejected') && istDate(s.updated_at) === dateStr);
  const pending = samples.filter(s => s.status === 'pending').sort((a, b) => String(a.sent_date || '').localeCompare(String(b.sent_date || '')));
  const c = (st: string) => samples.filter(s => s.status === st).length;
  const approvedToday = resultToday.filter(s => s.status === 'approved').length;
  const rejectedToday = resultToday.filter(s => s.status === 'rejected').length;

  h += heading('4. SAMPLING');
  h += `<p style="margin:0 0 10px;">Today: <b>${sentToday.length}</b> samples sent, <b>${approvedToday}</b> approved, <b>${rejectedToday}</b> rejected<br>` +
    `Overall status (${samples.length} samples): Dispatched ${c('dispatched')} | Pending ${c('pending')} | Delivered ${c('delivered')} | Approved ${c('approved')} | Rejected ${c('rejected')}</p>`;

  h += `<p style="margin:0 0 6px;font-weight:bold;">✅ Dispatched today (${sentToday.length})</p>`;
  h += sentToday.length
    ? table(['Customer', 'Product', 'Courier / Docket'], sentToday.map(s => [esc(s.cust), esc(s.product_name || ''), esc(`${s.courier_details || ''} ${s.tracking_number || ''}`.trim() || '-')]), [])
    : grey('No samples were dispatched today.');

  h += `<p style="margin:0 0 6px;font-weight:bold;">⏳ Pending – not dispatched yet (${pending.length})</p>`;
  h += pending.length
    ? table(['Customer', 'Product', 'Requested On', 'Days Waiting'], pending.map(s => {
        const from = s.sent_date || istDate(s.created_at);
        const days = Math.round((new Date(dateStr).getTime() - new Date(from).getTime()) / 86400000);
        const d = `${days} days`;
        return [esc(s.cust), esc(s.product_name || ''), fmt(from, { day: '2-digit', month: 'short' }),
          days >= 10 ? `<b style="color:#c5221f;">${d}</b>` : d];
      }), [3])
    : grey('No samples pending.');

  h += '<p style="margin:0 0 6px;font-weight:bold;">👍 Approved / 👎 Rejected today</p>';
  h += resultToday.length
    ? table(['Customer', 'Product', 'Result'], resultToday.map(s => [esc(s.cust), esc(s.product_name || ''),
        s.status === 'approved' ? '<span style="color:#188038;">Approved</span>' : '<span style="color:#c5221f;">Rejected</span>']), [])
    : grey('No sample results came in today.');

  h += '<p style="margin:20px 0 0;">Regards,<br>MIS Team<br>Himalaya Terpenes Pvt Ltd</p></div>';
  return { subject, html: h };
}

// ─── Gmail (send as mis@ using its saved refresh token) ─────────────────────

async function sendGmail(env: any, to: string, cc: string, subject: string, html: string) {
  const rows = await sb(env, `team_roster?select=gmail_refresh_token&email=eq.${encodeURIComponent(SENDER_EMAIL)}`);
  const refreshToken = rows?.[0]?.gmail_refresh_token;
  if (!refreshToken) throw new Error(`${SENDER_EMAIL} has no saved Gmail login. Log in as ${SENDER_EMAIL} in EnqBoss and send any email once.`);

  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const tok: any = await tokRes.json();
  if (!tokRes.ok) throw new Error('Google login failed: ' + (tok.error_description || tok.error));

  const mime = [
    `From: MIS Team <${SENDER_EMAIL}>`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
  ].join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }),
  });
  if (!res.ok) throw new Error(`Gmail send failed ${res.status}: ${await res.text()}`);
}

// UTF-8 safe base64 (needed for ₹, –, emojis)
function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ─── Small helpers ──────────────────────────────────────────────────────────

function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function products(items: any[]): string {
  const names: string[] = [];
  (items || []).forEach(i => {
    const n = String(i.desc || '').trim().replace(/\s+/g, ' ');
    const nice = n.charAt(0).toUpperCase() + n.slice(1);
    if (nice && !names.includes(nice)) names.push(nice);
  });
  return names.join(', ');
}

// "140 × 25 kg, 50 × 30 kg"; 3+ lines → "42 packs (9 lines)"
function qty(items: any[]): string {
  items = items || [];
  if (items.length > 2) {
    const total = items.reduce((s, i) => s + Number(i.qty || 0), 0);
    return `${total} packs (${items.length} lines)`;
  }
  return items.map(i => {
    const p = String(i.packing || '').trim();
    return `${i.qty}${p ? ` × ${p} kg` : ''}`;
  }).join(', ');
}

function quoteValue(items: any[]): number {
  return (items || []).reduce((s, i) => s + Number(i.total || 0) * (1 + Number(i.gst || 0) / 100), 0);
}

// 3451500 → ₹34,51,500
function rupee(n: any): string {
  const s = String(Math.round(Number(n || 0)));
  if (s.length <= 3) return '₹' + s;
  return '₹' + s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
}

function statusCell(st: string): string {
  if (st === 'Won') return '<span style="color:#188038;">Won</span>';
  if (st === 'Lost') return '<span style="color:#c5221f;">Lost</span>';
  return esc(st || '');
}

function heading(t: string): string {
  return `<p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#1a56a8;">${t}</p>`;
}

function grey(t: string): string {
  return `<p style="margin:0 0 12px;color:#5f6368;">${t}</p>`;
}

function table(headers: string[], rows: string[][], right: number[], totalLabel?: string, totalValue?: string): string {
  const th = 'border:1px solid #c7d3e6;text-align:left;';
  const td = 'border:1px solid #d0d7e2;';
  const al = (c: number) => (right.includes(c) ? 'text-align:right;' : '');
  let h = '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;width:100%;margin:0 0 8px;">';
  h += '<tr style="background:#1a56a8;color:#ffffff;">' + headers.map((x, c) => `<th style="${th}${al(c)}">${x}</th>`).join('') + '</tr>';
  rows.forEach((r, i) => {
    h += `<tr${i % 2 ? ' style="background:#f6f8fb;"' : ''}>` + r.map((x, c) => `<td style="${td}${al(c)}">${x}</td>`).join('') + '</tr>';
  });
  if (totalLabel) {
    h += `<tr style="background:#e8eef8;font-weight:bold;"><td style="${td}" colspan="${headers.length - 1}">${totalLabel}</td><td style="${td}text-align:right;">${totalValue}</td></tr>`;
  }
  return h + '</table>';
}
