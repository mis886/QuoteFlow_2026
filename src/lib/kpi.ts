// Doer KPI — pure aggregation over the data already collected in the pipeline.
//
// The on-time / TAT math here is the SAME logic that drives the FollowUps score
// bar (buildFullChain / stepDeadline / cardOnTimeRate), lifted out of the page
// component so both the page and the KPI dashboard share one source of truth.
// FollowUps.tsx imports these; do not fork the behaviour.

import type {
  AppSettings, DataStore, FollowUp, FollowUpLog, Quote, DoerRole, BoardLane, GlobalDateRangeLike,
} from './types';
import { DEFAULT_STAGE_TAT_H, DEFAULT_STAGE_ROLE } from './types';
import { siteLabel } from './utils';

// ── TAT resolution (mirrors PipelineBoard / FollowUps) ──────────────
// hours → settings.pipeline_tat_h, then legacy pipeline_tat (×24), then default.
export function stageTatHours(settings: AppSettings | null, stage: string): number {
  const h = settings?.pipeline_tat_h?.[stage as never];
  if (h != null) return h as number;
  const d = settings?.pipeline_tat?.[stage as never];
  if (d != null) return (d as number) * 24;
  return DEFAULT_STAGE_TAT_H[stage as never] ?? 48;
}

export function isQuoteSentLog(note: string): boolean {
  return note?.startsWith('Quote sent —') || note?.startsWith('Sent MRT-') || note?.startsWith('Sent ');
}

// Stage sequence a quote passes through — index maps to log position.
const STAGE_SEQUENCE: string[] = [
  'Sent Quotation',      // log[0] — quote sent, TAT clock starts
  'Offer Acknowledged',  // log[1] — 1st touch
  '1st Follow-up',       // log[2]
  '2nd Follow-up',       // log[3]
  'Negotiation',         // log[4]+
];

// Build the full chronological log chain for a quote: a synthetic "Quote Sent"
// entry first (with its TAT deadline as nextDate), then real follow-up logs.
export function buildFullChain(
  settings: AppSettings | null,
  quote: Quote,
  followUp: FollowUp | undefined,
): FollowUpLog[] {
  const total = quote.items.reduce((s, i) => s + i.total, 0);
  const firstItem = quote.items[0]?.desc ?? '';
  const itemCount = quote.items.length;
  const sentNote = `Sent ${quote.id} for ${firstItem}${itemCount > 1 ? ` — ${itemCount} items` : ''}. ₹${total.toLocaleString('en-IN')}.`;
  const realLogs = (followUp?.logs ?? []).filter(l => !isQuoteSentLog(l.note));
  const storedSent = (followUp?.logs ?? []).find(l => isQuoteSentLog(l.note));
  const sentTs = storedSent?.ts ?? (quote.date ? `${quote.date}T09:00:00.000Z` : new Date().toISOString());

  let sentNextDate = storedSent?.nextDate;
  if (!sentNextDate && quote.date) {
    const tatH = stageTatHours(settings, 'Sent Quotation');
    const due = new Date(`${quote.date}T09:00:00.000Z`);
    due.setTime(due.getTime() + tatH * 3600000);
    sentNextDate = due.toISOString().split('T')[0];
  }

  const synthetic: FollowUpLog = {
    ts: sentTs,
    who: storedSent?.who ?? followUp?.owner ?? 'System',
    channel: 'Email',
    note: sentNote,
    nextDate: sentNextDate,
    nextChannel: storedSent?.nextChannel ?? 'Called',
  };
  return [synthetic, ...realLogs];
}

