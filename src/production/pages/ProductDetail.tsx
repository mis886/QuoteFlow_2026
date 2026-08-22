// Product Detail — params grid + rates table + BOM tree.
// Mirrors v2 openProductDetail() (line 2138+).

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit2, Plus, Package, Trash2, Copy } from 'lucide-react';
import { Button } from '../../components/ui';
import { PageHeader, StatusPill } from '../components/table';
import { supabase } from '../../lib/supabase';
import { listBOMForProduct, deleteBOMRow, listPresses, duplicateProduct } from '../lib/db';
import { EditRatesModal } from '../components/EditRatesModal';
import { AddBOMRowModal } from '../components/AddBOMRowModal';
import type { Product, Compound, BOMRow, Press } from '../lib/types';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [compound, setCompound] = useState<Compound | null>(null);
  const [bom, setBom] = useState<BOMRow[]>([]);
  const [presses, setPresses] = useState<Press[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [showBOMModal, setShowBOMModal] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const handleDuplicate = async () => {
    if (!id) return;
    setDuplicating(true);
    try {
      const copy = await duplicateProduct(id);
      navigate(`/production/products/${copy.id}/edit`);
    } catch (e: any) {
      alert(e?.message || 'Duplicate failed.');
    } finally {
      setDuplicating(false);
    }
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [pRes, bomRes, pressRes] = await Promise.all([
      supabase.from('prod_products').select('*').eq('id', id).single(),
      listBOMForProduct(id),
      listPresses(),
    ]);
    const p = pRes.data as Product | null;
    setProduct(p);
    setBom(bomRes);
    setPresses(pressRes);
    if (p?.compound_id) {
      const { data: c } = await supabase
        .from('prod_compounds').select('*').eq('id', p.compound_id).single();
      setCompound(c as Compound | null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="p-8 text-[13px] text-[#333]">Loading product…</div>;
  if (!product) return (
    <div className="p-8">
      <Button variant="secondary" onClick={() => navigate('/production/products')} className="gap-1">
        <ArrowLeft size={12} /> Back
      </Button>
      <div className="mt-4 text-[13px] text-[#333]">Product not found.</div>
    </div>
  );

  const mouldRate = product.cure_time_min && product.cavities
    ? ((60 / product.cure_time_min) * product.cavities * (product.two_side_op ? 2 : 1))
    : null;

  const PLANNED_F = 6; const PLANNED_I = 3; // from shop_floor_settings default
  const refQty = 100;
  const mH = mouldRate ? (refQty / mouldRate) + (product.setup_time_hrs || 0.5) : null;
  const fH = product.finish_rate ? refQty / (product.finish_rate * PLANNED_F) : null;
  const iH = product.insp_rate ? refQty / (product.insp_rate * PLANNED_I) : null;
  const pdiH = product.pdi_time_hrs || 0.25;
  const totalH = mH != null && fH != null && iH != null ? mH + fH + iH + pdiH : null;

  const hasBOM = bom.length > 0;
  const compoundRow = bom.find(r => r.is_compound);
  const raws = bom.filter(r => !r.is_compound);

  const pressNames = (product.press_ids || [])
    .map(pid => presses.find(p => p.id === pid)?.name || pid);
  const pressLabel = pressNames.length
    ? pressNames.join(', ')
    : product.tonnage ? `${product.tonnage}T` : '—';

  const dash = (v: any) => (v != null && v !== '' ? String(v) : '—');
  const PARAMS = [
    { emoji: '🏷', v: product.family_code || '—', l: 'Type · Model · MOC' },
    { emoji: '📦', v: product.item_category || '—', l: 'Item Category' },
    { emoji: '🏗', v: product.workshop_unit || '—', l: 'Workshop Unit' },
    { emoji: '🏭', v: pressLabel, l: 'Compatible Presses' },
    { emoji: '🧱', v: product.mould_code || '—', l: 'Die No. / Mould' },
    { emoji: '🏷', v: product.make || '—', l: 'Make' },
    { emoji: '🧪', v: product.compound_no || '—', l: 'Compound No.' },
    { emoji: '🧵', v: product.dori_size_required || '—', l: 'Dori Size (req.)' },
    { emoji: '🔘', v: product.tikli_size || '—', l: 'Tikli Size' },
    { emoji: '🔥', v: product.cure_temp_c ? `${product.cure_temp_c}°C` : '—', l: 'Cure Temperature' },
    { emoji: '⏱',  v: product.cure_time_min ? `${product.cure_time_min} min` : '—', l: 'Cure Time' },
    { emoji: '🔁', v: product.cycle_time_min != null ? `${product.cycle_time_min} min` : '—', l: 'Cycle Time' },
    { emoji: '♨', v: product.oven_temp_c ? `${product.oven_temp_c}°C` : '—', l: 'Oven Temp' },
    { emoji: '🕯', v: product.oven_time_hrs != null ? `${product.oven_time_hrs} hr` : '—', l: 'Oven Time' },
    { emoji: '⬛', v: product.cavities != null ? String(product.cavities) : '—', l: 'Cavities' },
    { emoji: '⚖', v: dash(product.blank_weight_g), l: 'Blank Weight (g)' },
    { emoji: '⚖', v: dash(product.finished_weight_g), l: 'Finished Wt (g)' },
    { emoji: '⚙',  v: product.mold_rate ? `${product.mold_rate} pcs/hr` : (mouldRate ? `${mouldRate.toFixed(1)} pcs/hr` : '—'), l: `Moulding Rate${product.two_side_op ? ' (2-side)' : ''}` },
    { emoji: '✂',  v: product.finish_rate ? `${product.finish_rate} pcs/person/hr` : '—', l: 'Finishing Rate' },
    { emoji: '🔍', v: product.insp_rate ? `${product.insp_rate} pcs/insp/hr` : '—', l: 'Inspection Rate' },
    { emoji: '🎨', v: product.colour_code || '—', l: 'Colour Code' },
    { emoji: '🛠', v: dash(product.maintenance_after_qty), l: 'Maintenance After (qty)' },
    { emoji: '💰', v: product.unit_cost ? `₹${product.unit_cost.toFixed(2)}` : '—', l: 'Unit Cost (Est.)' },
  ];

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module={`Production · Products · ${product.code}`}
        title={<>{product.code}</>}
        accent={product.revision || undefined}
        subtitle={`${product.name} · ${product.family_code || '—'} · ${product.customer_name || '—'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/production/products')} className="gap-1">
              <ArrowLeft size={12} /> Back
            </Button>
            <Button variant="secondary" onClick={handleDuplicate} disabled={duplicating} className="gap-1">
              <Copy size={12} /> {duplicating ? 'Duplicating…' : 'Duplicate'}
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/production/products/${id}/edit`)} className="gap-1">
              <Edit2 size={12} /> Edit
            </Button>
          </>
        }
      />

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto space-y-4">
        {/* Status row */}
        <div className="bg-white border border-[#E4E5E6] rounded-[3px] px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <StatusPill status={product.revision || 'R1'} tone="neutral" />
          <StatusPill
            status={hasBOM ? 'BOM Ready' : 'BOM Pending'}
            tone={hasBOM ? 'good' : 'warn'}
          />
          {!product.is_active && <StatusPill status="Inactive" tone="bad" />}
        </div>

        {/* Params grid — matches v2 .pp-grid / .pp-card */}
        <section>
          <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] mb-2">
            Product Parameters
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PARAMS.map((x, i) => (
              <div key={i} className="bg-white border border-[#E4E5E6] rounded-[3px] px-3 py-2.5">
                <div className="text-[18px] leading-none mb-1">{x.emoji}</div>
                <div className="text-[16px] font-semibold text-[#111] leading-none">{x.v}</div>
                <div className="text-[10px] text-[#333] mt-1">{x.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Compound info */}
        {compound && (
          <section>
            <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] mb-2">
              Compound
            </div>
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] grid grid-cols-4 divide-x divide-[#F3F3F3]">
              <Field label="Compound Code" value={compound.code} mono />
              <Field label="Grade / Polymer" value={compound.grade} />
              <Field label="Shore A" value={compound.shore_a != null ? String(compound.shore_a) : '—'} />
              <Field label="Shelf Life" value={compound.shelf_days ? `${compound.shelf_days} days` : '—'} />
            </div>
          </section>
        )}

        {/* Production rates table — matches v2 TAT section */}
        <section>
          <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] mb-2 flex items-center gap-2">
            Production Rates — LSD Calculation Basis
            <Button variant="ghost" size="sm" onClick={() => setShowRatesModal(true)} className="gap-1 ml-auto">
              <Edit2 size={11} /> Edit Rates
            </Button>
          </div>
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-[#FAFAFA]">
                <tr>
                  <TH2>Stage</TH2>
                  <TH2>Rate</TH2>
                  <TH2>TAT @ {refQty} pcs (planned HC)</TH2>
                  <TH2>Notes</TH2>
                </tr>
              </thead>
              <tbody>
                <Row label="Moulding"
                  rate={mouldRate ? `${mouldRate.toFixed(1)} pcs/hr` : '—'}
                  tat={mH != null ? `${mH.toFixed(1)} hrs incl. ${product.setup_time_hrs || 0.5}h setup` : '—'}
                  note={`Auto-calculated: (60÷${product.cure_time_min || '?'})×${product.cavities || '?'}`}
                />
                <Row label="Finishing"
                  rate={product.finish_rate ? `${product.finish_rate} pcs/person/hr` : '—'}
                  tat={fH != null ? `${fH.toFixed(1)} hrs @ ${PLANNED_F} finishers` : '—'}
                  note="From PMS sheet · varies by absenteeism"
                />
                <Row label="Inspection"
                  rate={product.insp_rate ? `${product.insp_rate} pcs/inspector/hr` : '—'}
                  tat={iH != null ? `${iH.toFixed(1)} hrs @ ${PLANNED_I} inspectors` : '—'}
                  note="Visual + dimensional"
                />
                <Row label="PDI"
                  rate="Fixed"
                  tat={`${pdiH} hrs/job`}
                  note="Pre-despatch check"
                />
                {totalH != null && (
                  <tr className="bg-[#FAFAFA] border-t border-[#E4E5E6]">
                    <td className="px-[13px] py-[10px] font-bold text-[#111]">Total @ {refQty} pcs</td>
                    <td />
                    <td className="px-[13px] py-[10px] font-bold text-[#111]">
                      {totalH.toFixed(1)} hrs (~{Math.ceil(totalH / 8)} working days)
                    </td>
                    <td className="px-[13px] py-[10px] text-[11px] text-[#333]">Scales with actual qty</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* BOM tree — matches v2 .bom-tree / .bom-root / .bom-cmp */}
        <section>
          <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] mb-2 flex items-center gap-2">
            Bill of Materials — {product.code}
            <Button variant="ghost" size="sm" onClick={() => setShowBOMModal(true)} className="gap-1 ml-auto">
              <Plus size={11} /> Add Component
            </Button>
          </div>
          {hasBOM ? (
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden text-[12px]">
              {/* Root row */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[#FAFAFA] border-b border-[#E4E5E6] font-semibold text-[#111]">
                <Package size={14} className="text-[#0A6ED1] shrink-0" />
                <span className="font-mono text-[11px] font-bold text-[#0A6ED1]">{product.code}</span>
                <span>— {product.name}</span>
                <span className="ml-1 text-[10px] text-[#333] font-normal">Finished Product</span>
              </div>

              {/* Compound row */}
              {compoundRow && (
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-[#F3F3F3]">
                  <span className="text-[11px] text-[#0A6ED1] shrink-0">→</span>
                  <span className="font-mono text-[11px] font-bold text-[#111]">{compoundRow.raw_code}</span>
                  <span className="flex-1 text-[#444]">{compoundRow.raw_name}</span>
                  {compoundRow.kg_per_batch && (
                    <span className="font-mono text-[11px] text-[#333]">
                      {compoundRow.kg_per_batch} kg/batch
                    </span>
                  )}
                  {compoundRow.batches_per_run && (
                    <span className="text-[11px] text-[#333]">{compoundRow.batches_per_run} batches/run</span>
                  )}
                </div>
              )}

              {/* Raw material rows */}
              {raws.map(r => (
                <div key={r.id} className="flex items-center gap-2 px-6 py-2 border-b border-[#F3F3F3] last:border-b-0 group">
                  <span className="text-[11px] text-[#555] shrink-0">↳</span>
                  <span className="font-mono text-[10.5px] text-[#666] shrink-0">{r.raw_code}</span>
                  <span className="flex-1 text-[#444]">— {r.raw_name}</span>
                  <span className="font-mono text-[11px] text-[#333] min-w-[80px] text-right">
                    {r.qty_per_batch} {r.unit}
                  </span>
                  <span className="text-[10.5px] text-[#333] min-w-[140px] text-right">{r.supplier || '—'}</span>
                  <button
                    type="button"
                    onClick={() => r.id && deleteBOMRow(r.id).then(load)}
                    className="ml-2 opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#0A6ED1] transition-opacity"
                    title="Remove component"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] p-8 text-center">
              <Package size={24} className="mx-auto text-[#CCC] mb-3" />
              <div className="text-[12px] text-[#333] mb-3">BOM not yet configured for this product.</div>
              <Button variant="ghost" onClick={() => setShowBOMModal(true)} className="gap-1">
                <Plus size={12} /> Create BOM
              </Button>
            </div>
          )}
        </section>

        {product.notes && (
          <section>
            <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] mb-2">Notes</div>
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] px-4 py-3 text-[12.5px] text-[#444] whitespace-pre-wrap">
              {product.notes}
            </div>
          </section>
        )}
      </div>

      {/* Edit Rates modal */}
      <EditRatesModal
        open={showRatesModal}
        product={product}
        onClose={() => setShowRatesModal(false)}
        onSaved={load}
      />

      {/* Add BOM row modal */}
      <AddBOMRowModal
        open={showBOMModal}
        productId={product.id}
        onClose={() => setShowBOMModal(false)}
        onSaved={load}
      />
    </div>
  );
}

function TH2({ children }: { children: React.ReactNode }) {
  return <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-[#333] px-[13px] py-[9px] text-left whitespace-nowrap border-b border-[#E4E5E6]">{children}</th>;
}
function Row({ label, rate, tat, note }: { label: string; rate: string; tat: string; note: string }) {
  return (
    <tr className="border-b border-[#F3F3F3]">
      <td className="px-[13px] py-[9px] font-semibold text-[#111]">{label}</td>
      <td className="px-[13px] py-[9px] font-mono text-[11.5px] font-bold text-[#111]">{rate}</td>
      <td className="px-[13px] py-[9px] text-[12px]">{tat}</td>
      <td className="px-[13px] py-[9px] text-[11px] text-[#333]">{note}</td>
    </tr>
  );
}
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-3 py-2.5">
      <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[#333] mb-0.5">{label}</div>
      <div className={`text-[12.5px] font-medium text-[#111] ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
