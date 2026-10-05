import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui';
import { DuplicateReviewPanel } from '../components/DuplicateReviewPanel';
import { Search, Plus, Upload, Loader2, X, Phone, Mail, MessageCircle, Star, Package, ChevronRight, MapPin, Copy, Truck, Wand2, CheckCircle2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Customer, Contact, CustomerTier, CustomerStatus, FollowUpLog } from '../lib/types';
import { formatINR, fmtIST, generateId, cleanGstin, isValidGstin, panFromGstin, groupDocsByCustomer, isDocOfCustomer, canDeleteRecords, nameTier, normalizeSearchText, isLead, contactMatchesQuery } from '../lib/utils';
import { parseISO } from 'date-fns';
import Papa from 'papaparse';

// ── helpers ──────────────────────────────────────────────────────────────────

function computeRating(c: Customer): number {
  const p = (c.ratingPayment ?? 0) * 3;
  const o = (c.ratingOrders  ?? 0) * 4;
  const t = (c.ratingTrend   ?? 0) * 3;
  return Math.round((p + o + t) * 10) / 10;
}

function hasMixedContent(text: string) {
  // Keyword patterns (transport, lead time, plant, dispatch, phone labels, GSTIN)
  const keywords = /(?:transport(?:er)?|lead\s*time|plant\s*[:\-–]|unit\s*[:\-–]|location\s*[:\-–]|c\/o\b|for\s+dispatch|parcel\s+address|gst(?:in)?\s*[:\-–\s]|mob(?:ile)?\.?\s*(?:no\.?)?\s*[:\-–]|phn?\.?\s*(?:no\.?)?\s*[:\-–]|ph(?:one)?\.?\s*(?:no\.?)?\s*[:\-–]|tel(?:ephone)?(?:\.?\s*fax)?\.?\s*(?:no\.?)?\s*[:\-–]|contact\s*(?:no\.?)?\s*[:\-–]|\bt\s*[:\-–]\s*\d|\bm\s*[:\-–]\s*\d)/i.test(text);
  // Bare 10-digit mobile / long number (not PIN codes split with space)
  const barePhone = /\b\d{10,}\b/.test(text);
  // GSTIN pattern
  const gstin = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/.test(text);
  return keywords || barePhone || gstin;
}

function titleCaseAddress(text: string): string {
  const lowerWords = new Set(['of', 'and', 'the', 'in', 'at', 'by', 'to', 'for', 'a', 'an', 'via', 'near']);
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    return trimmed.split(/\s+/).map((word, i) => {
      const letters = word.replace(/[^a-zA-Z]/g, '');
      if (!letters) return word;
      // Only fix words that are entirely lowercase — leave ALL-CAPS, Mixed-Case, XII, LTD. etc untouched
      if (letters !== letters.toLowerCase()) return word;
      if (i > 0 && lowerWords.has(letters)) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }).join('\n');
}

function extractPhones(value: string): string[] {
  // Extract all digit groups of 7+ digits (covers mobile 10, STD 8-11, intl)
  const cleaned = value.replace(/(?:\+91|0091)[\s\-]*/g, '');
  const matches = cleaned.match(/\d[\d\s\-]{5,}\d/g) ?? [];
  return matches
    .map(m => m.replace(/[^\d]/g, ''))
    .filter(p => p.length >= 7);
}

function isBarePhone(line: string): boolean {
  const stripped = line.replace(/(?:\+91|0091)[\s\-]*/g, '');
  // No letters, and contains a number sequence of 7+ digits
  return !/[a-zA-Z]/.test(stripped) && /\d[\d\s\-]{5,}\d/.test(stripped);
}

function extractGstin(line: string): string {
  const m = line.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/);
  return m ? m[1] : '';
}

function parseMixedAddress(raw: string): { cleanAddress: string; transporter: string; leadTimeNote: string; dispatchHint: string; siteName: string; phones: string[]; gstin: string } {
  const lines = raw.split('\n');
  const kept: string[] = [];
  let transporter = '';
  let leadTime = '';
  let siteName = '';
  let gstin = '';
  const dispatchLines: string[] = [];
  const phones: string[] = [];

  // Line-start patterns
  const transporterRx   = /^(?:transport(?:er)?|carrier|via transport|by transport)\s*[:\-–]\s*/i;
  const leadTimeRx      = /^(?:lead\s*time|delivery\s*(?:time|note)|l\.?t\.?)\s*[:\-–]\s*/i;
  const plantRx         = /^(?:plant|unit|location)\s*[:\-–]\s*/i;
  const dispatchStartRx = /^(?:for\s+dispatch(?:ed)?\s+items?\s+only|c\/o\b|parcel\s+address\s*[:\-–]?)/i;
  // "To: Basti" / "To : Sitapur" lines → discard (destination city already in address)
  const toRx            = /^to\s*[:\-–]\s*/i;
  const phoneRx         = /^(?:mob(?:ile)?\.?\s*(?:no\.?)?|phn?\.?\s*(?:no\.?)?|ph(?:one)?\.?\s*(?:no\.?)?|tel(?:ephone)?(?:\.?\s*fax)?\.?\s*(?:no\.?)?|contact\s*(?:no\.?|number)?|m\.?\s*no\.?|t\s*[:\-–]|m\s*[:\-–]|p\s*[:\-–]\s*\+?\d)\s*[:\-–\s]\s*/i;
  const gstinLabelRx    = /^(?:gst(?:in)?|uin|gst\s*no\.?)\s*[:\-–\s]\s*/i;
  // Bare GSTIN label with no value (e.g. "India Gstin No." / "GST NO.")
  const gstinEmptyRx    = /^(?:india\s+)?(?:gst(?:in)?|uin)\s*(?:no\.?)?\s*\.?\s*$/i;
  const noteLineRx      = /^(?:bill\s+wala|builty?\s+(?:ki\s+)?(?:photo\s+)?(?:send|attach|bhejna)|no\s+need\s+to\s+send|courier\s+plant\s+mein|paid\b|k\.?\s*a\.?\s*[:.\s]|attn\s*[:.\s]|attention\s*[:.\s]|the\s+(?:purchase|store|accounts?|works?|billing)\s+(?:dept\.?|department|manager|officer)|(?:sr\.?\s*|jr\.?\s*)?(?:manager|officer|executive|head|director|gm|agm|dgm)\s*[(\-,]|(?:mr|ms|mrs|dr|shri|sh)\.?\s+[a-z])/i;
  const phoneFirstRx    = /^(\d[\d\s\-]{6,}\d)\s+([a-zA-Z].{2,})$/;

  // Inline patterns to strip from within a line
  // Phone labels + digits anywhere in a line
  const inlinePhoneRx   = /[\s,;|]+(?:mob(?:ile)?|phn?|ph(?:one)?|tel(?:ephone)?(?:\.?\s*fax)?|tele\.?\s*fax|contact\s*(?:no\.?)?|t|m)\s*[:\-–.]\s*[\+\d][\d\s\-+(),]{6,}/gi;
  // Trailing bare phone after comma/space at end of line: ", 9201595158,9673769673"
  const trailingPhoneRx = /[,\s]+(\+?91[\s\-]?)?\d[\d\s\-,]{8,}\d\s*$/g;
  // Inline unit/plant embedded in middle of a line: "Sugar Unit - SHRI DATTA" / "Distillery Unit:- Rumpur"
  const inlineUnitRx    = /\b(?:sugar\s+unit|distillery\s+unit|unit)\s*[:\-–]+\s*/i;

  let inDispatch = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { if (!inDispatch) kept.push(''); continue; }

    if (transporterRx.test(trimmed)) { transporter = trimmed.replace(transporterRx, '').trim(); inDispatch = false; }
    else if (leadTimeRx.test(trimmed)) { leadTime = trimmed.replace(leadTimeRx, '').trim(); inDispatch = false; }
    else if (plantRx.test(trimmed)) { siteName = siteName || trimmed.replace(plantRx, '').trim(); inDispatch = false; }
    else if (toRx.test(trimmed)) { /* discard "To: City" lines */ inDispatch = false; }
    else if (gstinEmptyRx.test(trimmed)) { /* discard bare "India Gstin No." label */ inDispatch = false; }
    else if (gstinLabelRx.test(trimmed)) {
      const val = trimmed.replace(gstinLabelRx, '').trim().toUpperCase();
      if (val) gstin = gstin || val;
      inDispatch = false;
    }
    else if (phoneRx.test(trimmed)) { phones.push(...extractPhones(trimmed.replace(phoneRx, '').trim())); inDispatch = false; }
    else if (isBarePhone(trimmed)) { phones.push(...extractPhones(trimmed)); inDispatch = false; }
    else if (dispatchStartRx.test(trimmed)) { inDispatch = true; dispatchLines.push(trimmed); }
    else if (inDispatch) { dispatchLines.push(trimmed); }
    else if (noteLineRx.test(trimmed)) { leadTime = leadTime ? leadTime + '\n' + trimmed : trimmed; inDispatch = false; }
    else {
      const phoneFirst = phoneFirstRx.exec(trimmed);
      if (phoneFirst) {
        phones.push(...extractPhones(phoneFirst[1]));
        leadTime = leadTime ? leadTime + '\n' + phoneFirst[2].trim() : phoneFirst[2].trim();
        inDispatch = false;
      } else {
        const bareGstin = extractGstin(trimmed);
        if (bareGstin && !gstin) {
          gstin = bareGstin;
          const rest = trimmed.replace(bareGstin, '').replace(/^[\s,:\-–]+|[\s,:\-–]+$/g, '').trim();
          if (rest) kept.push(rest);
        } else {
          // Strip inline phone fragments, then inline unit labels, then trailing phones
          let cleaned = trimmed
            .replace(inlinePhoneRx, (m) => { phones.push(...extractPhones(m)); return ''; })
            .replace(trailingPhoneRx, (m) => { phones.push(...extractPhones(m)); return ''; })
            .trim();
          // Extract inline unit name (e.g. "Distillery Unit:- Rumpur Road, ...")
          const unitMatch = inlineUnitRx.exec(cleaned);
          if (unitMatch && !siteName) {
            siteName = cleaned.slice(unitMatch.index + unitMatch[0].length).trim();
            cleaned = cleaned.slice(0, unitMatch.index).trim();
          }
          // Strip trailing "GST NO." / "Contact No. 0124..." remnants
          cleaned = cleaned
            .replace(/,?\s*gst\s*no\.?\s*$/i, '')
            .replace(/,?\s*contact\s*no\.?\s*[\d\s\-.,]*$/i, '')
            .trim();
          if (cleaned) kept.push(cleaned);
        }
      }
    }
  }
  return {
    cleanAddress: titleCaseAddress(kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()),
    transporter: titleCaseAddress(transporter),
    leadTimeNote: leadTime,
    dispatchHint: titleCaseAddress(dispatchLines.join('\n').trim()),
    siteName,
    phones,
    gstin,
  };
}