// Deadline for step i: customer-promised nextDate on the previous log wins;
// otherwise prevLog.ts + Settings TAT for that stage.
export function stepDeadline(settings: AppSettings | null, chain: FollowUpLog[], i: number): Date {
  const prev = chain[i - 1];
  if (prev.nextDate) {
    const d = new Date(prev.nextDate);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const stageForPrev = STAGE_SEQUENCE[Math.min(i - 1, STAGE_SEQUENCE.length - 1)];
  const tatH = stageTatHours(settings, stageForPrev);
  return new Date(new Date(prev.ts).getTime() + tatH * 3600000);
}

// On-time per step: was log[i] done by its deadline? Also counts a pending,
// now-overdue next step as LATE.
export function cardOnTimeRate(settings: AppSettings | null, chain: FollowUpLog[]): number | null {
  if (chain.length < 1) return null;
  let onTime = 0, total = 0;
  for (let i = 1; i < chain.length; i++) {
    total++;
    if (new Date(chain[i].ts) <= stepDeadline(settings, chain, i)) onTime++;
  }
  const last = chain[chain.length - 1];
  if (last.nextDate) {
    const nextDue = new Date(last.nextDate);
    nextDue.setHours(23, 59, 59, 999);
    if (nextDue < new Date()) total++;
  }
  return total > 0 ? Math.round(onTime / total * 100) : null;
}

// ── Doer metrics ─────────────────────────────────────────────────────

export interface DueItem {
  kind: 'followup' | 'draft-quote' | 'stale-enquiry';
  refId: string;            // quote id / enquiry id
  cust: string;
  siteId: string | null;    // customer site/branch this item belongs to
  site: string;             // resolved site/branch label (city — branch)
  label: string;            // human description
  dueDate: string | null;   // ISO date the action is due
}

export interface DoerMetrics {
  email: string;
  displayName: string;
  role: DoerRole;
  onTimePct: number | null;   // % of follow-up steps done by deadline (this doer)
  volume: number;             // role-specific throughput count
  avgCycleH: number | null;   // role-specific speed (hours; lower better)
  winRate: number | null;     // role-specific outcome %
  dueNextWeek: DueItem[];
  composite: number | null;   // 0–100 weighted by role (null for unscored roles)
  // Time-lap KPIs (avg hours; lower is better). Surfaced on the doer cards.
  enqLapH: number | null;     // DEO: enquiry received → punched in (recv → created_at)
  quoteLapH: number | null;   // Rate Entry: enquiry punched → quote sent (created_at → sent_at)
  avgLateH: number | null;    // SC_1/Negotiation: avg hours overdue on late steps (null = no late steps)
  lateCount: number;          // SC_1/Negotiation: number of late steps
  // DEO sub-counts (visible on detail card so manager can read enquiries vs orders separately).
  enqCount: number;           // DEO: enquiries entered in period
  orderCount: number;         // DEO: orders converted in period
}

// How each role's composite blends the metrics. Volume & speed are normalized to
// 0–100 within the cohort before blending (see computeDoerMetrics).
interface RoleWeight { onTime?: number; volume?: number; speed?: number; win?: number; }
export const ROLE_WEIGHTS: Record<DoerRole, RoleWeight | null> = {
  'DEO':         { volume: 0.5, speed: 0.5 },
  'Rate Entry':  { speed: 0.5, volume: 0.5 },   // speed = E2Q
  'SC_1':        { onTime: 0.7, volume: 0.3 },
  'Negotiation': { win: 0.7, onTime: 0.3 },
  'PI Sender':   null,                           // scoring deferred
  'Other':       { onTime: 0.5, volume: 0.5 },
};

const MS_DAY = 86400000;
function inRange(iso: string | null | undefined, range: GlobalDateRangeLike | null): boolean {
  if (!iso) return false;
  if (!range) return true;
  const t = new Date(iso).getTime();
  if (range.startDate && t < new Date(range.startDate).getTime()) return false;
  if (range.endDate && t > new Date(range.endDate).getTime() + MS_DAY) return false;
  return true;
}

function lc(s?: string | null): string { return (s ?? '').trim().toLowerCase(); }

// Resolve a person key → set of identities (email + display name + aliases,
// lowercased) so attribution matches whether the record stored an email, the
// roster name, or a stray profile name carried as an alias.
function identitiesFor(member: { email: string; display_name: string; aliases?: string[] }): Set<string> {
  return new Set([lc(member.email), lc(member.display_name), ...(member.aliases ?? []).map(lc)].filter(Boolean));
}

export interface RosterMemberLike { email: string; display_name: string; role: DoerRole; active: boolean; aliases?: string[]; }

// The Map returned by computeDoerMetrics is keyed by (email, role). Build the
// same key to look a row up from a DoerMetrics value.
export function doerRowKey(email: string, role: DoerRole): string {
  return `${email.trim().toLowerCase()}|${role}`;
}

// Compute per-doer metrics for the active roster over a date range.
// Returns a Map keyed by lowercased email. `winsByOutcome` etc. computed inline.
export function computeDoerMetrics(
  data: DataStore,
  roster: RosterMemberLike[],
  range: GlobalDateRangeLike | null,
): Map<string, DoerMetrics> {
  const settings = data.settings;
  const now = Date.now();
  const nextWeekEnd = now + 7 * MS_DAY;

  // Resolve a customer + siteId to a human site/branch label, with a stable
  // fallback so unscoped quotes still group together (one "call" per site).
  const siteOf = (cust: string, siteId: string | null | undefined): string => {
    const c = data.customers.find(x => x.name === cust);
    return siteLabel(c, siteId) || 'Head Office / General';
  };

  // First pass: raw metrics per (identity, role). A single login (e.g. a shared
  // accounts@ account) can hold several roles, and one person can cover several
  // roles — so the unit of scoring is the (email, role) pair, not the email.
  interface Raw extends DoerMetrics {
    _speedSum: number; _speedN: number;
    _enqLapSum: number; _enqLapN: number;     // recv → created_at
    _quoteLapSum: number; _quoteLapN: number; // created_at → sent_at
    _lateHSum: number; _lateN: number;        // sum of overdue hours on late steps
  }
  const rowKey = doerRowKey;
  const out = new Map<string, Raw>();

  for (const m of roster) {
    if (!m.active) continue;
    out.set(rowKey(m.email, m.role), {
      email: m.email, displayName: m.display_name, role: m.role,
      onTimePct: null, volume: 0, avgCycleH: null, winRate: null,
      enqLapH: null, quoteLapH: null, avgLateH: null, lateCount: 0,
      enqCount: 0, orderCount: 0,
      dueNextWeek: [], composite: null, _speedSum: 0, _speedN: 0,
      _enqLapSum: 0, _enqLapN: 0, _quoteLapSum: 0, _quoteLapN: 0,
      _lateHSum: 0, _lateN: 0,
    });
  }
  if (out.size === 0) return new Map();

  // Index members by (identity, role) for fast attribution. Each identity may map
  // to several roles, so we resolve the row by the role the action belongs to.
  const memberByIdentityRole = new Map<string, Raw>();
  for (const m of roster) {
    if (!m.active) continue;
    const raw = out.get(rowKey(m.email, m.role))!;
    for (const id of identitiesFor(m)) memberByIdentityRole.set(`${id}|${m.role}`, raw);
  }
  // Resolve the roster row credited for a `who` value acting in a given role.
  const matchDoer = (who: string | null | undefined, role: DoerRole): Raw | undefined =>
    who ? memberByIdentityRole.get(`${lc(who)}|${role}`) : undefined;

  // ── DEO: enquiries entered (volume) + entry lag recv→created_at (speed) ──
  for (const e of data.enquiries) {
    if (!inRange(e.recv, range)) continue;
    const raw = matchDoer(e.doer, 'DEO');
    if (!raw) continue;
    raw.volume++;
    raw.enqCount++;
    if (e.recv && e.created_at) {
      const lag = (new Date(e.created_at).getTime() - new Date(e.recv).getTime()) / 3600000;
      if (lag >= 0 && lag < 24 * 30) {
        raw._speedSum += lag; raw._speedN++;       // feeds composite "speed"
        raw._enqLapSum += lag; raw._enqLapN++;     // explicit Enquiry Lap KPI
      }
    }
  }

  // ── Rate Entry: quotes created (volume) + E2Q recv→quote.date (speed) + win ──
  const enquiryById = new Map(data.enquiries.map(e => [e.id, e]));
  const winAcc = new Map<Raw, { won: number; closed: number }>();
  for (const q of data.quotes) {
    if (!inRange(q.date, range)) continue;
    const raw = matchDoer(q.doer, 'Rate Entry');
    if (!raw) continue;
    raw.volume++;
    const enq = q.enqRef ? enquiryById.get(q.enqRef) : undefined;
    if (enq?.recv && q.date) {
      const e2q = (new Date(q.date).getTime() - new Date(enq.recv).getTime()) / 3600000;
      if (e2q >= 0 && e2q < 24 * 60) { raw._speedSum += e2q; raw._speedN++; }
    }
    // Explicit Quote Lap KPI: enquiry punched (created_at) → quote sent (sent_at).
    if (enq?.created_at && q.sent_at) {
      const lap = (new Date(q.sent_at).getTime() - new Date(enq.created_at).getTime()) / 3600000;
      if (lap >= 0 && lap < 24 * 90) { raw._quoteLapSum += lap; raw._quoteLapN++; }
    }
    const fu = data.followups.find(f => f.quote_id === q.id);
    if (q.status === 'Won' || q.status === 'Lost' || fu?.outcome) {
      const acc = winAcc.get(raw) ?? { won: 0, closed: 0 };
      acc.closed++;
      if (q.status === 'Won' || fu?.outcome === 'Won') acc.won++;
      winAcc.set(raw, acc);
    }
  }

  // ── SC_1: follow-up log activity (volume) + on-time over owned cards ──
  // ── Negotiation: authored Negotiation-stage logs (volume) + win + on-time ──
  const onTimeAcc = new Map<Raw, { on: number; tot: number }>();
  const quoteById = new Map(data.quotes.map(q => [q.id, q]));
  for (const fu of data.followups) {
    const quote = quoteById.get(fu.quote_id);
    const realLogs = (fu.logs ?? []).filter(l => !isQuoteSentLog(l.note));

    // Volume: each real log credits its author. The same log can credit both an
    // SC_1 row and a Negotiation row if those roles map to the author's identity.
    for (const log of realLogs) {
      if (!inRange(log.ts, range)) continue;
      const sc1 = matchDoer(log.who, 'SC_1');
      if (sc1) sc1.volume++;
      const neg = matchDoer(log.who, 'Negotiation');
      if (neg && fu.stage === 'Negotiation') neg.volume++;
    }

    if (!quote) continue;

    // On-time: credit the author of each step under whichever of SC_1 /
    // Negotiation they hold; fall back to the card owner.
    const chain = buildFullChain(settings, quote, fu);
    for (let i = 1; i < chain.length; i++) {
      const log = chain[i];
      if (!inRange(log.ts, range)) continue;
      const deadline = stepDeadline(settings, chain, i);
      const onTime = new Date(log.ts) <= deadline;
      const lateH = onTime ? 0 : Math.round((new Date(log.ts).getTime() - deadline.getTime()) / 3_600_000);
      for (const role of ['SC_1', 'Negotiation'] as const) {
        const raw = matchDoer(log.who, role) ?? matchDoer(fu.owner, role);
        if (!raw) continue;
        const acc = onTimeAcc.get(raw) ?? { on: 0, tot: 0 };
        acc.tot++;
        if (onTime) acc.on++;
        onTimeAcc.set(raw, acc);
        if (!onTime) { raw._lateHSum += lateH; raw._lateN++; }
      }
    }

    // Negotiation win rate: cards that passed through Negotiation and closed.
    if (fu.outcome) {
      // Credit the last real-log author (the closer); fall back to the owner.
      const lastAuthor = realLogs.length ? realLogs[realLogs.length - 1].who : undefined;
      const negDoer = matchDoer(lastAuthor, 'Negotiation') ?? matchDoer(fu.owner, 'Negotiation');
      if (negDoer) {
        const acc = winAcc.get(negDoer) ?? { won: 0, closed: 0 };
        acc.closed++;
        if (fu.outcome === 'Won') acc.won++;
        winAcc.set(negDoer, acc);
      }
    }

    // ── Due next week: open follow-ups with next_date in the next 7 days ──
    // Credit the owner under whichever follow-up role(s) they hold.
    if (fu.status !== 'closed' && fu.next_date) {
      const due = new Date(fu.next_date).getTime();
      if (due >= now - MS_DAY && due <= nextWeekEnd) {
        for (const role of ['SC_1', 'Negotiation'] as const) {
          const raw = matchDoer(fu.owner, role);
          if (raw) raw.dueNextWeek.push({
            kind: 'followup', refId: fu.quote_id, cust: quote.cust,
            siteId: quote.siteId ?? null, site: siteOf(quote.cust, quote.siteId),
            label: `Follow-up ${quote.id} · ${quote.cust}`, dueDate: fu.next_date,
          });
        }
      }
    }
  }

  // ── DEO also: convert quote→order on PO (count orders) ──
  for (const o of data.orders) {
    if (!inRange((o as any).created_at ?? o.poDate, range)) continue;
    const raw = matchDoer(o.doer, 'DEO');
    if (raw) { raw.volume++; raw.orderCount++; }
  }

  // ── Draft quotes pending = Rate Entry due-next-week ──
  for (const q of data.quotes) {
    if (q.status !== 'Draft') continue;
    const raw = matchDoer(q.doer, 'Rate Entry');
    if (raw) {
      raw.dueNextWeek.push({
        kind: 'draft-quote', refId: q.id, cust: q.cust,
        siteId: q.siteId ?? null, site: siteOf(q.cust, q.siteId),
        label: `Send quote ${q.id} · ${q.cust}`, dueDate: null,
      });
    }
  }

  // Finalize per-member raw metrics.
  for (const raw of out.values()) {
    raw.avgCycleH = raw._speedN > 0 ? Math.round(raw._speedSum / raw._speedN) : null;
    raw.enqLapH = raw._enqLapN > 0 ? Math.round(raw._enqLapSum / raw._enqLapN) : null;
    raw.quoteLapH = raw._quoteLapN > 0 ? Math.round(raw._quoteLapSum / raw._quoteLapN) : null;
    const ot = onTimeAcc.get(raw);
    raw.onTimePct = ot && ot.tot > 0 ? Math.round(ot.on / ot.tot * 100) : null;
    raw.avgLateH = raw._lateN > 0 ? Math.round(raw._lateHSum / raw._lateN) : null;
    raw.lateCount = raw._lateN;
    const w = winAcc.get(raw);
    raw.winRate = w && w.closed > 0 ? Math.round(w.won / w.closed * 100) : null;
  }

  // ── Composite score = done / total assigned × 100 ──────────────────────────
  // For each role, "done" and "total" are the primary accountability metric:
  //   SC_1 / Negotiation / Other: follow-up steps done on-time / total steps due
  //   DEO:                        enquiries punched / (enquiries punched + open)
  //   Rate Entry:                 quotes sent / (quotes sent + drafts pending)
  //   PI Sender:                  scoring deferred (null)
  //
  // composite is 0–100. shortfall = composite − 100 (shown as e.g. −21%).
  // Formula: composite = round(done * 100 / total)
  const members = [...out.values()];
  for (const m of members) {
    if (ROLE_WEIGHTS[m.role] === null) { m.composite = null; continue; }

    if (m.role === 'SC_1' || m.role === 'Negotiation' || m.role === 'Other') {
      // done = on-time steps, total = all steps credited to this doer
      const ot = onTimeAcc.get(m as any);
      if (!ot || ot.tot === 0) { m.composite = null; continue; }
      m.composite = Math.round(ot.on * 100 / ot.tot);

    } else if (m.role === 'DEO') {
      // done = enquiries punched in period; total = done + still-open (no qRef, not Quoted)
      const openEnqCount = data.enquiries.filter(e =>
        !e.qRef && e.status !== 'Lost' && e.status !== 'Parked' && e.doer &&
        identitiesFor({ email: m.email, display_name: m.displayName }).has((e.doer ?? '').toLowerCase())
      ).length;
      const total = m.volume + openEnqCount;
      m.composite = total === 0 ? null : Math.round(m.volume * 100 / total);

    } else if (m.role === 'Rate Entry') {
      // done = quotes sent; total = done + drafts still pending
      const draftCount = data.quotes.filter(q =>
        q.status === 'Draft' && q.doer &&
        identitiesFor({ email: m.email, display_name: m.displayName }).has((q.doer ?? '').toLowerCase())
      ).length;
      const total = m.volume + draftCount;
      m.composite = total === 0 ? null : Math.round(m.volume * 100 / total);

    } else {
      m.composite = null;
    }
  }

  // Strip private accumulators.
  const result = new Map<string, DoerMetrics>();
  for (const [k, raw] of out) {
    const { _speedSum, _speedN, _enqLapSum, _enqLapN, _quoteLapSum, _quoteLapN, _lateHSum, _lateN, ...clean } = raw;
    result.set(k, clean);
  }
  return result;
}

// ── Pipeline stage ownership ─────────────────────────────────────────
// Which role owns a board lane: settings.pipeline_roles → DEFAULT_STAGE_ROLE.
export function roleForStage(settings: AppSettings | null, lane: BoardLane): DoerRole {
  return settings?.pipeline_roles?.[lane] ?? DEFAULT_STAGE_ROLE[lane] ?? 'Other';
}

// Resolve a roster member's identities (email + display name, lowercased).
function memberIdentities(member: RosterMemberLike): Set<string> {
  return identitiesFor(member);
}

// ── Per-doer behaviour timeline ──────────────────────────────────────
export interface TimelineRow {
  date: string;            // YYYY-MM-DD (group key)
  ts: string;              // ISO (sort within day, desc)
  kind: 'done' | 'pending';
  activity: string;        // e.g. "Called · MRT-092"
  channel?: string;        // log channel when kind === 'done'
  refId: string;           // quote / enquiry id
  cust: string;
  siteId: string | null;   // customer site/branch this quote belongs to
  site: string;            // resolved site/branch label (city — branch)
  onTime: boolean | null;  // done: met step deadline?; pending: false = overdue
  note?: string;           // what happened (log note)
  nextSummary?: string;    // planned-next: "12 Jun · Email — send revised quote"
  lapH?: number | null;    // entry/conversion lap in hours (DEO rows)
  kindLabel?: string;      // row-type label for DEO rows ("Enquiry entry" / "Order")
}

// Short human duration for a lap in hours: "3h", "1d 4h", "2d".
function fmtLapShort(h: number): string {
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); const r = h % 24;
  return r ? `${d}d ${r}h` : `${d}d`;
}

