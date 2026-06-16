import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Customer, Site } from '../lib/types';
import { Button } from './ui';
import { cn } from '../lib/utils';
import {
  X, Copy, GitMerge, Loader2, Star,
  MapPin, AlertCircle, CheckCircle,
} from 'lucide-react';

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Strip legal suffix AND everything that follows (unit name, city, distillery, district etc.)
    .replace(/\b(pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|inc\.?|corp\.?|&\s*co\.?)\b.*/i, '')
    // Strip dash-separated suffix for names without legal suffix (e.g. "DCM Shriram - Meerut")
    .replace(/\s*[-–—]\s*.+$/, '')
    // Strip any remaining bare legal suffixes
    .replace(/\bprivate\s+limited\b/g, '')
    .replace(/\bpvt\.?\s*ltd\.?\b/g, '')
    .replace(/\bpvt\b/g, '')
    .replace(/\blimited\b/g, '')
    .replace(/\bltd\.?\b/g, '')
    .replace(/\bllp\b/g, '')
    .replace(/\b&\s*co\.?\b/g, '')
    .replace(/\binc\.?\b/g, '')
    .replace(/\bcorp\.?\b/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function detectDuplicateGroups(customers: Customer[]): Customer[][] {
  const norms = customers.map(c => ({ c, norm: normalizeName(c.name) }));
  const groups: Customer[][] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < norms.length; i++) {
    if (assigned.has(norms[i].c.id)) continue;
    const group: Customer[] = [norms[i].c];
    assigned.add(norms[i].c.id);
    for (let j = i + 1; j < norms.length; j++) {
      if (assigned.has(norms[j].c.id)) continue;
      const a = norms[i].norm, b = norms[j].norm;
      if (!a || !b || a.slice(0, 4) !== b.slice(0, 4)) continue;
      const isExact = a === b;
      const isFuzzy = a.length > 4 && b.length > 4 && nameSimilarity(a, b) >= 0.85;
      if (isExact || isFuzzy) {
        group.push(norms[j].c);
        assigned.add(norms[j].c.id);
      }
    }
    if (group.length >= 2) groups.push(group);
  }

  return groups;
}

function siteHasData(site: Site): boolean {
  const hasGstin   = !!site.gstin?.trim();
  const hasAddress = !!(site.fullAddress?.trim() || site.address?.trim());
  const hasName    = !!(site.name?.trim());
  const hasContact = (site.contacts ?? []).some(
    c => c.name?.trim() || c.email?.trim() || c.phone?.trim()
  );
  return hasGstin || hasAddress || hasName || hasContact;
}

function normalizeSiteName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function mergeSites(group: Customer[], primaryId: string): Site[] {
  const primary = group.find(c => c.id === primaryId)!;
  const others  = group.filter(c => c.id !== primaryId);

  const seenGstin = new Set<string>();
  const seenName  = new Set<string>();
  const result: Site[] = [];

  const addSite = (site: Site) => {
    if (!siteHasData(site)) return;
    const gstin   = site.gstin?.trim().toUpperCase() ?? '';
    const nameKey = normalizeSiteName(site.name);
    // Drop if GSTIN already seen, or if normalized name already seen
    if (gstin && seenGstin.has(gstin)) return;
    if (seenName.has(nameKey)) return;
    if (gstin) seenGstin.add(gstin);
    seenName.add(nameKey);
    result.push(site);
  };

  for (const site of primary.sites ?? []) addSite(site);
  for (const c of others) for (const site of c.sites ?? []) addSite(site);

  return result.map((site, idx) => ({ ...site, isPrimary: idx === 0 }));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  customers: Customer[];
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  onClose: () => void;
}

interface GroupCardProps {
  group: Customer[];
  groupKey: string;
  primaryId: string;
  selectedIds: Set<string>;
  isMerging: boolean;
  error: string;
  onSelectPrimary: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onMerge: () => void;
  onSkip: () => void;
}

// ── GroupCard ─────────────────────────────────────────────────────────────────