interface SiteFix {
  customerId: string;
  customerName: string;
  siteId: string;
  currentSiteName: string;
  parsed: ReturnType<typeof parseMixedAddress>;
  currentTransporter: string;
  currentLeadTime: string;
  currentDispatch: string;
}

function detectAllFixes(customers: Customer[]): SiteFix[] {
  const fixes: SiteFix[] = [];
  for (const c of customers) {
    for (const s of (c.sites ?? []).slice(0, 1)) {   // Main Office only — extra sites are edited in the customer form
      const raw = s.fullAddress || s.address || '';
      if (!raw || !hasMixedContent(raw)) continue;
      fixes.push({
        customerId: c.id,
        customerName: c.name,
        siteId: s.id,
        currentSiteName: s.name || s.city || s.id,
        parsed: parseMixedAddress(raw),
        currentTransporter: s.transporter || '',
        currentLeadTime: s.leadTimeNote || '',
        currentDispatch: s.dispatchAddress || '',
      });
    }
  }
  return fixes;
}

export function getPrimaryContact(c: Customer): Contact | undefined {
  for (const s of c.sites ?? []) {
    const found = (s.contacts ?? []).find(ct => ct.isPrimary) ?? (s.contacts ?? [])[0];
    if (found) return found;
  }
  return undefined;
}

function getTierStyle(tier: CustomerTier | undefined) {
  switch (tier) {
    case 'Gold':   return 'bg-amber-50 text-amber-700 border-amber-300';
    case 'Silver': return 'bg-slate-100 text-slate-600 border-slate-300';
    case 'Bronze': return 'bg-orange-50 text-orange-700 border-orange-300';
    default:       return 'bg-g100 text-g500 border-g300';
  }
}

export function TierBadge({ tier }: { tier: CustomerTier | undefined }) {
  const t = tier ?? 'New';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9.5px] font-bold uppercase tracking-wide ${getTierStyle(t)}`}>
      {t === 'Gold' && <Star size={8} className="fill-amber-500 stroke-amber-500" />}
      {t}
    </span>
  );
}

function StarRating({ score }: { score: number }) {
  const stars = Math.round(score / 20);
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={10} className={i <= stars ? 'fill-amber-400 stroke-amber-400' : 'fill-g200 stroke-g200'} />
      ))}
    </div>
  );
}

export function InitialAvatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const colors = ['bg-blue-600', 'bg-indigo-600', 'bg-violet-600', 'bg-emerald-600', 'bg-teal-600', 'bg-rose-600'];
  const col = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-8 h-8 rounded-full ${col} flex items-center justify-center text-white font-bold text-[11px] shrink-0`}>
      {initials || '?'}
    </div>
  );
}

function formatTurnover(v: number | undefined): string {
  if (!v) return '—';
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(0)}L`;
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`;
  return formatINR(v);
}

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  WhatsApp: <MessageCircle size={11} className="text-green-500" />,
  Called:   <Phone size={11} className="text-blue-500" />,
  Email:    <Mail size={11} className="text-red-400" />,
  Meeting:  <Star size={11} className="text-purple-400" />,
  Visit:    <MapPin size={11} className="text-orange-400" />,
};

// ── CustomerPanel ─────────────────────────────────────────────────────────────

