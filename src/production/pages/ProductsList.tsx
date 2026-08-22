// Products & BOM — list page. Mirrors v2 renderProducts().

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { Button } from '../../components/ui';
import {
  Table, THead, TH, TR, TD, EmptyRow, PageHeader, FilterBar, StatusPill,
} from '../components/table';
import { useProductionData } from '../lib/useProductionData';

export function ProductsList() {
  const navigate = useNavigate();
  const { products, compounds, presses, loading } = useProductionData();
  const [q, setQ] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');

  const grades = useMemo(() =>
    [...new Set(compounds.map(c => c.grade))].sort(),
    [compounds]
  );

  const families = useMemo(() =>
    [...new Set(products.map(p => p.family_code).filter(Boolean) as string[])].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (familyFilter && p.family_code !== familyFilter) return false;
      if (gradeFilter) {
        const comp = compounds.find(c => c.id === p.compound_id);
        if (comp?.grade !== gradeFilter) return false;
      }
      if (q) {
        const t = q.toLowerCase();
        if (!(
          p.code.toLowerCase().includes(t) ||
          (p.family_code || '').toLowerCase().includes(t) ||
          p.name.toLowerCase().includes(t) ||
          (p.customer_name || '').toLowerCase().includes(t) ||
          (p.mould_code || '').toLowerCase().includes(t) ||
          (p.draw_ref || '').toLowerCase().includes(t)
        )) return false;
      }
      return true;
    });
  }, [products, compounds, q, gradeFilter, familyFilter]);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module="Production · Phase 2"
        title="Products"
        accent="& BOM"
        subtitle="Product master with mould, cure, production rates, and bill of materials."
        actions={
          <Button onClick={() => navigate('/production/products/new')} variant="primary" className="gap-2">
            <Plus size={14} className="stroke-2" /> New Product
          </Button>
        }
      />

      <FilterBar>
        <div className="flex items-center gap-1.5 bg-white border border-[#E4E5E6] rounded px-2 h-7 min-w-[220px] focus-within:border-[#0A6ED1] focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-[#555] shrink-0" />
          <input
            type="text"
            placeholder="Code, family, name, mould, customer…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-[#111] w-full placeholder:text-[#555]"
          />
        </div>

        <select
          title="Filter by family (Type_Model_MOC)"
          className="font-sans text-xs text-[#111] bg-white border border-[#E4E5E6] rounded py-1 pl-2 pr-6 cursor-pointer outline-none"
          value={familyFilter}
          onChange={e => setFamilyFilter(e.target.value)}
        >
          <option value="">All Families</option>
          {families.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        <select
          title="Filter by compound grade"
          className="font-sans text-xs text-[#111] bg-white border border-[#E4E5E6] rounded py-1 pl-2 pr-6 cursor-pointer outline-none"
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value)}
        >
          <option value="">All Grades</option>
          {grades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <div className="ml-auto font-mono text-[10px] text-[#333]">
          {filtered.length} products
        </div>
      </FilterBar>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Family</TH>
              <TH>Product Name</TH>
              <TH>Customer</TH>
              <TH>Compound</TH>
              <TH>Mould</TH>
              <TH>Press</TH>
              <TH>Cure</TH>
              <TH>Mould Rate</TH>
              <TH>BOM</TH>
              <TH>Rev</TH>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <EmptyRow colSpan={11} text="Loading…" />
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={11} text="No products found." />
            ) : filtered.map(p => {
              const comp = compounds.find(c => c.id === p.compound_id);
              const mouldRate = p.cure_time_min && p.cavities
                ? ((60 / p.cure_time_min) * p.cavities).toFixed(0)
                : '—';
              return (
                <TR key={p.id} onClick={() => navigate(`/production/products/${p.id}`)}>
                  <TD>
                    <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">{p.code}</span>
                  </TD>
                  <TD className="font-mono text-[10.5px] text-[#666]">
                    {p.family_code || '—'}
                  </TD>
                  <TD>
                    <div className="font-semibold text-[#111] text-[12.5px]">{p.name}</div>
                    {p.draw_ref && <div className="text-[10.5px] text-[#333] font-mono">{p.draw_ref}</div>}
                  </TD>
                  <TD className="text-[12.5px]">{p.customer_name || '—'}</TD>
                  <TD>
                    {comp ? (
                      <div>
                        <span className="font-mono text-[11px] font-semibold text-[#111]">{comp.code}</span>
                        <span className="ml-1.5 text-[10px] text-[#333]">{comp.grade}</span>
                      </div>
                    ) : <span className="text-[#555]">—</span>}
                  </TD>
                  <TD className="font-mono text-[11px]">
                    {p.mould_code || '—'}
                    {p.cavities && <span className="text-[#333] text-[10px]"> ({p.cavities} cav)</span>}
                  </TD>
                  <TD className="font-mono text-[11px] text-[#666]">
                    {p.press_ids && p.press_ids.length
                      ? p.press_ids.map(pid => presses.find(pr => pr.id === pid)?.name || pid).join(', ')
                      : p.tonnage ? `${p.tonnage}T` : '—'}
                  </TD>
                  <TD className="font-mono text-[11px] text-[#666]">
                    {p.cure_temp_c ? `${p.cure_temp_c}°C` : '—'}
                    {p.cure_time_min && <span> · {p.cure_time_min} min</span>}
                  </TD>
                  <TD className="font-mono text-[11px]">
                    {mouldRate !== '—' ? `${mouldRate} pcs/hr` : '—'}
                    {p.finish_rate && <span className="text-[#333]"> · {p.finish_rate} fin</span>}
                  </TD>
                  <TD>
                    <StatusPill
                      status="BOM Ready"
                      tone="good"
                    />
                  </TD>
                  <TD className="font-mono text-[10.5px] text-[#333]">
                    {p.revision || '—'}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