function GroupCard({
  group, groupKey, primaryId, selectedIds, isMerging, error,
  onSelectPrimary, onToggleSelected, onMerge, onSkip,
}: GroupCardProps) {
  const [confirming, setConfirming] = useState(false);
  const selectedGroup = group.filter(c => selectedIds.has(c.id));
  const canMerge = selectedGroup.length >= 2;
  const mergedSitePreview = canMerge ? mergeSites(selectedGroup, primaryId) : [];

  return (
    <div className="bg-white border border-g200 rounded-sm overflow-hidden shadow-sm">

      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 bg-g100 border-b border-g200">
        <div className="flex items-center gap-2 min-w-0">
          <Copy size={12} className="text-g500 shrink-0" />
          <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500 shrink-0">Group:</span>
          <span className="font-semibold text-[12.5px] text-blk uppercase tracking-wide truncate">{groupKey}</span>
          <span className="inline-flex items-center px-1.5 py-0.5 bg-g200 rounded font-mono text-[9px] text-g600 shrink-0">
            {group.length} records
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {!canMerge && !confirming && (
            <span className="text-[10px] text-amber-600 font-medium">Select ≥2 records to merge</span>
          )}
          {!confirming ? (
            <>
              <Button size="sm" variant="secondary" onClick={onSkip} disabled={isMerging}>
                Skip
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setConfirming(true)}
                disabled={isMerging || !canMerge}
                className="gap-1.5"
              >
                {isMerging
                  ? <><Loader2 size={11} className="animate-spin" /> Merging…</>
                  : <><GitMerge size={11} /> Merge {canMerge ? `${selectedGroup.length}` : ''}</>
                }
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-g600 font-medium">Confirm merge?</span>
              <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={() => { setConfirming(false); onMerge(); }}>
                Yes, Merge
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Records table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-g100">
              <th className="w-8 px-3 py-2" title="Include in merge" />
              <th className="w-8 px-3 py-2" title="Primary record" />
              <th className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-g500 px-3 py-2 text-left whitespace-nowrap">Customer ID</th>
              <th className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-g500 px-3 py-2 text-left">Company Name</th>
              <th className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-g500 px-3 py-2 text-left">GSTIN</th>
              <th className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-g500 px-3 py-2 text-left">Sites</th>
            </tr>
          </thead>
          <tbody>
            {group.map(c => {
              const isSelected = selectedIds.has(c.id);
              const isP = c.id === primaryId && isSelected;
              const hasGstin = !!c.gstin?.trim();
              const siteGstins = (c.sites ?? []).filter(s => s.gstin?.trim());
              return (
                <tr
                  key={c.id}
                  className={cn(
                    'border-b border-g100 last:border-0 cursor-pointer transition-colors',
                    isP ? 'bg-red-50' : isSelected ? 'hover:bg-g50' : 'bg-white opacity-50 hover:opacity-75'
                  )}
                  onClick={() => onToggleSelected(c.id)}
                >
                  <td className="px-3 py-2.5 align-middle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelected(c.id)}
                      onClick={e => e.stopPropagation()}
                      className="accent-red-600 cursor-pointer"
                      title={`Include ${c.name} in merge`}
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <input
                      type="radio"
                      checked={isP}
                      disabled={!isSelected}
                      onChange={() => { if (isSelected) onSelectPrimary(c.id); }}
                      onClick={e => { e.stopPropagation(); if (isSelected) onSelectPrimary(c.id); }}
                      className="accent-red-600 cursor-pointer disabled:opacity-30"
                      title={isSelected ? `Set ${c.name} as primary` : 'Select this record first'}
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] text-g600">{c.id}</span>
                      {isP && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 border border-red-200 text-red-700 text-[8px] font-bold rounded uppercase tracking-wide">
                          <Star size={7} className="fill-red-700" /> Primary
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle font-medium text-blk max-w-[200px] truncate">{c.name}</td>
                  <td className="px-3 py-2.5 align-middle">
                    {hasGstin ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] text-blk">{c.gstin}</span>
                        <span className="px-1 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[8px] font-bold rounded uppercase">GSTIN</span>
                      </div>
                    ) : siteGstins.length > 0 ? (
                      <div className="space-y-0.5">
                        {siteGstins.map(s => (
                          <div key={s.id} className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-blk">{s.gstin}</span>
                            <span className="text-g400 text-[9px]">({s.name})</span>
                            <span className="px-1 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[8px] font-bold rounded uppercase">GSTIN</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-g300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-g500 font-mono text-[11px]">
                    {(c.sites ?? []).length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sites merge preview */}
      <div className="px-4 py-2.5 border-t border-g100 bg-g50 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 shrink-0">
          Sites after merge:
        </span>
        {canMerge ? (
          <>
            {mergedSitePreview.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border',
                  i === 0
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-g100 border-g200 text-g600'
                )}
              >
                {i === 0 && <MapPin size={9} />}
                {s.city || s.name}
              </span>
            ))}
            <span className="text-[10px] text-g400 ml-auto font-mono">
              {mergedSitePreview.length} total
            </span>
          </>
        ) : (
          <span className="text-[10.5px] text-amber-600 italic">
            Check at least 2 records above to preview merge
          </span>
        )}
      </div>

      {/* Error strip */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center gap-2">
          <AlertCircle size={12} className="text-red-600 shrink-0" />
          <span className="text-[11px] text-red-700">{error}</span>
        </div>
      )}
    </div>
  );
}

// ── DuplicateReviewPanel ──────────────────────────────────────────────────────

export function DuplicateReviewPanel({ customers, updateCustomer, deleteCustomer, onClose }: Props) {
  const initialGroups = useMemo(() => detectDuplicateGroups(customers), []);

  const [groups, setGroups] = useState<Customer[][]>(initialGroups);

  const [primarySelections, setPrimarySelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of initialGroups) {
      const key = normalizeName(g[0].name);
      init[key] =
        g.find(c => c.gstin?.trim())?.id
        ?? g.find(c => c.sites.some(s => s.gstin?.trim()))?.id
        ?? g[0].id;
    }
    return init;
  });

  // Per-group selection: which customer IDs are checked for merging
  const [groupSelections, setGroupSelections] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of initialGroups) {
      const key = normalizeName(g[0].name);
      init[key] = new Set(g.map(c => c.id));
    }
    return init;
  });

  const [skipped, setSkipped]     = useState<Set<string>>(new Set());
  const [merging, setMerging]     = useState<Set<string>>(new Set());
  const [mergeError, setMergeError] = useState<Record<string, string>>({});

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const activeGroups = groups.filter(g => !skipped.has(normalizeName(g[0].name)));

  const handleToggleSelected = useCallback((groupKey: string, id: string, groupMembers: Customer[]) => {
    setGroupSelections(prevSel => {
      const cur = new Set(prevSel[groupKey] ?? groupMembers.map(c => c.id));
      cur.has(id) ? cur.delete(id) : cur.add(id);
      // If primary got unchecked, reassign to first still-checked record
      setPrimarySelections(prevPrim => {
        if (!cur.has(prevPrim[groupKey])) {
          const first = groupMembers.find(c => cur.has(c.id));
          return first ? { ...prevPrim, [groupKey]: first.id } : prevPrim;
        }
        return prevPrim;
      });
      return { ...prevSel, [groupKey]: cur };
    });
  }, []);

  async function handleMerge(group: Customer[], groupKey: string) {
    const selectedIds = groupSelections[groupKey] ?? new Set(group.map(c => c.id));
    const selectedGroup = group.filter(c => selectedIds.has(c.id));
    const primaryId = primarySelections[groupKey];
    const toDelete = selectedGroup.filter(c => c.id !== primaryId);

    setMerging(prev => new Set([...prev, groupKey]));
    setMergeError(prev => ({ ...prev, [groupKey]: '' }));

    try {
      const mergedSites = mergeSites(selectedGroup, primaryId);
      await updateCustomer(primaryId, { sites: mergedSites });
      for (const dup of toDelete) {
        await deleteCustomer(dup.id);
      }
      // Remove merged records from the group; if only 1 remains, remove the group entirely
      const remaining = group.filter(c => !selectedIds.has(c.id) || c.id === primaryId);
      if (remaining.length < 2) {
        setGroups(prev => prev.filter(g => normalizeName(g[0].name) !== groupKey));
      } else {
        setGroups(prev => prev.map(g => normalizeName(g[0].name) === groupKey ? remaining : g));
        setGroupSelections(prev => ({ ...prev, [groupKey]: new Set(remaining.map(c => c.id)) }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Merge failed. Please try again.';
      setMergeError(prev => ({ ...prev, [groupKey]: msg }));
    } finally {
      setMerging(prev => {
        const next = new Set(prev);
        next.delete(groupKey);
        return next;
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f8f7f4] overflow-hidden animate-in fade-in duration-200">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-g200 bg-white shrink-0">
        <div>
          <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">
            Data Quality
          </div>
          <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
            Duplicate Customer <em className="italic text-red-mrt">Review</em>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2.5 py-1 bg-g100 border border-g200 rounded-full font-mono text-[11px] font-bold text-g600">
            {activeGroups.length} group{activeGroups.length !== 1 ? 's' : ''} found
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-g400 hover:text-blk bg-g100 hover:bg-g200 rounded transition-colors focus:outline-none"
            aria-label="Close duplicate review"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {activeGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-12 h-12 rounded-full bg-g100 flex items-center justify-center mb-4">
              <CheckCircle size={24} className="text-emerald-500" />
            </div>
            <h3 className="font-serif text-lg text-blk mb-1">No duplicates found</h3>
            <p className="text-[12.5px] text-g500 max-w-xs">
              All customer names appear unique after normalising legal suffixes.
            </p>
          </div>
        ) : (
          activeGroups.map(group => {
            const groupKey = normalizeName(group[0].name);
            return (
              <GroupCard
                key={groupKey}
                group={group}
                groupKey={groupKey}
                primaryId={primarySelections[groupKey]}
                selectedIds={groupSelections[groupKey] ?? new Set(group.map(c => c.id))}
                isMerging={merging.has(groupKey)}
                error={mergeError[groupKey] ?? ''}
                onSelectPrimary={id => setPrimarySelections(prev => ({ ...prev, [groupKey]: id }))}
                onToggleSelected={id => handleToggleSelected(groupKey, id, group)}
                onMerge={() => handleMerge(group, groupKey)}
                onSkip={() => setSkipped(prev => new Set([...prev, groupKey]))}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