// Compose a "planned next" one-liner from a log's next* fields (or a followup's
// next_date/next_time for pending rows). Returns undefined when nothing planned.
function nextSummaryOf(parts: { date?: string | null; time?: string | null; channel?: string | null; note?: string | null }): string | undefined {
  const { date, time, channel, note } = parts;
  if (!date && !channel && !note) return undefined;
  const datePart = date
    ? (() => { try { return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch { return date; } })()
    : '';
  const head = [datePart, time].filter(Boolean).join(' ');
  const lead = [head, channel].filter(Boolean).join(' · ');
  return note ? (lead ? `${lead} — ${note}` : note) : (lead || undefined);
}

// Build the done + pending behaviour history for one roster member over a range.
// Done rows = the member's follow-up logs (scored on-time via the shared
// buildFullChain/stepDeadline). Pending rows = open follow-ups the member owns
// whose next step is now overdue. Rows are returned newest-first.
export function buildDoerTimeline(
  data: DataStore,
  member: RosterMemberLike,
  range: GlobalDateRangeLike | null,
): TimelineRow[] {
  const settings = data.settings;
  const ids = memberIdentities(member);
  const isMine = (who?: string | null) => !!who && ids.has(lc(who));
  const rows: TimelineRow[] = [];
  const quoteById = new Map(data.quotes.map(q => [q.id, q]));
  const now = new Date();
  // Resolve a quote's customer + site to a human label; fallback keeps unscoped
  // quotes grouped together (one call per site).
  const siteOf = (cust: string, siteId: string | null | undefined): string => {
    const c = data.customers.find(x => x.name === cust);
    return siteLabel(c, siteId) || 'Head Office / General';
  };

  // ── Rate Entry work history: quotes created (punched → sent lap). A Rate
  // Entry operator's job is to enter rates after an enquiry is punched and
  // mark the quote sent. History rows = one per quote they authored, scored
  // on the enquiry-punched → quote-sent lap vs the stage TAT.
  if (member.role === 'Rate Entry') {
    const TAT_H = stageTatHours(settings, 'Sent Quotation'); // default quote TAT
    const enquiryById = new Map(data.enquiries.map(e => [e.id, e]));

    for (const q of data.quotes) {
      if (!isMine(q.doer)) continue;
      // Use sent_at as the primary timestamp; fall back to quote.date for Drafts.
      const stamp = q.sent_at ?? q.date;
      if (!stamp) continue;
      if (!inRange(stamp, range)) continue;

      const enq = q.enqRef ? enquiryById.get(q.enqRef) : undefined;
      // Lap: enquiry punched (enq.created_at) → quote sent (q.sent_at).
      // Fall back to recv → quote.date if timestamps are missing.
      const fromTs = enq?.created_at ?? enq?.recv ?? null;
      const toTs = q.sent_at ?? null;
      const lapH = (fromTs && toTs)
        ? Math.round((new Date(toTs).getTime() - new Date(fromTs).getTime()) / 3600000)
        : null;
      const onTime = lapH == null ? null : lapH <= TAT_H;
      const wasSent = q.status === 'Sent' || q.status === 'Won' || q.status === 'Lost';

      rows.push({
        date: stamp.slice(0, 10),
        ts: stamp,
        kind: 'done',
        activity: `Quote ${q.status} · ${q.id}`,
        channel: wasSent ? 'Sent' : 'Draft',
        refId: q.id,
        cust: q.cust,
        siteId: q.siteId ?? null,
        site: siteOf(q.cust, q.siteId),
        onTime: wasSent ? onTime : null,
        lapH: wasSent ? lapH : null,
        kindLabel: wasSent ? 'Quote sent' : 'Draft',
        note: wasSent
          ? (lapH == null
              ? `Sent ${q.id}${enq ? ` · ${enq.id}` : ''}`
              : `Sent ${fmtLapShort(lapH)} after enquiry punched`)
          : `Draft — not yet sent`,
      });
    }

    return rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  }

  // ── DEO work history: enquiries entered (recv → punched lap) + quote→order
  // conversions. A DEO doesn't run follow-ups, so its history is these two
  // activities, scored on the punch lap (≤ urgency SLA = on-time).
  if (member.role === 'DEO') {
    const SLA_H: Record<string, number> = { Hot: 4, Urgent: 24, Normal: 48, Low: 72 };
    // Enquiry-entry rows.
    for (const e of data.enquiries) {
      if (!isMine(e.doer)) continue;
      const stamp = e.created_at ?? e.recv;          // when punched in
      if (!inRange(stamp, range)) continue;
      const lapH = (e.recv && e.created_at)
        ? Math.round((new Date(e.created_at).getTime() - new Date(e.recv).getTime()) / 3600000)
        : null;
      const sla = SLA_H[e.urg] ?? 48;
      const onTime = lapH == null ? null : lapH <= sla;
      rows.push({
        date: stamp.slice(0, 10),
        ts: stamp,
        kind: 'done',
        activity: `Enquiry entry · ${e.id}`,
        channel: e.src || 'RFQ',
        refId: e.id,
        cust: e.cust,
        siteId: e.siteId ?? null,
        site: siteOf(e.cust, e.siteId),
        onTime,
        lapH,
        kindLabel: 'Enquiry entry',
        note: lapH == null ? 'Entered (no received-time recorded)' : `Punched ${fmtLapShort(lapH)} after receipt`,
      });
    }
    // Quote → order conversion rows.
    for (const o of data.orders) {
      if (!isMine(o.doer)) continue;
      const stamp = (o as any).created_at ?? o.poDate;
      if (!inRange(stamp, range)) continue;
      const q = o.quoteRef ? quoteById.get(o.quoteRef) : undefined;
      const fromTs = q?.sent_at ?? q?.date ?? null;
      const lapH = (fromTs && stamp)
        ? Math.round((new Date(stamp).getTime() - new Date(fromTs).getTime()) / 3600000)
        : null;
      rows.push({
        date: stamp.slice(0, 10),
        ts: stamp,
        kind: 'done',
        activity: `Order ${o.id} · ${o.quoteRef || '—'}`,
        channel: 'Order',
        refId: o.quoteRef || o.id,
        cust: o.cust,
        siteId: o.siteId ?? null,
        site: siteOf(o.cust, o.siteId),
        onTime: null,                                  // conversion has no SLA bar
        lapH,
        kindLabel: 'Order',
        note: `PO ${o.poNo || ''} converted${lapH != null ? ` ${fmtLapShort(lapH)} after quote sent` : ''}`.trim(),
      });
    }
    return rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  }

  for (const fu of data.followups) {
    const quote = quoteById.get(fu.quote_id);
    if (!quote) continue;
    const chain = buildFullChain(settings, quote, fu);

    // Done rows: real logs authored by this member (skip synthetic quote-sent).
    for (let i = 0; i < chain.length; i++) {
      const log = chain[i];
      if (isQuoteSentLog(log.note)) continue;
      if (!isMine(log.who)) continue;
      if (!inRange(log.ts, range)) continue;
      const onTime = i >= 1 ? new Date(log.ts) <= stepDeadline(settings, chain, i) : null;
      rows.push({
        date: log.ts.slice(0, 10),
        ts: log.ts,
        kind: 'done',
        activity: `${log.channel} · ${quote.id}`,
        channel: log.channel,
        refId: quote.id,
        cust: quote.cust,
        siteId: quote.siteId ?? null,
        site: siteOf(quote.cust, quote.siteId),
        onTime,
        note: log.note,
        nextSummary: nextSummaryOf({ date: log.nextDate, time: log.nextTime, channel: log.nextChannel, note: log.nextNote }),
      });
    }

    // Pending row: any OPEN card attributed to this member with a promised next
    // step — overdue AND upcoming. Attribute by owner OR the latest log's `who`
    // (the identity may live on either field), so a single alias covers both.
    // Not date-range filtered: pending is live to-do state, not history.
    const realLogs = (fu.logs ?? []).filter(l => !isQuoteSentLog(l.note));
    const lastWho = realLogs.length ? realLogs[realLogs.length - 1].who : undefined;
    if (fu.status !== 'closed' && fu.next_date && (isMine(fu.owner) || isMine(lastWho))) {
      const due = new Date(fu.next_date);
      due.setHours(23, 59, 59, 999);
      const overdue = due < now;
      rows.push({
        date: fu.next_date.slice(0, 10),
        ts: fu.next_date,
        kind: 'pending',
        activity: `Follow-up due · ${quote.id}`,
        refId: quote.id,
        cust: quote.cust,
        siteId: quote.siteId ?? null,
        site: siteOf(quote.cust, quote.siteId),
        onTime: overdue ? false : null, // false = overdue, null = upcoming
        nextSummary: nextSummaryOf({ date: fu.next_date, time: fu.next_time }),
      });
    }
  }

  // Newest first; pending sorts with its due date.
  return rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}

// ── Per-doer stage workload ──────────────────────────────────────────
export interface StageWorkload {
  lane: BoardLane;
  tatHours: number;
  pending: number;   // cards in this lane breaching / past TAT
  done: number;      // cards in this lane still within TAT
  total: number;
}

// For each board lane the member's role owns, count the cards currently sitting
// in it, split into within-TAT ("done"/on track) vs breached ("pending"/overdue).
// Lane derivation mirrors PipelineBoard: pre-quote lanes from enquiry status,
// quote lanes from followup.stage (or quote status fallback).
export function doerStageWorkload(
  data: DataStore,
  member: RosterMemberLike,
  range: GlobalDateRangeLike | null = null,
): StageWorkload[] {
  const settings = data.settings;
  const now = Date.now();

  // Lanes owned by this member's role (excluding Closed — no live workload).
  const ownedLanes = (Object.keys(DEFAULT_STAGE_ROLE) as BoardLane[])
    .filter(lane => lane !== 'Closed' && roleForStage(settings, lane) === member.role);
  if (ownedLanes.length === 0) return [];

  const acc = new Map<BoardLane, StageWorkload>();
  for (const lane of ownedLanes) {
    acc.set(lane, { lane, tatHours: stageTatHours(settings, lane), pending: 0, done: 0, total: 0 });
  }

  const bump = (lane: BoardLane, enteredAt: string | null | undefined) => {
    const w = acc.get(lane);
    if (!w) return;
    // Honour the global date range: only count items that entered the lane
    // within the selected window. No range → count everything (live backlog).
    if (range && !inRange(enteredAt, range)) return;
    w.total++;
    const tatMs = w.tatHours * 3600000;
    const elapsed = enteredAt ? now - new Date(enteredAt).getTime() : 0;
    if (w.tatHours > 0 && elapsed > tatMs) w.pending++;
    else w.done++;
  };

  // Pre-quote lanes from enquiries (not yet quoted).
  for (const enq of data.enquiries) {
    if (enq.qRef) continue;
    if (enq.status === 'Lost' || enq.status === 'Parked') continue;
    const lane: BoardLane | null =
      enq.status === 'New' ? 'New Enquiry' :
      enq.status === 'In Review' ? 'To Quote' : null;
    if (lane && acc.has(lane)) bump(lane, enq.recv);
  }

  // Quote lanes from followup.stage (or quote status fallback).
  for (const quote of data.quotes) {
    const fu = data.followups.find(f => f.quote_id === quote.id);
    const stage =
      (fu?.stage as BoardLane) ||
      (quote.status === 'Won' || quote.status === 'Lost' ? 'Closed' : 'Sent Quotation');
    if (stage === 'Closed' || !acc.has(stage)) continue;
    bump(stage, fu?.stage_entered_at || quote.date || null);
  }

  return ownedLanes.map(lane => acc.get(lane)!);
}