export function CustomerPanel({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { data, updateCustomer } = useAppStore();
  const navigate = useNavigate();

  // Gather all follow-up logs for quotes belonging to this customer
  const customerQuotes = data.quotes.filter(q => isDocOfCustomer(q, customer));
  const quoteIds = new Set(customerQuotes.map(q => q.id));
  const allLogs: (FollowUpLog & { quoteId: string })[] = data.followups
    .filter(f => quoteIds.has(f.quote_id))
    .flatMap(f => f.logs.map(l => ({ ...l, quoteId: f.quote_id })))
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const primaryContact = getPrimaryContact(customer);
  // Every contact person on the Main Office (up to 5), primary first.
  const profileContacts = [
    ...(primaryContact ? [primaryContact] : []),
    ...(customer.sites?.[0]?.contacts ?? []).filter(ct => ct !== primaryContact && (ct.name || ct.phone || ct.email)),
  ].filter(ct => ct.name || ct.phone || ct.email);
  const rating = computeRating(customer);

  // Inline log form
  const [logChannel, setLogChannel] = useState<FollowUpLog['channel']>('Called');
  const [logNote, setLogNote] = useState('');
  const [logQuoteId, setLogQuoteId] = useState<string>(customerQuotes[0]?.id ?? '');

  // Rating edit
  const [editRating, setEditRating] = useState(false);
  const [rp, setRp] = useState(customer.ratingPayment ?? 0);
  const [ro, setRo] = useState(customer.ratingOrders ?? 0);
  const [rt, setRt] = useState(customer.ratingTrend ?? 0);
  const [tier, setTier] = useState<CustomerTier>(customer.tier ?? 'New');
  const [turnover, setTurnover] = useState(String(customer.turnover ?? ''));
  const [nextOrders, setNextOrders] = useState((customer.nextOrders ?? []).join(', '));
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    await updateCustomer(customer.id, {
      tier,
      turnover: turnover ? Number(turnover) : 0,
      ratingPayment: rp,
      ratingOrders: ro,
      ratingTrend: rt,
      nextOrders: nextOrders.split(',').map(s => s.trim()).filter(Boolean),
    });
    setSaving(false);
    setEditRating(false);
  };

  // We can't create a new follow-up log without a quoteId in current store design.
  // Show a prompt if no quotes exist.
  const canLog = customerQuotes.length > 0;

  const handleLog = async () => {
    if (!logNote.trim() || !logQuoteId) return;
    const { addFollowUpLog } = data as any;
    // addFollowUpLog is on the store, not data — use a workaround via the hook
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-blk/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-[440px] bg-white shadow-2xl flex flex-col overflow-hidden border-l border-g200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-g200 bg-g50/50">
          <div className="flex items-start gap-3">
            <InitialAvatar name={customer.name} />
            <div>
              <h2 className="font-serif text-[17px] text-blk leading-snug tracking-tight">{customer.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <TierBadge tier={customer.tier} />
                {customer.seg && <span className="text-[10px] text-g500 font-medium">{customer.seg}</span>}
                {customer.sites?.[0]?.city && (
                  <span className="flex items-center gap-1 text-[10px] text-g400">
                    <MapPin size={9} /> {customer.sites[0].city}
                  </span>
                )}
              </div>
              {(customer.createdBy || customer.modifiedBy) && (
                <div className="text-[10px] text-g400 font-mono mt-1.5 space-y-0.5">
                  {customer.createdBy && (
                    <p>Added by {customer.createdBy}{customer.createdDate ? ` · ${new Date(customer.createdDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>
                  )}
                  {customer.modifiedBy && (
                    <p>Edited by {customer.modifiedBy}{customer.modifiedDate ? ` · ${new Date(customer.modifiedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>
                  )}
                </div>
              )}
              {!isLead(customer) && customer.promotedAt && (
                <p className="text-[10px] text-lead-text font-mono mt-0.5">
                  Promoted from Lead on {new Date(customer.promotedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}{customer.promotedBy ? ` by ${customer.promotedBy}` : ''}
                </p>
              )}
            </div>
          </div>
          <button type="button" title="Close panel" aria-label="Close customer panel" onClick={onClose} className="p-1 text-g400 hover:text-blk rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Stats row */}
          <div className="grid grid-cols-3 divide-x divide-g100 border-b border-g200">
            {[
              { label: 'FY Turnover', value: formatTurnover(customer.turnover) },
              { label: 'Revenue',     value: formatTurnover(customer.revenue) },
              { label: 'Rating',      value: rating > 0 ? `${rating}/100` : 'Not rated' },
            ].map(({ label, value }) => (
              <div key={label} className="px-4 py-3 text-center">
                <div className="font-mono text-[8px] font-bold uppercase tracking-[1.5px] text-g400 mb-0.5">{label}</div>
                <div className="font-bold text-[14px] text-blk">{value}</div>
              </div>
            ))}
          </div>

          {/* GSTIN / payment / inco */}
          <div className="px-5 py-3 border-b border-g100 grid grid-cols-2 gap-2 text-[11.5px]">
            {customer.sites.some(s => s.gstin?.trim()) ? (
              <div className="col-span-2 space-y-1">
                <div className="text-g400 text-[10px] font-bold uppercase tracking-wide">GSTIN</div>
                {customer.sites.filter(s => s.gstin?.trim()).map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blk text-[11px]">{s.gstin}</span>
                    <span className="text-g400 text-[10px]">({s.name})</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="col-span-2"><span className="text-g400">GSTIN: </span><span className="text-g300">—</span></div>
            )}
            <div><span className="text-g400">Payment: </span><span className="font-bold text-blk">{customer.pay || '—'}</span></div>
            <div><span className="text-g400">Incoterms: </span><span className="font-bold text-blk">{customer.inco || '—'}</span></div>
            <div><span className="text-g400">Currency: </span><span className="font-bold text-blk">{customer.curr || 'INR'}</span></div>
            <div><span className="text-g400">CRM: </span><span className="font-bold text-blk">{customer.crm || '—'}</span></div>
          </div>

          {/* Contact persons — all of them (up to 5), primary first */}
          {profileContacts.length > 0 && (
            <div className="px-5 py-3 border-b border-g100">
              <div className="font-mono text-[8px] font-bold uppercase tracking-[1.5px] text-g400 mb-2">
                Contacts ({profileContacts.length})
              </div>
              <div className="space-y-2.5">
                {profileContacts.map(ct => (
                  <div key={ct.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-[13px] text-blk flex items-center gap-1.5">
                          {ct.name || <span className="text-g400 font-normal">(no name)</span>}
                          {ct === primaryContact && <span className="px-1 py-0.5 bg-red-50 border border-red-200 text-[8px] font-bold uppercase text-red-700 rounded">Primary</span>}
                        </div>
                        {ct.role && <div className="text-[11px] text-g500">{ct.role}</div>}
                      </div>
                      <div className="flex gap-1.5">
                        {ct.phone && (
                          <a href={`tel:${ct.phone}`} className="p-1.5 rounded bg-g100 hover:bg-g200 transition-colors" title="Call">
                            <Phone size={12} className="text-blk" />
                          </a>
                        )}
                        {ct.phone && (
                          <a href={`https://wa.me/${ct.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="p-1.5 rounded bg-green-50 hover:bg-green-100 transition-colors" title="WhatsApp">
                            <MessageCircle size={12} className="text-green-600" />
                          </a>
                        )}
                        {ct.email && (
                          <a href={`mailto:${ct.email}`} className="p-1.5 rounded bg-g100 hover:bg-g200 transition-colors" title="Email">
                            <Mail size={12} className="text-blk" />
                          </a>
                        )}
                      </div>
                    </div>
                    {[ct.phone, ...(ct.extraPhones ?? [])].filter(Boolean).length > 0 && (
                      <div className="text-[11px] text-g500 mt-0.5 font-mono">{[ct.phone, ...(ct.extraPhones ?? [])].filter(Boolean).join(', ')}</div>
                    )}
                    {[ct.email, ...(ct.extraEmails ?? [])].filter(Boolean).length > 0 && (
                      <div className="text-[11px] text-g400 mt-0.5 font-mono break-all">{[ct.email, ...(ct.extraEmails ?? [])].filter(Boolean).join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sites & Logistics */}
          {customer.sites.some(s => s.dispatchAddress || s.transporter || s.leadTimeNote) && (
            <div className="px-5 py-3 border-b border-g100">
              <div className="font-mono text-[8px] font-bold uppercase tracking-[1.5px] text-g400 mb-2 flex items-center gap-1.5">
                <Truck size={10} /> Sites &amp; Logistics
              </div>
              <div className="space-y-2">
                {customer.sites.filter(s => s.dispatchAddress || s.transporter || s.leadTimeNote).map(s => (
                  <div key={s.id} className="text-[11.5px] bg-g50 border border-g100 rounded-[3px] px-3 py-2 space-y-1">
                    <div className="font-semibold text-blk flex items-center gap-1.5">
                      <MapPin size={9} className="text-red-mrt" /> {s.name}
                      {s.city && <span className="text-g400 font-normal">· {s.city}</span>}
                    </div>
                    {s.dispatchAddress && (
                      <div className="text-g500 text-[10.5px] whitespace-pre-wrap">
                        <span className="font-bold text-g400 uppercase tracking-wide text-[9px]">Dispatch: </span>{s.dispatchAddress}
                      </div>
                    )}
                    {s.transporter && (
                      <div className="text-g500 text-[10.5px]">
                        <span className="font-bold text-g400 uppercase tracking-wide text-[9px]">Transporter: </span>{s.transporter}
                      </div>
                    )}
                    {s.leadTimeNote && (
                      <div className="text-g500 text-[10.5px]">
                        <span className="font-bold text-g400 uppercase tracking-wide text-[9px]">Note: </span>{s.leadTimeNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Expected Orders */}
          <div className="px-5 py-3 border-b border-g100">
            <div className="font-mono text-[8px] font-bold uppercase tracking-[1.5px] text-g400 mb-2 flex items-center gap-1.5">
              <Package size={10} /> Next Expected Orders
            </div>
            {(customer.nextOrders ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {(customer.nextOrders ?? []).map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-700 text-[11px] font-medium rounded-full">
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-[11.5px] text-g400 italic">No predictions yet</div>
            )}
          </div>

          {/* Customer Rating */}
          <div className="px-5 py-3 border-b border-g100">
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-[8px] font-bold uppercase tracking-[1.5px] text-g400 flex items-center gap-1.5">
                <Star size={10} /> Customer Rating
              </div>
              <button type="button" onClick={() => setEditRating(v => !v)} className="text-[10px] font-bold text-red-mrt uppercase hover:underline">
                {editRating ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editRating ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1">Tier</label>
                  <select title="Customer tier" value={tier} onChange={e => setTier(e.target.value as CustomerTier)}
                    className="h-7 px-2 text-[12px] border border-g300 rounded-[3px] bg-white outline-none focus:border-red-mrt">
                    {(['New','Bronze','Silver','Gold'] as CustomerTier[]).map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1">FY Turnover (₹)</label>
                  <input type="number" value={turnover} onChange={e => setTurnover(e.target.value)} placeholder="e.g. 1300000" aria-label="FY Turnover"
                    className="h-7 px-2 w-full text-[12px] border border-g300 rounded-[3px] bg-white outline-none focus:border-red-mrt" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1">Payment on Time (0–10)</label>
                  <input type="number" min={0} max={10} value={rp} onChange={e => setRp(Number(e.target.value))} placeholder="0" aria-label="Payment on time score"
                    className="h-7 px-2 w-20 text-[12px] border border-g300 rounded-[3px] bg-white outline-none focus:border-red-mrt" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1">Regular Orders (0–10)</label>
                  <input type="number" min={0} max={10} value={ro} onChange={e => setRo(Number(e.target.value))} placeholder="0" aria-label="Regular orders score"
                    className="h-7 px-2 w-20 text-[12px] border border-g300 rounded-[3px] bg-white outline-none focus:border-red-mrt" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1">Increasing Trend (0–10)</label>
                  <input type="number" min={0} max={10} value={rt} onChange={e => setRt(Number(e.target.value))} placeholder="0" aria-label="Increasing trend score"
                    className="h-7 px-2 w-20 text-[12px] border border-g300 rounded-[3px] bg-white outline-none focus:border-red-mrt" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1">Next Orders (comma-separated)</label>
                  <input type="text" value={nextOrders} onChange={e => setNextOrders(e.target.value)} placeholder="Terpineol, Pine Oil" aria-label="Next expected orders"
                    className="h-7 px-2 w-full text-[12px] border border-g300 rounded-[3px] bg-white outline-none focus:border-red-mrt" />
                </div>
                <Button size="sm" variant="primary" disabled={saving} onClick={handleSaveProfile}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  { label: 'Payment on Time', weight: '30%', score: customer.ratingPayment ?? 0 },
                  { label: 'Regular Orders',  weight: '40%', score: customer.ratingOrders ?? 0 },
                  { label: 'Increasing Trend',weight: '30%', score: customer.ratingTrend ?? 0 },
                ].map(({ label, weight, score }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <span className="text-[12px] text-blk font-medium">{label}</span>
                      <span className="ml-1.5 text-[10px] text-g400">({weight})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-g200 rounded-full overflow-hidden">
                        <div className="progress-bar-fill" style={{ width: `${score * 10}%` }} />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-blk w-4 text-right">{score}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 flex items-center gap-2">
                  <StarRating score={rating} />
                  <span className="font-mono text-[11px] font-bold text-blk">{rating}/100</span>
                </div>
              </div>
            )}
          </div>

          {/* Quote History */}
          <div className="px-5 py-3 border-b border-g100">
            <div className="font-mono text-[8px] font-bold uppercase tracking-[1.5px] text-g400 mb-2">
              Quote History ({customerQuotes.length})
            </div>
            {customerQuotes.length === 0 ? (
              <div className="text-[11.5px] text-g400 italic">No quotes yet.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {customerQuotes.slice(0, 5).map(q => (
                  <div key={q.id} className="flex items-center justify-between text-[11.5px] py-1 border-b border-g100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sQ text-[10.5px]">{q.id}</span>
                      <span className="text-g500">{q.date ? fmtIST(parseISO(q.date), 'dd-MMM-yy') : '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px]">{formatINR(q.items.reduce((s,i) => s + i.total, 0))}</span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        q.status === 'Won' ? 'bg-green-100 text-green-700' :
                        q.status === 'Lost' ? 'bg-red-50 text-red-500' :
                        q.status === 'Sent' ? 'bg-blue-50 text-blue-600' : 'bg-g100 text-g500'
                      }`}>{q.status}</span>
                    </div>
                  </div>
                ))}
                {customerQuotes.length > 5 && (
                  <button type="button" onClick={() => navigate('/quotes')} className="text-[10.5px] text-red-mrt font-bold flex items-center gap-1 mt-1 hover:underline">
                    +{customerQuotes.length - 5} more <ChevronRight size={11} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Contact / Follow-up History */}
          <div className="px-5 py-3">
            <div className="font-mono text-[8px] font-bold uppercase tracking-[1.5px] text-g400 mb-2">
              Contact History ({allLogs.length})
            </div>
            {allLogs.length === 0 ? (
              <div className="text-[11.5px] text-g400 italic">No interactions logged yet.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {allLogs.slice(0, 10).map((log, i) => (
                  <div key={i} className="flex gap-2.5 text-[11.5px]">
                    <div className="mt-0.5 shrink-0">{CHANNEL_ICON[log.channel] ?? <Phone size={11} />}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-blk">{log.channel}</span>
                        <span className="text-g400 text-[10px]">{fmtIST(parseISO(log.ts), 'dd-MMM-yy, HH:mm')}</span>
                        {log.who && <span className="text-g400 text-[10px]">by {log.who}</span>}
                        <span className="font-mono text-[9px] text-g300 bg-g100 px-1.5 rounded">{log.quoteId}</span>
                      </div>
                      {log.note && <p className="text-g600 mt-0.5 leading-snug">{log.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-g200 flex gap-2">
          <Button variant="primary" size="sm" onClick={() => navigate(`/quotes/new?cust=${encodeURIComponent(customer.name)}`)} className="flex-1">
            New Quote
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(isLead(customer) ? `/customers/leads/new?id=${customer.id}` : `/customers/new?id=${customer.id}`)} className="flex-1">
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Table columns / sorting ───────────────────────────────────────────────────

type SortKey = 'name' | 'contact' | 'phone' | 'seg' | 'tier' | 'turnover' | 'nextOrder';

interface ColDef { label: string; sortKey: SortKey | null; }
const COLUMNS: ColDef[] = [
  { label: 'Company',         sortKey: 'name' },
  { label: 'Primary Contact', sortKey: 'contact' },
  { label: 'Contact Number',  sortKey: 'phone' },
  { label: 'Industry',        sortKey: 'seg' },
  { label: 'Customer Type',   sortKey: 'tier' },
  { label: 'CRM',             sortKey: null },
  { label: 'Turnover',        sortKey: 'turnover' },
  { label: 'Next Order',      sortKey: 'nextOrder' },
  { label: 'Actions',         sortKey: null },
];

// ── Review mode (admins): clean up inactive Customer Master records ──────────
type ReviewGroup = 'A' | 'B' | 'C' | 'D' | 'E';
type ReviewKey = '' | 'all' | ReviewGroup;
const REVIEW_OPTIONS: { key: Exclude<ReviewKey, ''>; label: string }[] = [
  { key: 'all', label: 'Inactive — all' },
  { key: 'A', label: 'A · Open enquiry' },
  { key: 'B', label: 'B · Old customer, enquiry closed' },
  { key: 'C', label: 'C · Sample sent, no enquiry' },
  { key: 'D', label: 'D · App-created, no activity' },
  { key: 'E', label: 'E · Old list, no activity' },
];
const REVIEW_OPEN_ENQ = ['New', 'In Review', 'Quoted', 'Sample'];
const REVIEW_CLOSED_ENQ = ['Not Qualified', 'Lost', 'Parked'];

// Returns a comparable value for a given customer + sort key.
function sortValue(c: Customer, key: SortKey): string | number {
  switch (key) {
    case 'name':      return c.name?.toLowerCase() ?? '';
    case 'contact':   return getPrimaryContact(c)?.name?.toLowerCase() ?? '';
    case 'phone':     return getPrimaryContact(c)?.phone?.toLowerCase() ?? '';
    case 'seg':       return c.seg?.toLowerCase() ?? '';
    case 'tier': {
      const order: Record<string, number> = { New: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
      return order[c.tier ?? 'New'] ?? 0;
    }
    case 'turnover':  return c.turnover ?? 0;
    case 'nextOrder': return (c.nextOrders ?? [])[0]?.toLowerCase() ?? '';
  }
}

// ── CSV import (shared by Customer Master and Customer Lead) ─────────────────

// Parses customer CSV rows (grouped by company name; names that already
// exist — customer or lead — are skipped) and saves each company. With
// status 'lead' they're saved as Customer Leads (LEAD-… ids).
export async function importCustomerCsvRows(
  rows: Record<string, string>[],
  opts: { customers: Customer[]; addCustomer: (c: Customer) => Promise<unknown>; status: CustomerStatus },
): Promise<{ imported: number; skipped: number; invalidGstins: string[] }> {
  // Flexible column accessor — case-insensitive, trimmed, first match wins
  const col = (row: Record<string, string>, ...keys: string[]): string => {
    for (const k of keys) {
      const found = Object.keys(row).find(h => h.trim().toLowerCase() === k.toLowerCase());
      if (found && row[found]?.trim()) return row[found].trim();
    }
    return '';
  };

  // GSTIN from the sheet: cleaned (case, spaces, dots, dashes, look-alike
  // letters). Blank / URP / a valid GSTIN is kept; anything else is imported
  // BLANK and reported in the import summary.
  const invalidGstins = new Set<string>();
  const importGstin = (row: Record<string, string>): string => {
    const raw = col(row, 'GST No.', 'GST No', 'GSTIN', 'gstin');
    const g = cleanGstin(raw);
    if (!g || g === 'URP' || isValidGstin(g)) return g;
    invalidGstins.add(`${col(row, 'Company Name', 'company name', 'Company', 'name', 'Name') || '(no name)'}: ${raw}`);
    return '';
  };

  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`.toUpperCase();

  // Build one site from a row, appending extra fields into fullAddress
  const buildSite = (row: Record<string, string>, isPrimary: boolean) => {
    const address = col(row, 'Address');
    const extras: string[] = [];
    const transport = col(row, 'Transport');
    if (transport) extras.push(`Transport: ${transport}`);
    const plant = col(row, 'Plant Name', 'Plant');
    if (plant) extras.push(`Plant: ${plant}`);
    const lead = col(row, 'Avg transport lead time', 'Lead time');
    if (lead) extras.push(`Lead time: ${lead} days`);
    const remarks = col(row, 'Remarks');
    if (remarks) extras.push(`Remarks: ${remarks}`);
    const fullAddress = [address, ...extras].filter(Boolean).join('\n');

    // Extract city from first line of address
    const city = address.split(/[\n,]/)[0].trim() || col(row, 'City', 'city');

    // Build contacts for this site
    const contacts: any[] = [];
    const purchaseName = col(row, 'Purchase Id', 'Purchase Name');
    const purchasePhone = col(row, 'Purchase Ph.', 'Purchase Phone');
    if (purchaseName || purchasePhone) {
      contacts.push({
        id: uid(), name: purchaseName || 'Purchase Contact',
        role: 'Purchase', email: '', phone: purchasePhone,
        isPrimary: contacts.length === 0,
      });
    }
    const storePerson = col(row, 'Store Contact Person', 'Store Contact');
    const storeEmail = col(row, 'Store Email');
    const storePhone = col(row, 'Store Ph.', 'Store Phone');
    if (storePerson || storeEmail || storePhone) {
      contacts.push({
        id: uid(), name: storePerson || 'Store Contact',
        role: 'Store', email: storeEmail, phone: storePhone,
        isPrimary: contacts.length === 0,
      });
    }
    const dispatchEmail = col(row, 'Email for dispatch intimation', 'Dispatch Email');
    if (dispatchEmail) {
      contacts.push({
        id: uid(), name: 'Dispatch',
        role: 'Dispatch', email: dispatchEmail, phone: '',
        isPrimary: contacts.length === 0,
      });
    }
    // Generic contact fallback
    const contactName = col(row, 'Contact Name', 'contact_name');
    if (contactName && contacts.length === 0) {
      contacts.push({
        id: uid(), name: contactName,
        role: col(row, 'contact_role') || 'Contact',
        email: col(row, 'Contact Email', 'contact_email'),
        phone: col(row, 'Contact Phone', 'contact_phone'),
        isPrimary: true,
      });
    }

    const siteId = col(row, 'Customer ID', 'customer id')
      ? `SITE_${col(row, 'Customer ID', 'customer id').replace(/[^A-Z0-9]/gi, '')}_${uid()}`
      : `SITE_${uid()}`;

    return {
      id: siteId,
      name: col(row, 'Unit', 'Site Name', 'site_name') || 'Head Office',
      city,
      address,
      fullAddress,
      gstin: importGstin(row),
      isPrimary,
      contacts,
    };
  };

  // Group rows by company name (case-insensitive)
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const companyName = col(row, 'Company Name', 'company name', 'Company', 'name', 'Name');
    if (!companyName) continue;
    const key = companyName.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const existingNames = new Set(opts.customers.map(c => c.name.toLowerCase().trim()));
  const existingIds   = opts.customers.map(c => c.id);
  const existingCodes = opts.customers.map(c => c.code);
  const asLead = opts.status === 'lead';

  let imported = 0;
  let skipped = 0;

  for (const [, groupRows] of groups) {
    const firstRow = groupRows[0];
    const companyName = col(firstRow, 'Company Name', 'company name', 'Company', 'name', 'Name');

    // Dedup — skip if already exists
    if (existingNames.has(companyName.toLowerCase().trim())) {
      skipped++;
      continue;
    }

    // Use sheet's Customer ID if valid, else generate
    const sheetId = col(firstRow, 'Customer ID', 'customer id', 'CUST ID');
    // Leads always get a fresh LEAD-YYYY-NNN id (the sheet's id is only used for customers).
    const custId = asLead
      ? generateId('LEAD', existingIds)
      : (sheetId && !existingIds.includes(sheetId))
        ? sheetId
        : generateId('CUST', [...existingIds, ...Array.from({length: imported}, (_, i) => `CUST-0-${i}`)]);
    const custCode = generateId('CUS', [...existingCodes, ...Array.from({length: imported}, (_, i) => `CUS-0-${i}`)]);

    const sites = groupRows.map((row, idx) => buildSite(row, idx === 0));

    const customer: Customer = {
      id: custId,
      code: custCode,
      name: companyName,
      seg: col(firstRow, 'Segment', 'seg', 'Seg') || 'General',
      gstin: importGstin(firstRow),
      pan: panFromGstin(importGstin(firstRow)) || undefined,
      inco: col(firstRow, 'Incoterms', 'inco') || 'FOR',
      curr: col(firstRow, 'Currency', 'curr') || 'INR',
      pay: col(firstRow, 'Payment Terms', 'Payment', 'pay') || '',
      tier: 'New',
      sites,
      ...(asLead ? {
        customerStatus: 'lead' as const,
        pay: col(firstRow, 'Payment Terms', 'Payment', 'pay') || '100% Advance',
        creditLimit: 0,
      } : {}),
    };

    await opts.addCustomer(customer);
    existingIds.push(custId);
    existingCodes.push(custCode);
    existingNames.add(companyName.toLowerCase().trim());
    imported++;
  }
  return { imported, skipped, invalidGstins: Array.from(invalidGstins) };
}

// ── Main Customers page ───────────────────────────────────────────────────────

export function Customers() {
  const { data, user, addCustomer, updateCustomer, deleteCustomer, globalSearchQuery } = useAppStore() as any;
  const canDelete = canDeleteRecords(user?.email);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => params.get('q') ?? '');
  const segFilter   = params.get('seg') ?? '';
  const tierFilter  = params.get('tier') ?? '';
  const setSegFilter   = (v: string) => setParams(p => { const n = new URLSearchParams(p); v ? n.set('seg', v) : n.delete('seg'); return n; }, { replace: true });
  const setTierFilter  = (v: string) => setParams(p => { const n = new URLSearchParams(p); v ? n.set('tier', v) : n.delete('tier'); return n; }, { replace: true });
  const [importing, setImporting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [bulkFixes, setBulkFixes] = useState<SiteFix[] | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  // Review mode (admins only): '' = normal list, 'all' = every inactive
  // customer, 'A'…'E' = one clean-up group (see REVIEW_OPTIONS).
  const [review, setReviewState] = useState<ReviewKey>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const setReview = (v: ReviewKey) => { setReviewState(v); setSelectedIds(new Set()); };
  // KEEP = "reviewed, leave it in Customer Master" — saved on the customer
  // itself (customers.reviewed_at / reviewed_by), so every admin sees it.
  const isKept = (c: Customer) => !!c.reviewedAt;
  const [keeping, setKeeping] = useState(false);
  // The earlier per-browser list is no longer used — clear it if it's there.
  useEffect(() => { try { localStorage.removeItem('customerReviewKept'); } catch { /* storage unavailable */ } }, []);
  const [showKept, setShowKept] = useState(false);
  // Samples aren't part of the store's data — loaded here for the Review
  // groups (admins only), linked like every other document.
  const [reviewSamples, setReviewSamples] = useState<{ cust: string; customerId?: string }[]>([]);
  useEffect(() => {
    if (!canDelete) return;
    supabase.from('samples').select('cust, customer_id').then(({ data: rows }) => {
      setReviewSamples((rows ?? []).map((r: any) => ({ cust: r.cust ?? '', customerId: r.customer_id ?? undefined })));
    });
  }, [canDelete]);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const showToast = (type: 'ok' | 'err', msg: string, ms = 4000) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), ms);
  };

  // One-off success toast from "Save & Promote" on the Promote to Customer
  // form (router state). Cleared from history so a refresh won't repeat it.
  const location = useLocation();
  const [arrivalToast, setArrivalToast] = useState<string | null>(() => (location.state as { toast?: string } | null)?.toast ?? null);
  // After Promote / Merge: open that customer's profile.
  const [arrivalProfileId] = useState<string | null>(() => (location.state as { openProfile?: string } | null)?.openProfile ?? null);
  useEffect(() => {
    if (!arrivalProfileId) return;
    const c = data.customers.find((x: Customer) => x.id === arrivalProfileId);
    if (c) setSelectedCustomer(c);
  }, [arrivalProfileId, data.customers]);
  useEffect(() => {
    if (!arrivalToast && !arrivalProfileId) return;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    if (!arrivalToast) return;
    const t = setTimeout(() => setArrivalToast(null), 5000);
    return () => clearTimeout(t);
  }, []);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Seed/sync local search from global Topbar query (one-way: global → local only)
  useEffect(() => { setSearchQuery(globalSearchQuery); }, [globalSearchQuery]);

  const handleDeleteCustomer = async (c: Customer) => {
    const enqCount   = data.enquiries.filter((e: any) => isDocOfCustomer(e, c)).length;
    const quoteCount = data.quotes.filter((q: any) => isDocOfCustomer(q, c)).length;
    const orderCount = data.orders.filter((o: any) => isDocOfCustomer(o, c)).length;
    const linkedParts: string[] = [];
    if (enqCount   > 0) linkedParts.push(`${enqCount} enquir${enqCount === 1 ? 'y' : 'ies'}`);
    if (quoteCount > 0) linkedParts.push(`${quoteCount} quote${quoteCount === 1 ? '' : 's'}`);
    if (orderCount > 0) linkedParts.push(`${orderCount} order${orderCount === 1 ? '' : 's'}`);
    const warning = linkedParts.length > 0
      ? `\n\nWarning: This customer has ${linkedParts.join(', ')} linked — deleting will not remove those records but they will lose their customer reference.`
      : '';
    if (!confirm(`Are you sure you want to delete "${c.name}"? This action cannot be undone.${warning}`)) return;
    try {
      await deleteCustomer(c.id);
      if (selectedCustomer?.id === c.id) setSelectedCustomer(null);
    } catch (err: any) {
      alert(`Delete failed: ${err?.message || JSON.stringify(err)}`);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as Record<string, string>[];
          const { imported, skipped, invalidGstins } = await importCustomerCsvRows(rows, { customers: data.customers, addCustomer, status: 'customer' });

          const gstinNote = invalidGstins.length
            ? `\n\n${invalidGstins.length} invalid GSTIN${invalidGstins.length === 1 ? '' : 's'} imported BLANK — please correct in the customer form:\n${invalidGstins.join('\n')}`
            : '';
          alert(`Import complete: ${imported} customers added, ${skipped} skipped (already exist).${gstinNote}`);
        } catch (err) {
          alert('Import failed: ' + (err as Error).message);
        } finally {
          setImporting(false);
          e.target.value = '';
        }
      },
    });
  };

  // Customer Master = customer_status 'customer' only. Leads (small /
  // IndiaMART buyers) have their own page at /customers/leads — they're
  // left out of every count, filter and tool here except Find Duplicates.
  const masters: Customer[] = data.customers.filter((c: Customer) => !isLead(c));
  const leadCount = data.customers.length - masters.length;

  // Clean-up tools (admins only — canDeleteRecords). Quotes / orders link to a
  // customer by company NAME (trimmed, case-insensitive), like the rest of the app.
  // (customer_id first; the name is only the fallback for documents without one.)
  const quotesByCustomer = groupDocsByCustomer(data.quotes as { cust: string; customerId?: string }[], masters);
  const ordersByCustomer = groupDocsByCustomer(data.orders as { cust: string; customerId?: string }[], masters);
  const quoteCountOf = (c: Customer) => (quotesByCustomer.get(c.id) ?? []).length;
  const orderCountOf = (c: Customer) => (ordersByCustomer.get(c.id) ?? []).length;

  // ── Review mode ──
  // Inactive = no quotes, no orders (ANY quote / order counts as activity,
  // Lost ones too) and last FY turnover = 0. Each inactive customer falls
  // into at most one group; the rest only show under "Inactive — all".
  const reviewOn = canDelete && review !== '';
  const enquiriesByCustomer = groupDocsByCustomer(data.enquiries as { cust: string; customerId?: string; status: string; recv: string }[], masters);
  const samplesByCustomer = groupDocsByCustomer(reviewSamples, masters);
  const enquiriesOf = (c: Customer) => enquiriesByCustomer.get(c.id) ?? [];
  const sampleCountOf = (c: Customer) => (samplesByCustomer.get(c.id) ?? []).length;
  const isInactive = (c: Customer) => quoteCountOf(c) === 0 && orderCountOf(c) === 0 && !(Number(c.turnover) > 0);
  const reviewGroupOf = (c: Customer): ReviewGroup | null => {
    const enqs = enquiriesOf(c);
    const oldId = /^C/i.test(c.id) && !c.id.startsWith('CUST-');   // imported list: C329 …
    if (enqs.some(e => REVIEW_OPEN_ENQ.includes(e.status))) return 'A';
    if (enqs.length > 0) return oldId && enqs.every(e => REVIEW_CLOSED_ENQ.includes(e.status)) ? 'B' : null;
    if (sampleCountOf(c) > 0) return 'C';
    if (c.id.startsWith('CUST-')) return 'D';
    return oldId ? 'E' : null;
  };
  const inReview = (c: Customer, key: ReviewKey) =>
    isInactive(c) && (showKept || !isKept(c)) && (key === 'all' || reviewGroupOf(c) === key);
  const reviewCounts: Record<string, number> = {};
  if (canDelete) for (const o of REVIEW_OPTIONS) reviewCounts[o.key] = masters.filter(c => inReview(c, o.key)).length;
  const keptInactiveCount = canDelete ? masters.filter(c => isKept(c) && isInactive(c)).length : 0;

  const toggleSelected = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectedCustomers = masters.filter(c => selectedIds.has(c.id));

  // KEEP / Un-keep the ticked rows: reviewed_at + reviewed_by set (or both
  // cleared) on each customer, nothing else touched. One at a time so each
  // gets its own History Log entry (updateCustomer logs it).
  const handleKeep = async (keep: boolean) => {
    if (!canDelete || keeping) return;
    const targets = selectedCustomers.filter(c => isKept(c) !== keep);
    setKeeping(true);
    const failed: string[] = [];
    let done = 0;
    for (const c of targets) {
      try {
        await updateCustomer(c.id, keep
          ? { reviewedAt: new Date().toISOString(), reviewedBy: user?.email ?? undefined }
          : { reviewedAt: undefined, reviewedBy: undefined });
        done++;
      } catch (err) {
        console.error('Keep failed:', c.id, err);
        failed.push(c.name);
      }
    }
    setKeeping(false);
    setSelectedIds(new Set());
    const msg = keep ? `${done} kept in Customer Master — hidden from Review.` : `${done} back in Review.`;
    showToast(failed.length ? 'err' : 'ok', failed.length ? `${msg} Failed — ${failed.join(', ')}` : msg, failed.length ? 12000 : 4000);
  };

  const filteredCustomers = masters.filter(c => {
    if (reviewOn && !inReview(c, review)) return false;
    if (searchQuery) {
      const q = normalizeSearchText(searchQuery);
      if (!normalizeSearchText(c.name ?? '').includes(q) && !contactMatchesQuery(c, searchQuery)) return false;
    }
    if (segFilter && c.seg !== segFilter) return false;
    if (tierFilter && (c.tier ?? 'New') !== tierFilter) return false;
    return true;
  }).sort((a, b) => {
    const va = sortValue(a, sortKey);
    const vb = sortValue(b, sortKey);
    let cmp: number;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb), 'en', { sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });
  // Second stable pass: name-starts-with first, name-contains second, other-field match last.
  // Kept separate from the column sort above so the column order is preserved as the within-tier tiebreaker.
  if (searchQuery) filteredCustomers.sort((a, b) => nameTier(a.name ?? '', searchQuery) - nameTier(b.name ?? '', searchQuery));

  const segments = Array.from(new Set(masters.map(c => c.seg).filter(Boolean))).sort();

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">

      {/* Page header */}
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Customer Relation Management</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Customer <em className="italic text-red-mrt">Master</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">{masters.length} customers · Click a row to view profile & history</p>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <Button variant="secondary" className="gap-2 border-lead bg-lead-bg text-lead-text hover:border-lead hover:bg-lead/15" onClick={() => navigate('/customers/leads')}>
              Customer Lead
              <span className="min-w-[18px] h-[16px] px-1 rounded-full bg-lead text-white text-[9px] leading-none inline-flex items-center justify-center tracking-normal">{leadCount}</span>
            </Button>
            <Button variant="secondary" className="gap-2" onClick={() => setShowDuplicates(true)}>
              <Copy size={14} className="stroke-2" /> Find Duplicates
            </Button>
            <Button variant="secondary" className="gap-2" onClick={() => { setBulkDone(false); setBulkFixes(detectAllFixes(masters)); }}>
              <Wand2 size={14} className="stroke-2" /> Fix All Addresses
            </Button>
            <Button variant="dark" className="gap-2 relative" disabled={importing}>
              <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer w-full" onChange={handleImport} title="Import CSV" />
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} className="stroke-2" />}
              Import CSV
            </Button>
            <Button onClick={() => navigate('/customers/new')} variant="primary" className="gap-2">
              <Plus size={14} className="stroke-2" /> Add Customer
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-2">
        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[220px] focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input type="text" placeholder="Company name…" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400" />
          {searchQuery && (
            <button type="button" title="Clear search" onClick={() => setSearchQuery('')} className="text-g400 hover:text-blk transition-colors shrink-0">
              <X size={11} />
            </button>
          )}
        </div>

        <select title="Filter by segment" value={segFilter} onChange={e => setSegFilter(e.target.value)}
          className="select-filter font-sans text-xs text-blk bg-white border border-g200 rounded py-1 pl-2 pr-6 cursor-pointer outline-none appearance-none">
          <option value="">All Segments</option>
          {segments.map(o => <option key={o}>{o}</option>)}
        </select>

        <select title="Filter by tier" value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="select-filter font-sans text-xs text-blk bg-white border border-g200 rounded py-1 pl-2 pr-6 cursor-pointer outline-none appearance-none">
          <option value="">All Tiers</option>
          {(['New','Bronze','Silver','Gold'] as CustomerTier[]).map(t => <option key={t}>{t}</option>)}
        </select>

        {canDelete && (
          <select title="Review — clean up inactive customers (no quotes, no orders, no last-FY turnover)" value={review} onChange={e => setReview(e.target.value as ReviewKey)}
            className={`select-filter font-sans text-xs border rounded py-1 pl-2 pr-6 cursor-pointer outline-none appearance-none ${reviewOn ? 'border-lead bg-lead-bg text-lead-text font-semibold' : 'border-g200 bg-white text-blk'}`}>
            <option value="">Review: All</option>
            {REVIEW_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label} ({reviewCounts[o.key] ?? 0})</option>)}
          </select>
        )}
        {reviewOn && (
          <label className="flex items-center gap-1.5 font-sans text-xs text-g600 cursor-pointer whitespace-nowrap" title="Customers marked KEEP (reviewed)">
            <input type="checkbox" checked={showKept} onChange={e => { setShowKept(e.target.checked); setSelectedIds(new Set()); }} />
            Show kept ({keptInactiveCount})
          </label>
        )}

        {(searchQuery || segFilter || tierFilter || reviewOn) && (
          <button type="button" onClick={() => { setParams({}, { replace: true }); setSearchQuery(''); setReview(''); }}
            className="flex items-center gap-1 font-mono text-[10px] text-g500 hover:text-red-mrt border border-g200 hover:border-red-lt rounded px-2 h-7 transition-colors whitespace-nowrap">
            <X size={10} /> Clear filters
          </button>
        )}

        <div className="ml-auto font-mono text-[10px] text-g500">{filteredCustomers.length} records</div>
      </div>

      {/* Table */}
      <div className="px-6 pb-7 pt-[14px] flex-1 min-h-0 flex flex-col">
        <div className="bg-white border border-g200 overflow-auto flex-1 min-h-0">
          <table className="min-w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {/* Review mode: select every row currently shown */}
                {reviewOn && (
                  <th className="sticky top-0 z-10 bg-g100 px-[13px] py-[9px] w-8 border-b border-g200 shadow-[0_1px_0_0_theme(colors.g200)]">
                    <input type="checkbox" title="Select all on this page"
                      checked={filteredCustomers.length > 0 && filteredCustomers.every(c => selectedIds.has(c.id))}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(filteredCustomers.map(c => c.id)) : new Set())} />
                  </th>
                )}
                {COLUMNS.map(col => {
                  const active = col.sortKey && sortKey === col.sortKey;
                  return (
                    <React.Fragment key={col.label}>
                    {reviewOn && col.label === 'Actions' && ['Enquiries', 'Samples'].map(label => (
                      <th key={label} className="sticky top-0 z-10 bg-g100 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200 shadow-[0_1px_0_0_theme(colors.g200)] text-lead-text">{label}</th>
                    ))}
                    <th
                      onClick={col.sortKey ? () => toggleSort(col.sortKey!) : undefined}
                      className={`sticky top-0 z-10 bg-g100 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200 shadow-[0_1px_0_0_theme(colors.g200)] ${col.sortKey ? 'cursor-pointer select-none hover:bg-g200 transition-colors' : ''} ${active ? 'text-red-mrt' : 'text-g500'}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.sortKey && (
                          active
                            ? (sortDir === 'asc' ? <ChevronUp size={11} className="stroke-[2.5]" /> : <ChevronDown size={11} className="stroke-[2.5]" />)
                            : <ChevronsUpDown size={11} className="text-g300 stroke-2" />
                        )}
                      </span>
                    </th>
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr><td colSpan={reviewOn ? 12 : 9} className="text-center p-8 text-g400 text-[13px]">No customers match</td></tr>
              ) : filteredCustomers.map((c, idx) => {
                const contact = getPrimaryContact(c);
                const rating  = computeRating(c);
                const nextProd = (c.nextOrders ?? [])[0];
                const moreNext = (c.nextOrders ?? []).length - 1;

                const isExpanded = expandedRow === c.id;
                return (
                  <React.Fragment key={`${c.id}-${idx}`}>
                  <tr
                    className={`transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-red-mrt/5 ${isExpanded ? 'bg-red-mrt/5' : ''}`}
                    onClick={() => setExpandedRow(isExpanded ? null : c.id)}
                  >
                    {reviewOn && (
                      <td className="px-[13px] py-[11px] align-middle w-8" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" title="Select" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} />
                      </td>
                    )}
                    {/* Company */}
                    <td className="px-[13px] py-[11px] align-middle">
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={c.name} />
                        <div>
                          <div className="font-semibold text-blk leading-snug">{c.name}
                            {reviewOn && isKept(c) && <span className="ml-1.5 px-1.5 py-[1px] rounded-[3px] border border-g300 bg-g100 text-g500 font-mono text-[8.5px] font-bold uppercase tracking-wide align-middle">Kept</span>}
                          </div>
                          <TierBadge tier={c.tier} />
                        </div>
                      </div>
                    </td>

                    {/* Primary contact */}
                    <td className="px-[13px] py-[11px] align-middle max-w-[170px]">
                      {contact ? (
                        <div className="min-w-0">
                          <div className="font-medium text-blk truncate">{contact.name}</div>
                          {contact.email && <div className="text-[10.5px] text-g400 font-mono truncate" title={contact.email}>{contact.email}</div>}
                        </div>
                      ) : <span className="text-g300">—</span>}
                    </td>

                    {/* Contact Number */}
                    <td className="px-[13px] py-[11px] align-middle">
                      {contact?.phone
                        ? <span className="font-mono text-[11px] text-g600">{contact.phone}</span>
                        : <span className="text-g300">—</span>}
                    </td>

                    {/* Industry */}
                    <td className="px-[13px] py-[11px] align-middle text-g600">{c.seg || '—'}</td>

                    {/* Customer Type */}
                    <td className="px-[13px] py-[11px] align-middle text-g600">
                      {c.customerType || '—'}
                    </td>

                    {/* CRM */}
                    <td className="px-[13px] py-[11px] align-middle text-g600">
                      {c.crm || '—'}
                    </td>

                    {/* Turnover */}
                    <td className="px-[13px] py-[11px] align-middle">
                      <span className="inline-flex items-center px-2 py-0.5 bg-g100 border border-g200 rounded-[3px] font-mono text-[11px] font-bold text-g600">
                        {formatTurnover(c.turnover)}
                      </span>
                    </td>

                    {/* Next order */}
                    <td className="px-[13px] py-[11px] align-middle text-[11.5px]">
                      {nextProd ? (
                        <div>
                          <span className="text-blk font-medium">{nextProd}</span>
                          {moreNext > 0 && <span className="ml-1 text-g400 text-[10px]">+{moreNext} more</span>}
                        </div>
                      ) : <span className="text-g300">—</span>}
                    </td>

                    {/* Review mode: enquiries (count + latest status) and samples */}
                    {reviewOn && (() => {
                      const enqs = enquiriesOf(c);
                      const latest = enqs.reduce<typeof enqs[number] | null>((a, e) => (!a || (e.recv || '') > (a.recv || '') ? e : a), null);
                      const samples = sampleCountOf(c);
                      return (
                        <>
                          <td className="px-[13px] py-[11px] align-middle whitespace-nowrap">
                            {enqs.length === 0 ? <span className="text-g300">—</span> : (
                              <span className="font-mono text-[11px] text-g600">{enqs.length}<span className="text-g400"> · {latest?.status}</span></span>
                            )}
                          </td>
                          <td className="px-[13px] py-[11px] align-middle font-mono text-[11px] text-g600">
                            {samples || <span className="text-g300">—</span>}
                          </td>
                        </>
                      );
                    })()}

                    {/* Actions */}
                    <td className="px-[13px] py-[11px] align-middle" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setSelectedCustomer(c)}>Profile</Button>
                          <Button size="sm" variant="secondary" onClick={() => navigate(`/customers/new?id=${c.id}`)}>
                            <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </Button>
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="primary" onClick={() => navigate(`/quotes/new?cust=${encodeURIComponent(c.name)}`)}>Quote</Button>
                          {canDelete && (
                            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(ev) => { ev.stopPropagation(); handleDeleteCustomer(c); }}>Delete</Button>
                          )}
                        </div>
                        {(c.modifiedBy || c.createdBy) && (
                          <span className="text-[10px] font-mono text-g400 whitespace-nowrap ml-0.5">{c.modifiedBy || c.createdBy}</span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-red-mrt/[0.02] border-b-2 border-red-mrt">
                      <td colSpan={reviewOn ? 12 : 9} className="p-0">
                        <div className="p-[10px_16px]">
                          <div className="text-[9px] font-mono font-bold uppercase tracking-[1.5px] text-red-mrt mb-2 flex items-center gap-1.5">
                            <MapPin size={10} /> Main Office
                          </div>
                          {c.sites.length === 0 ? (
                            <div className="text-[12px] text-g400 py-2">No sites linked to this customer.</div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {c.sites.map(s => (
                                <div key={s.id} className="bg-white border border-g200 rounded-[3px] px-3 py-2.5 text-[11.5px] space-y-1">
                                  <div className="flex items-center gap-1.5 font-semibold text-blk">
                                    <MapPin size={9} className="text-red-mrt shrink-0" />
                                    {s.name}
                                    {s.isPrimary && (
                                      <span className="px-1 py-0.5 bg-red-50 border border-red-200 text-[8px] font-bold uppercase text-red-700 rounded">Primary</span>
                                    )}
                                  </div>
                                  {(s.city || s.state) && (
                                    <div className="text-g500">{[s.city, s.state].filter(Boolean).join(', ')}</div>
                                  )}
                                  {s.gstin && (
                                    <div className="font-mono text-[10.5px] text-g600">GSTIN: {s.gstin}</div>
                                  )}
                                  {s.transporter && (
                                    <div className="text-g500">Transport: {s.transporter}</div>
                                  )}
                                  {s.leadTimeNote && (
                                    <div className="text-g500">Lead time: {s.leadTimeNote}</div>
                                  )}
                                  {s.contacts.length > 0 && (
                                    <div className="text-[10.5px] text-g400 pt-0.5 border-t border-g100">
                                      {s.contacts.length} contact{s.contacts.length > 1 ? 's' : ''}
                                      {s.contacts.find(ct => ct.isPrimary)?.name ? ` · ${s.contacts.find(ct => ct.isPrimary)!.name}` : ''}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {arrivalToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-[4px] shadow-lg text-[12.5px] font-medium text-white bg-sW animate-in slide-in-from-bottom-2">
          <CheckCircle2 size={14} />
          {arrivalToast}
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 max-w-[560px] flex items-start gap-2 px-4 py-2.5 rounded-[4px] shadow-lg text-[12.5px] font-medium text-white animate-in slide-in-from-bottom-2 ${toast.type === 'ok' ? 'bg-sW' : 'bg-red-mrt'}`}>
          {toast.type === 'ok' && <CheckCircle2 size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Review mode: bar for the ticked rows */}
      {reviewOn && selectedCustomers.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-blk text-white rounded-[4px] shadow-2xl px-4 py-2.5 animate-in slide-in-from-bottom-2">
          <span className="text-[12.5px] font-medium whitespace-nowrap">{selectedCustomers.length} selected —</span>
          {selectedCustomers.some(c => !isKept(c)) && (
            <Button size="sm" variant="secondary" title="Reviewed — leave in Customer Master and hide from Review" disabled={keeping} onClick={() => handleKeep(true)}>{keeping ? "Saving…" : "Keep"}</Button>
          )}
          {selectedCustomers.some(c => isKept(c)) && (
            <Button size="sm" variant="secondary" title="Put back into Review" disabled={keeping} onClick={() => handleKeep(false)}>Un-keep</Button>
          )}
          <button type="button" onClick={() => setSelectedIds(new Set())} className="font-mono text-[10px] uppercase tracking-[1px] text-white/70 hover:text-white">Clear</button>
        </div>
      )}

      {/* Customer profile panel */}
      {selectedCustomer && (
        <CustomerPanel
          customer={data.customers.find(c => c.id === selectedCustomer.id) ?? selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* Duplicate review overlay */}
      {showDuplicates && (
        <DuplicateReviewPanel
          customers={data.customers}
          updateCustomer={updateCustomer}
          deleteCustomer={deleteCustomer}
          onClose={() => setShowDuplicates(false)}
        />
      )}

      {/* Bulk Fix All Addresses modal */}
      {bulkFixes !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-[8px] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-g200 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className="text-sW" />
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-sW">Fix All Addresses</span>
                </div>
                <p className="text-[12px] text-g500 mt-0.5">
                  {bulkFixes.length === 0
                    ? 'No mixed addresses detected — all sites are already clean.'
                    : `${bulkFixes.length} site${bulkFixes.length > 1 ? 's' : ''} with mixed address content detected`}
                </p>
              </div>
              <button type="button" title="Close" onClick={() => setBulkFixes(null)} className="text-g400 hover:text-blk p-1">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {bulkDone ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 size={36} className="text-emerald-500 mb-3" />
                  <div className="font-bold text-blk text-[15px]">All done!</div>
                  <div className="text-g500 text-[12px] mt-1">Address fields have been split and saved.</div>
                </div>
              ) : bulkFixes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 size={36} className="text-emerald-400 mb-3" />
                  <div className="text-g500 text-[13px]">Nothing to fix — all site addresses look clean.</div>
                </div>
              ) : (
                bulkFixes.map((fix, i) => (
                  <div key={fix.siteId} className="border border-g200 rounded-[6px] overflow-hidden">
                    <div className="bg-g50 px-3 py-2 flex items-center gap-2">
                      <MapPin size={12} className="text-g400" />
                      <span className="font-bold text-[12px] text-blk">{fix.customerName}</span>
                      <span className="text-g400 text-[11px]">· {fix.currentSiteName}</span>
                      <span className="ml-auto text-[10px] text-g400 font-mono">#{i + 1}</span>
                    </div>
                    <div className="px-3 py-2.5 space-y-1.5 text-[11px]">
                      <div>
                        <span className="font-bold text-g500">Clean address: </span>
                        <span className="text-blk whitespace-pre-wrap">{fix.parsed.cleanAddress || '—'}</span>
                      </div>
                      {fix.parsed.siteName && (
                        <div><span className="font-bold text-g500">→ Site name: </span><span className="text-blk">{fix.parsed.siteName}</span>{fix.currentSiteName && fix.currentSiteName !== (data.customers.find(c=>c.id===fix.customerId)?.sites.find(s=>s.id===fix.siteId)?.city) && <span className="text-amber-600 text-[10px] ml-1">(site already named — will skip)</span>}</div>
                      )}
                      {fix.parsed.dispatchHint && (
                        <div><span className="font-bold text-g500">→ Dispatch: </span><span className="text-blk whitespace-pre-wrap">{fix.parsed.dispatchHint}</span>{fix.currentDispatch && <span className="text-amber-600 text-[10px] ml-1">(field not empty — will skip)</span>}</div>
                      )}
                      {fix.parsed.transporter && (
                        <div><span className="font-bold text-g500">→ Transporter: </span><span className="text-blk">{fix.parsed.transporter}</span>{fix.currentTransporter && <span className="text-amber-600 text-[10px] ml-1">(field not empty — will skip)</span>}</div>
                      )}
                      {fix.parsed.leadTimeNote && (
                        <div><span className="font-bold text-g500">→ Lead time: </span><span className="text-blk">{fix.parsed.leadTimeNote}</span>{fix.currentLeadTime && <span className="text-amber-600 text-[10px] ml-1">(field not empty — will skip)</span>}</div>
                      )}
                      {fix.parsed.gstin && (
                        <div><span className="font-bold text-g500">→ GSTIN: </span><span className="text-blk font-mono">{fix.parsed.gstin}</span>{fix.currentDispatch && <span className="text-amber-600 text-[10px] ml-1">(field not empty — will skip)</span>}</div>
                      )}
                      {fix.parsed.phones.length > 0 && (
                        <div><span className="font-bold text-g500">→ Phone(s): </span><span className="text-blk font-mono">{fix.parsed.phones.join(', ')}</span><span className="text-g400 text-[10px] ml-1">(→ primary contact)</span></div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {!bulkDone && bulkFixes.length > 0 && (
              <div className="px-5 py-3 border-t border-g200 flex items-center justify-between shrink-0 bg-g50">
                <p className="text-[11px] text-g400">Existing non-empty fields will not be overwritten.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBulkFixes(null)}
                    className="px-4 py-2 text-[11px] font-bold bg-white border border-g300 rounded text-g500 hover:bg-g100 transition-colors">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={bulkApplying}
                    onClick={async () => {
                      setBulkApplying(true);
                      try {
                        // Group fixes by customer
                        const byCustomer = new Map<string, SiteFix[]>();
                        for (const fix of bulkFixes) {
                          if (!byCustomer.has(fix.customerId)) byCustomer.set(fix.customerId, []);
                          byCustomer.get(fix.customerId)!.push(fix);
                        }
                        for (const [custId, fixes] of byCustomer) {
                          const cust = data.customers.find((c: Customer) => c.id === custId);
                          if (!cust) continue;
                          const updatedSites = cust.sites.map(s => {
                            const fix = fixes.find(f => f.siteId === s.id);
                            if (!fix) return s;
                            const updatedContacts = [...s.contacts];
                            if (fix.parsed.phones.length > 0) {
                              const pIdx = updatedContacts.findIndex(c => c.isPrimary);
                              const target = pIdx >= 0 ? pIdx : 0;
                              if (updatedContacts[target] && !updatedContacts[target].phone) {
                                updatedContacts[target] = { ...updatedContacts[target], phone: fix.parsed.phones.join(', ') };
                              } else if (updatedContacts[target]) {
                                updatedContacts.push({ id: 'C' + Date.now() + Math.random(), name: 'Phone', role: 'Purchase', email: '', phone: fix.parsed.phones.join(', ') });
                              }
                            }
                            return {
                              ...s,
                              fullAddress: fix.parsed.cleanAddress,
                              name: s.name || fix.parsed.siteName || s.name,
                              transporter: s.transporter || fix.parsed.transporter || s.transporter,
                              leadTimeNote: s.leadTimeNote || fix.parsed.leadTimeNote || s.leadTimeNote,
                              dispatchAddress: s.dispatchAddress || fix.parsed.dispatchHint || s.dispatchAddress,
                              gstin: s.gstin || fix.parsed.gstin || s.gstin,
                              contacts: updatedContacts,
                            };
                          });
                          await updateCustomer(custId, { sites: updatedSites });
                        }
                        setBulkDone(true);
                      } catch (err) {
                        alert('Failed to save: ' + (err as Error).message);
                      } finally {
                        setBulkApplying(false);
                      }
                    }}
                    className="px-5 py-2 text-[11px] font-bold bg-sW text-white rounded hover:opacity-90 disabled:opacity-50 flex items-center gap-2 transition-opacity"
                  >
                    {bulkApplying ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    {bulkApplying ? 'Applying…' : `Apply to ${bulkFixes.length} site${bulkFixes.length > 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
            {bulkDone && (
              <div className="px-5 py-3 border-t border-g200 flex justify-end shrink-0 bg-g50">
                <button type="button" onClick={() => setBulkFixes(null)}
                  className="px-4 py-2 text-[11px] font-bold bg-white border border-g300 rounded text-blk hover:bg-g100 transition-colors">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
