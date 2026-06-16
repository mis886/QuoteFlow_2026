// New Product / Edit Product — shared form page.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, ChevronDown, X, Check } from 'lucide-react';
import { Button } from '../../components/ui';
import { PageHeader } from '../components/table';
import { ComboSelect } from '../components/ComboSelect';
import { upsertProduct, listCompounds, listPresses, listProducts, listOptions, upsertOptionValue, nextFamilyCode, getProduct } from '../lib/db';
import type { Compound, Press, ProdOption, ProdOptionField } from '../lib/types';

export function NewProduct() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();   // id present = edit mode
  const isEdit = !!id;

  const [compounds, setCompounds] = useState<Compound[]>([]);
  const [presses, setPresses] = useState<Press[]>([]);
  const [options, setOptions] = useState<ProdOption[]>([]);
  const [pressMenuOpen, setPressMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  // Identity: Type + Model + MOC compose the family code (GCH_S121_NBR);
  // the unique per-variant `code` (FAMILY-N) is auto-generated on save.
  const [code, setCode]             = useState('');   // existing unique code (edit mode)
  const [typeCode, setTypeCode]     = useState('');   // TYPE, e.g. GCH
  const [modelNo, setModelNo]       = useState('');   // Model No., e.g. S121
  const [moc, setMoc]               = useState('');   // MOC, e.g. NBR
  const [name, setName]             = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [workshopUnit, setWorkshopUnit] = useState('');   // derived from category, overridable
  const [unitTouched, setUnitTouched]   = useState(false); // user changed unit manually
  const [make, setMake]             = useState('');
  const [customerName, setCustomerName] = useState('');
  const [compoundId, setCompoundId] = useState('');
  const [compoundNo, setCompoundNo] = useState('');
  const [shrinkage, setShrinkage]   = useState('');
  const [mouldCode, setMouldCode]   = useState('');   // Die No
  const [cavities, setCavities]     = useState('');
  const [tonnage, setTonnage]       = useState('');       // legacy, preserved on save
  const [pressIds, setPressIds]     = useState<string[]>([]);
  const [doriRequired, setDoriRequired] = useState('');
  const [doriUsed, setDoriUsed]     = useState('');
  const [tikliSize, setTikliSize]   = useState('');
  const [cureTempC, setCureTempC]   = useState('');
  const [cureTimeMin, setCureTimeMin] = useState('');
  const [cycleTimeMin, setCycleTimeMin] = useState('');
  const [ovenTimeHrs, setOvenTimeHrs] = useState('');
  const [ovenTempC, setOvenTempC]   = useState('');
  const [blankWeightG, setBlankWeightG] = useState('');
  const [finishedWeightG, setFinishedWeightG] = useState('');
  const [shotWeightG, setShotWeightG] = useState('');
  const [pcsHr1, setPcsHr1]         = useState('');   // legacy, preserved on save
  const [pcsHr2, setPcsHr2]         = useState('');   // legacy, preserved on save
  const [twoSideOp, setTwoSideOp]   = useState(false); // press runs 2-side op
  const [setupTimeHrs, setSetupTimeHrs] = useState('0.5');
  const [finishRate, setFinishRate] = useState('');
  const [inspRate, setInspRate]     = useState('');
  const [pdiTimeHrs, setPdiTimeHrs] = useState('0.25');
  const [colourCode, setColourCode] = useState('');
  const [maintenanceAfterQty, setMaintenanceAfterQty] = useState('');
  const [drawRef, setDrawRef]       = useState('');
  const [revision, setRevision]     = useState('R1');
  const [unitCost, setUnitCost]     = useState('');
  const [notes, setNotes]           = useState('');

  // Live-composed family code from Type_Model_MOC
  const familyCode = [typeCode, modelNo, moc].map(s => s.trim()).filter(Boolean).join('_').toUpperCase();

  // ── Editable-dropdown option helpers ───────────────────────────────────────
  const optValues = (field: ProdOptionField) =>
    options.filter(o => o.field === field).map(o => o.value);
  // Workshop unit mapped to a given item category (from option meta).
  const unitForCategory = (cat: string): string =>
    options.find(o => o.field === 'item_category' && o.value === cat)?.meta?.unit || '';
  // Distinct workshop units present in the category mapping (for the override select).
  const unitChoices = Array.from(
    new Set(options.filter(o => o.field === 'item_category').map(o => o.meta?.unit).filter(Boolean) as string[]),
  ).sort();
  // Persist a typed-in option value, then refresh the local list.
  const addOption = (field: ProdOptionField, value: string, meta?: { unit?: string } | null) => {
    upsertOptionValue(field, value, meta).then(() => listOptions().then(setOptions));
  };
  // Selecting a category auto-sets the unit unless the user overrode it.
  const onPickCategory = (cat: string) => {
    setItemCategory(cat);
    if (!unitTouched) setWorkshopUnit(unitForCategory(cat));
  };

  useEffect(() => {
    listCompounds().then(setCompounds);
    listPresses().then(setPresses);
    listOptions().then(setOptions);
    if (isEdit && id) {
      getProduct(id).then(p => {
        if (!p) return;
        const num = (v: number | null | undefined) => (v != null ? String(v) : '');
        // Type/Model/MOC: prefer stored columns; else split the family_code.
        const famParts = (p.family_code || '').split('_');
        setTypeCode(p.type_code || famParts[0] || '');
        setModelNo(p.model_no  || famParts[1] || '');
        setMoc(p.moc           || famParts[2] || '');
        setCode(p.code); setName(p.name);
        setItemCategory(p.item_category || '');
        setWorkshopUnit(p.workshop_unit || '');
        setUnitTouched(!!p.workshop_unit);
        setMake(p.make || '');
        setCustomerName(p.customer_name || '');
        setCompoundId(p.compound_id || '');
        setCompoundNo(p.compound_no || '');
        setShrinkage(p.shrinkage || '');
        setMouldCode(p.mould_code || '');
        setCavities(num(p.cavities));
        setTonnage(num(p.tonnage));
        setPressIds(Array.isArray(p.press_ids) ? p.press_ids : []);
        setDoriRequired(p.dori_size_required || '');
        setDoriUsed(p.dori_size_used || '');
        setTikliSize(p.tikli_size || '');
        setCureTempC(num(p.cure_temp_c));
        setCureTimeMin(num(p.cure_time_min));
        setCycleTimeMin(num(p.cycle_time_min));
        setOvenTimeHrs(num(p.oven_time_hrs));
        setOvenTempC(num(p.oven_temp_c));
        setBlankWeightG(num(p.blank_weight_g));
        setFinishedWeightG(num(p.finished_weight_g));
        setShotWeightG(num(p.shot_weight_g));
        setPcsHr1(num(p.pcs_hr_1side));
        setPcsHr2(num(p.pcs_hr_2side));
        setTwoSideOp(!!p.two_side_op);
        setSetupTimeHrs(p.setup_time_hrs != null ? String(p.setup_time_hrs) : '0.5');
        setFinishRate(num(p.finish_rate));
        setInspRate(num(p.insp_rate));
        setPdiTimeHrs(p.pdi_time_hrs != null ? String(p.pdi_time_hrs) : '0.25');
        setColourCode(p.colour_code || '');
        setMaintenanceAfterQty(num(p.maintenance_after_qty));
        setDrawRef(p.draw_ref || ''); setRevision(p.revision || 'R1');
        setUnitCost(num(p.unit_cost));
        setNotes(p.notes || '');
      });
    }
  }, [isEdit, id]);

  const mouldRate = cureTimeMin && cavities
    ? ((60 / parseFloat(cureTimeMin)) * parseFloat(cavities) * (twoSideOp ? 2 : 1)).toFixed(1)
    : null;

  const save = async () => {
    if (!typeCode.trim() || !modelNo.trim() || !moc.trim()) {
      alert('Type, Model No. and MOC are required (they build the product code).');
      return;
    }
    if (!name.trim()) {
      alert('Product Name is required.');
      return;
    }
    setSaving(true);
    try {
      const prodId = id || `P${Date.now().toString(36).toUpperCase()}`;
      // Auto-generate a unique code from the family for NEW products; keep the
      // existing code when editing.
      let finalCode = code.trim();
      if (!isEdit) {
        const all = await listProducts();
        finalCode = nextFamilyCode(familyCode, all.map(p => p.code));
      }
      const numI = (s: string) => (s.trim() ? parseInt(s) : null);
      const numF = (s: string) => (s.trim() ? parseFloat(s) : null);
      const txt  = (s: string) => (s.trim() || null);
      const saved = await upsertProduct({
        id: prodId, code: finalCode, name: name.trim(),
        family_code: familyCode || null,
        type_code: txt(typeCode), model_no: txt(modelNo), moc: txt(moc),
        item_category: txt(itemCategory),
        workshop_unit: txt(workshopUnit),
        make: txt(make),
        customer_name: txt(customerName),
        compound_id: compoundId || null,
        compound_no: txt(compoundNo),
        shrinkage: txt(shrinkage),
        mould_code: txt(mouldCode),
        cavities: numI(cavities),
        tonnage: numI(tonnage),
        press_ids: pressIds,
        dori_size_required: txt(doriRequired),
        dori_size_used: txt(doriUsed),
        tikli_size: txt(tikliSize),
        cure_temp_c: numI(cureTempC),
        cure_time_min: numI(cureTimeMin),
        cycle_time_min: numF(cycleTimeMin),
        oven_time_hrs: numF(ovenTimeHrs),
        oven_temp_c: numI(ovenTempC),
        blank_weight_g: numF(blankWeightG),
        finished_weight_g: numF(finishedWeightG),
        shot_weight_g: numI(shotWeightG),
        pcs_hr_1side: numF(pcsHr1),
        pcs_hr_2side: numF(pcsHr2),
        two_side_op: twoSideOp,
        mold_rate: mouldRate != null ? parseFloat(mouldRate) : null,
        setup_time_hrs: parseFloat(setupTimeHrs) || 0.5,
        finish_rate: numF(finishRate),
        insp_rate: numF(inspRate),
        pdi_time_hrs: parseFloat(pdiTimeHrs) || 0.25,
        colour_code: txt(colourCode),
        maintenance_after_qty: numI(maintenanceAfterQty),
        draw_ref: txt(drawRef),
        revision: revision.trim() || 'R1',
        unit_cost: numF(unitCost),
        notes: txt(notes),
        is_active: true,
      });
      navigate(`/production/products/${saved.id}`);
    } catch (e) {
      console.error(e);
      alert('Save failed. See console.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module={isEdit ? `Production · Products · Edit` : 'Production · Products'}
        title={isEdit ? 'Edit Product' : 'New Product'}
        subtitle="Mould, cure, production rates, BOM linkage."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/production/products')} className="gap-1">
              <ArrowLeft size={12} /> Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving} className="gap-2">
              <Save size={13} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
            </Button>
          </>
        }
      />

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="w-full space-y-5">
          {/* Identity */}
          <Card title="Identity">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <F label="Type *"><ComboSelect value={typeCode} onChange={setTypeCode} options={optValues('type')} onAddNew={v => addOption('type', v)} placeholder="e.g. GCH" title="Type" /></F>
              <F label="Model No. *"><input className={inp} value={modelNo} onChange={e => setModelNo(e.target.value)} placeholder="e.g. S121" title="Model number" /></F>
              <F label="MOC *"><ComboSelect value={moc} onChange={setMoc} options={optValues('moc')} onAddNew={v => addOption('moc', v)} placeholder="e.g. NBR" title="MOC" /></F>
            </div>
            <div className="mt-3 bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2 text-[12px] text-[#666] flex flex-wrap gap-x-6 gap-y-1">
              <span>Family (Type_Model_MOC): <strong className="text-[#0A6ED1] font-mono">{familyCode || '—'}</strong></span>
              <span>
                Product Code:{' '}
                {isEdit
                  ? <strong className="text-[#111] font-mono">{code}</strong>
                  : <strong className="text-[#107E3E] font-mono">{familyCode ? `${familyCode}-N (auto)` : '—'}</strong>}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              <F label="Product Name *"><input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. PHE Gasket M10 EPDM" title="Product name" /></F>
              <F label="Item Category">
                <ComboSelect
                  value={itemCategory}
                  onChange={onPickCategory}
                  options={optValues('item_category')}
                  onAddNew={v => addOption('item_category', v)}
                  metaFor={c => unitForCategory(c) || undefined}
                  placeholder="e.g. Gasket"
                  title="Item category"
                />
              </F>
              <F label="Workshop Unit">
                <select
                  className={inp}
                  value={workshopUnit}
                  onChange={e => { setWorkshopUnit(e.target.value); setUnitTouched(true); }}
                  title="Workshop unit (auto-set from category, overridable)"
                >
                  <option value="">{itemCategory ? '— Auto from category —' : '— Select —'}</option>
                  {unitChoices.map(u => <option key={u} value={u}>{u}</option>)}
                  {workshopUnit && !unitChoices.includes(workshopUnit) && <option value={workshopUnit}>{workshopUnit}</option>}
                </select>
              </F>
              <F label="Make"><ComboSelect value={make} onChange={setMake} options={optValues('make')} onAddNew={v => addOption('make', v)} placeholder="e.g. Sondex" title="Make" /></F>
              <F label="Primary Customer"><input className={inp} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" title="Customer" /></F>
              <F label="Drawing Reference"><input className={inp} value={drawRef} onChange={e => setDrawRef(e.target.value)} placeholder="DRW-…" title="Drawing reference" /></F>
              <F label="Revision"><input className={inp} value={revision} onChange={e => setRevision(e.target.value)} placeholder="R1" title="Revision" /></F>
              <F label="Colour Code"><ComboSelect value={colourCode} onChange={setColourCode} options={optValues('colour_code')} onAddNew={v => addOption('colour_code', v)} placeholder="e.g. Black" title="Colour code" /></F>
              <F label="Unit Cost (₹)"><input type="number" step="0.01" className={inp} value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0.00" title="Unit cost" /></F>
            </div>
          </Card>

          {/* Compound */}
          <Card title="Compound & Material">
            <Grid2>
              <F label="Compound (master)">
                <select className={inp} value={compoundId} onChange={e => setCompoundId(e.target.value)} title="Compound">
                  <option value="">— None selected —</option>
                  {compounds.map(c => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </F>
              <F label="Compound No."><input className={inp} value={compoundNo} onChange={e => setCompoundNo(e.target.value)} placeholder="e.g. 1154" title="Compound number" /></F>
              <F label="Shrinkage"><input className={inp} value={shrinkage} onChange={e => setShrinkage(e.target.value)} placeholder="e.g. 1.5%" title="Shrinkage" /></F>
              <F label="Dori Size Required"><input className={inp} value={doriRequired} onChange={e => setDoriRequired(e.target.value)} placeholder="e.g. 8.0 & 8.5mm" title="Dori size required" /></F>
              <F label="Dori Size Used (past)"><input className={inp} value={doriUsed} onChange={e => setDoriUsed(e.target.value)} placeholder="e.g. 8.0mm" title="Dori size used in past" /></F>
              <F label="Tikli Size"><input className={inp} value={tikliSize} onChange={e => setTikliSize(e.target.value)} placeholder="e.g. 6.6 & 7.0" title="Tikli size" /></F>
            </Grid2>
          </Card>

          {/* Mould & Press */}
          <Card title="Mould & Press">
            <Grid2>
              <F label="Die No. / Mould Code"><input className={inp} value={mouldCode} onChange={e => setMouldCode(e.target.value)} placeholder="e.g. 569" title="Die number / mould code" /></F>
              <F label="Cavities"><input type="number" className={inp} value={cavities} onChange={e => setCavities(e.target.value)} placeholder="2" title="Cavities" /></F>
            </Grid2>
            <div className="mt-3">
              <PressMultiSelect
                presses={presses}
                selected={pressIds}
                onChange={setPressIds}
                open={pressMenuOpen}
                setOpen={setPressMenuOpen}
              />
            </div>
          </Card>

          {/* Cure & Oven */}
          <Card title="Cure & Oven Parameters">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <F label="Cure Temperature (°C)"><input type="number" className={inp} value={cureTempC} onChange={e => setCureTempC(e.target.value)} placeholder="175" title="Cure temp" /></F>
              <F label="Cure Time (min)"><input type="number" className={inp} value={cureTimeMin} onChange={e => setCureTimeMin(e.target.value)} placeholder="180" title="Cure time" /></F>
              <F label="Cycle Time (min)"><input type="number" step="0.1" className={inp} value={cycleTimeMin} onChange={e => setCycleTimeMin(e.target.value)} placeholder="3" title="Cycle time" /></F>
              <F label="Oven Time (hrs)"><input type="number" step="0.1" className={inp} value={ovenTimeHrs} onChange={e => setOvenTimeHrs(e.target.value)} placeholder="4" title="Oven time hours" /></F>
              <F label="Oven Temp (°C)"><input type="number" className={inp} value={ovenTempC} onChange={e => setOvenTempC(e.target.value)} placeholder="150" title="Oven temp" /></F>
            </div>
            <label className="mt-3 flex items-center gap-2 cursor-pointer select-none w-fit" title="Some presses run a 2-side operation, doubling output per cycle">
              <input type="checkbox" className="accent-[#0A6ED1] w-3.5 h-3.5" checked={twoSideOp} onChange={e => setTwoSideOp(e.target.checked)} />
              <span className="text-[12px] text-[#333]">2-side operation <span className="text-[#888]">(doubles moulding rate — default off = 1-side)</span></span>
            </label>
            {mouldRate && (
              <div className="mt-2 bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2 text-[12px] text-[#666]">
                Moulding rate (auto{twoSideOp ? ', 2-side op' : ''}): <strong className="text-[#0A6ED1]">{mouldRate} pcs/hr</strong>
                <span className="text-[#555] ml-1">(60 ÷ {cureTimeMin}) × {cavities} cav{twoSideOp ? ' × 2' : ''}</span>
              </div>
            )}
          </Card>

          {/* Weights */}
          <Card title="Weights">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <F label="Blank Weight (g)"><input type="number" step="0.001" className={inp} value={blankWeightG} onChange={e => setBlankWeightG(e.target.value)} placeholder="0.480" title="Blank weight" /></F>
              <F label="Finished Pc Weight (g)"><input type="number" step="0.001" className={inp} value={finishedWeightG} onChange={e => setFinishedWeightG(e.target.value)} placeholder="560" title="Finished piece weight" /></F>
              <F label="Shot Weight (g)"><input type="number" className={inp} value={shotWeightG} onChange={e => setShotWeightG(e.target.value)} placeholder="85" title="Shot weight" /></F>
            </div>
          </Card>

          {/* Production rates */}
          <Card title="Production Rates (TAT / LSD Basis)">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <F label="Finishing Rate (pcs/person/hr)"><input type="number" step="0.5" className={inp} value={finishRate} onChange={e => setFinishRate(e.target.value)} placeholder="5" title="Finishing rate" /></F>
              <F label="Inspection Rate (pcs/inspector/hr)"><input type="number" step="1" className={inp} value={inspRate} onChange={e => setInspRate(e.target.value)} placeholder="39" title="Inspection rate" /></F>
              <F label="Setup Time (hrs/job)"><input type="number" step="0.25" className={inp} value={setupTimeHrs} onChange={e => setSetupTimeHrs(e.target.value)} placeholder="0.5" title="Setup time" /></F>
              <F label="PDI Time (hrs/job)"><input type="number" step="0.25" className={inp} value={pdiTimeHrs} onChange={e => setPdiTimeHrs(e.target.value)} placeholder="0.25" title="PDI time" /></F>
              <F label="Maintenance After (qty)"><input type="number" className={inp} value={maintenanceAfterQty} onChange={e => setMaintenanceAfterQty(e.target.value)} placeholder="e.g. 50000" title="Maintenance after quantity" /></F>
            </div>
          </Card>

          {/* Notes */}
          <Card title="Notes">
            <textarea
              className={`${inp} resize-none h-[72px]`}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes…"
              title="Notes"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

const inp = 'w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt';
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
      <div className="px-4 py-2.5 border-b border-[#E4E5E6]">
        <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333]">{title}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">{label}</label>
      {children}
    </div>
  );
}
// Multi-select of compatible presses (by name). Stores prod_presses.id values.
function PressMultiSelect({ presses, selected, onChange, open, setOpen }: {
  presses: Press[];
  selected: string[];
  onChange: (ids: string[]) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const byId = new Map(presses.map(p => [p.id, p]));
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  return (
    <F label="Compatible Presses">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          title="Select compatible presses"
          className={`${inp} flex items-center gap-1.5 flex-wrap min-h-[34px] text-left`}
        >
          {selected.length === 0 ? (
            <span className="text-[#888]">— Select presses —</span>
          ) : (
            selected.map(id => {
              const p = byId.get(id);
              return (
                <span key={id} className="inline-flex items-center gap-1 bg-[#E8F0FD] text-[#0A6ED1] text-[11px] font-medium px-1.5 py-0.5 rounded-[2px]">
                  {p ? p.name : id}
                  <span
                    role="button"
                    tabIndex={-1}
                    title="Remove press"
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); toggle(id); }}
                    className="hover:text-[#BB0000] cursor-pointer"
                  >
                    <X size={10} />
                  </span>
                </span>
              );
            })
          )}
          <ChevronDown size={13} className="ml-auto text-[#888] shrink-0" />
        </button>

        {open && (
          <div className="absolute z-[200] top-full left-0 right-0 mt-0.5 bg-white border border-[#E4E5E6] rounded-[3px] shadow-lg max-h-[220px] overflow-y-auto">
            {presses.length === 0 ? (
              <div className="px-3 py-2.5 text-[11px] text-[#888] italic">No presses configured. Add presses under Shop Floor.</div>
            ) : presses.map(p => {
              const checked = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); toggle(p.id); }}
                  className={`w-full px-2.5 py-2 text-left flex items-center gap-2 hover:bg-[#E8F0FD] transition-colors border-b border-[#F3F3F3] last:border-0 ${checked ? 'bg-[#F0F7FF]' : ''}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-[2px] border flex items-center justify-center shrink-0 ${checked ? 'bg-[#0A6ED1] border-[#0A6ED1]' : 'border-[#CCC] bg-white'}`}>
                    {checked && <Check size={10} className="text-white" />}
                  </span>
                  <span className="text-[12px] font-semibold text-[#111]">{p.name}</span>
                  <span className="text-[11px] text-[#666] font-mono">{p.tonnage}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </F>
  );
}
