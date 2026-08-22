import React from 'react';
import { useAppStore } from '../store';
import { formatINR, cn } from '../lib/utils';
import { Badge } from '../components/ui';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export function Analytics() {
  const { data } = useAppStore();
  const navigate = useNavigate();

  const slaTargets: Record<string, number> = { Hot: 4, Urgent: 24, Normal: 48, Low: 72 };

  // Real E2Q: diff quote.date − enquiry.recv for each linked enquiry
  const e2qSamples: { cust: string; hours: number; urg: string; quoteDate: Date }[] = [];
  for (const enq of data.enquiries) {
    if (!enq.qRef || !enq.recv) continue;
    const quote = data.quotes.find(q => q.id === enq.qRef);
    if (!quote?.date) continue;
    const diffH = (new Date(quote.date).getTime() - new Date(enq.recv).getTime()) / 3_600_000;
    if (diffH >= 0) e2qSamples.push({ cust: enq.cust, hours: diffH, urg: enq.urg, quoteDate: new Date(quote.date) });
  }

  const avgE2Q = e2qSamples.length
    ? (e2qSamples.reduce((a, s) => a + s.hours, 0) / e2qSamples.length).toFixed(1)
    : '0';

  // SLA: was E2Q within target hours for that urgency?
  const slaMet = e2qSamples.filter(s => s.hours <= slaTargets[s.urg]).length;
  const slaRate = e2qSamples.length ? Math.round((slaMet / e2qSamples.length) * 100) : 0;

  // Authoritative Win Rate = Won quotes ÷ total quotes (same definition the
  // Dashboard uses), so the two screens never disagree. Quote status is the
  // source of truth for outcomes; enquiry status is kept in sync separately.
  const wonQuotes = data.quotes.filter(q => q.status === 'Won');
  const winRate = data.quotes.length ? Math.round((wonQuotes.length / data.quotes.length) * 100) : 0;

  const totalItems = data.enquiries.reduce((a, e) => a + e.items.length, 0);

  const openQuotes = data.quotes.filter(q => q.status === 'Sent');
  const pipeValue = openQuotes.reduce((acc, q) => {
    return acc + q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0);
  }, 0);

  // Funnel — each stage is % of the TOTAL enquiries so bars always shrink left→right
  const fEnq = data.enquiries.length;
  const fQt  = data.enquiries.filter(e => e.qRef).length;
  const fWon = wonQuotes.length;
  const fOrd = data.orders.length;

  const funnelPct = (n: number) => fEnq ? Math.min(100, Math.round(n / fEnq * 100)) : 0;
  const funnelLabel = (n: number, base: number) =>
    base ? `${Math.round(n / base * 100)}%` : '0%';

  const funnel = [
    { label: 'Enquiries', count: fEnq, pct: '100%',                     w: 100,             color: 'bg-red-mrt'     },
    { label: 'Quoted',    count: fQt,  pct: funnelLabel(fQt, fEnq),      w: funnelPct(fQt),  color: 'bg-[#8B5CF6]'  },
    { label: 'Won',       count: fWon, pct: funnelLabel(fWon, fEnq),     w: funnelPct(fWon), color: 'bg-[#059669]'  },
    { label: 'Ordered',   count: fOrd, pct: funnelLabel(fOrd, fEnq),     w: funnelPct(fOrd), color: 'bg-[#2563EB]'  },
  ];

  // E2Q by Customer chart data — use real E2Q hours
  const custE2q: Record<string, { totalH: number; count: number }> = {};
  e2qSamples.forEach(s => {
    if (!custE2q[s.cust]) custE2q[s.cust] = { totalH: 0, count: 0 };
    custE2q[s.cust].totalH += s.hours;
    custE2q[s.cust].count  += 1;
  });
  
  const custBarData = Object.entries(custE2q)
    .map(([cust, d]) => ({ cust, avg: d.totalH / d.count }))
    .sort((a,b) => b.avg - a.avg)
    .slice(0, 5);

  const maxE2Q = Math.max(...custBarData.map(c => c.avg), 24);

  // Enquiry Sources Donut
  const sources = ['Email', 'Phone', 'WhatsApp', 'Exhibition', 'Website'];
  const srcColors = {
    'Email': '#dc2626',
    'Phone': '#2563eb',
    'WhatsApp': '#059669',
    'Exhibition': '#d97706',
    'Website': '#8b5cf6'
  };
  
  const donutData = sources.map(src => ({
    name: src,
    value: data.enquiries.filter(e => e.src === src).length,
    color: srcColors[src as keyof typeof srcColors]
  })).filter(d => d.value > 0).sort((a,b) => b.value - a.value);
  
  const totalDocs = donutData.reduce((a, b) => a + b.value, 0);

  const KpiCard = ({ title, value, delta, deltaColor }: { title: string, value: React.ReactNode, delta: React.ReactNode, deltaColor?: 'up'|'dn'|'neutral' }) => (
    <div className="bg-white border border-g200 p-[20px] relative overflow-hidden transition-all duration-300 hover:border-red-mrt hover:shadow-sm group flex flex-col justify-between">
      <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 mb-4">{title}</div>
      <div className="font-serif text-[34px] text-blk leading-none mb-3 tracking-tight">{value}</div>
      <div className={cn("text-[12px] font-mono tracking-tight", deltaColor === 'up' ? "text-[#059669]" : deltaColor === 'dn' ? "text-[#059669]" : "text-g500")}>
        {delta}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-y-auto bg-g50">
      <div className="pt-6 px-[30px] shrink-0">
        <div className="flex items-start justify-between gap-3 border-b border-g200 pb-5 mb-5">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1.5">Module 05</div>
            <h1 className="font-serif text-[32px] text-blk tracking-tight leading-tight">Analytics — <em className="italic text-red-h">E2Q Intelligence</em></h1>
            <p className="text-[13px] text-g600 mt-2 font-medium">Enquiry-to-Quotation time, pipeline health, conversion funnel, SLA compliance. All live from your data.</p>
          </div>
        </div>
      </div>

      <div className="px-[30px] pb-8">
        <div className="grid grid-cols-5 gap-4 mb-5">
          <KpiCard
            title="Avg E2Q Time"
            value={<>{avgE2Q}<span className="text-[18px] text-red-mrt ml-1">h</span></>}
            delta={e2qSamples.length > 0 ? `Based on ${e2qSamples.length} quoted enquir${e2qSamples.length === 1 ? 'y' : 'ies'}` : 'No quoted enquiries yet'}
          />
          <KpiCard
            title="SLA Compliance"
            value={<>{slaRate}<span className="text-[20px] text-red-mrt ml-1">%</span></>}
            delta={e2qSamples.length > 0 ? `${slaMet} of ${e2qSamples.length} within target` : 'No data yet'}
          />
          <KpiCard
            title="Win Rate"
            value={<>{winRate}<span className="text-[20px] text-red-mrt ml-1">%</span></>}
            delta={data.quotes.length > 0 ? `${wonQuotes.length} won of ${data.quotes.length} quotes` : 'No quotes yet'}
          />
          <KpiCard 
            title="Total Line Items" 
            value={totalItems} 
            delta={`Across ${fEnq} enquiries`} 
          />
          <KpiCard 
            title="Total Pipeline" 
            value={formatINR(pipeValue)} 
            delta={`${openQuotes.length} open quotes`} 
          />
        </div>

        <div className="grid grid-cols-[1.1fr_1fr] gap-4 mb-4">
          <div className="bg-white border border-g200 p-[20px]">
            <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 mb-6">E2Q Time by Customer (Hours)</div>
            <div className="space-y-[15px]">
              {custBarData.map(c => {
                const color = c.avg > 24 ? 'bg-red-mrt' : (c.avg > 12 ? 'bg-[#d97706]' : 'bg-[#059669]');
                return (
                  <div key={c.cust} className="flex items-center gap-4">
                    <div className="w-[130px] text-[12px] font-semibold text-blk truncate shrink-0">{c.cust}</div>
                    <div className="flex-1 h-[8px] bg-g100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${(c.avg / maxE2Q) * 100}%` }}></div>
                    </div>
                    <div className="font-mono text-[11px] font-bold text-blk w-[35px] text-right">{c.avg.toFixed(1)}h</div>
                  </div>
                )
              })}
              {custBarData.length === 0 && <div className="text-[12px] text-g400 italic">Not enough data.</div>}
            </div>
            
            <div className="mt-8 flex items-center gap-4 text-[10.5px] font-medium text-g500">
               <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#059669]"></div> &lt;12h (SLA met)</div>
               <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#d97706]"></div> 12-24h</div>
               <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-mrt"></div> &gt;24h breach</div>
            </div>
          </div>
          
          <div className="bg-white border border-g200 p-[20px]">
            <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 mb-8">Conversion Funnel</div>
            <div className="flex flex-col items-center w-full">
              {funnel.map((f, i) => (
                <div key={f.label} className="relative w-full flex flex-col items-center">
                  <div
                    className={cn(
                      "h-[44px] rounded-[3px] flex items-center justify-between px-5 font-mono text-[13px] font-bold text-white transition-all duration-700 shadow-sm",
                      f.count === 0 ? "bg-g200 text-g400" : f.color
                    )}
                    style={{ width: f.count === 0 ? '40%' : `${Math.max(40, f.w)}%` }}
                  >
                    <span>{f.label}</span>
                    <span className="flex items-center gap-2">
                      {f.count} <span className="opacity-80 font-normal">({f.pct})</span>
                    </span>
                  </div>
                  {i < funnel.length - 1 && (
                    <div className="text-[11px] text-g300 leading-none h-[14px] flex items-center">▼</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-[1fr_1.5fr] gap-4 mt-4">
          
          {/* Pie Chart Panel */}
          <div className="bg-white border border-g200 p-[20px]">
            <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 mb-6">Enquiry Sources</div>
            {donutData.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="w-[140px] h-[140px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="font-serif text-[24px] text-blk leading-none">{totalDocs}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-g500 mt-0.5">total</span>
                  </div>
                </div>
                
                <div className="flex-1 space-y-3">
                  {donutData.map(d => (
                    <div key={d.name} className="flex justify-between items-center text-[12px]">
                       <div className="flex items-center gap-2 font-medium text-blk">
                          <div className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: d.color }}></div>
                          {d.name}
                       </div>
                       <div className="font-mono font-bold text-g600">{d.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
               <div className="text-[12px] text-g400 italic">No enquiry data.</div>
            )}
          </div>

          <div className="bg-white border border-g200 p-[20px] pb-6 flex flex-col justify-between">
            <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 mb-6">SLA Compliance by Urgency</div>
            <div className="space-y-4">
              {['Hot', 'Urgent', 'Normal', 'Low'].map(u => {
                const uSamples = e2qSamples.filter(s => s.urg === u);
                const uMet = uSamples.filter(s => s.hours <= slaTargets[u]).length;
                const uPct = uSamples.length ? Math.round((uMet / uSamples.length) * 100) : null;
                const uCls = uPct === null ? 'bg-g300' : (uPct >= 80 ? 'bg-[#059669]' : (uPct >= 50 ? 'bg-[#d97706]' : 'bg-red-mrt'));
                
                return (
                  <div key={u} className="flex items-center gap-4">
                    <div className="min-w-[70px]">
                      <Badge status={u as any} />
                    </div>
                    <div className="flex-1 h-[8px] bg-g100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${uCls}`} style={{ width: `${uPct || 0}%` }}></div>
                    </div>
                    <div className="font-mono text-[11.5px] font-bold text-blk min-w-[38px] text-right">{uPct !== null ? `${uPct}%` : '--'}</div>
                  </div>
                );
              })}
            </div>

            {/* Warning Banner */}
            <div className="mt-[20px]">
              {data.enquiries.filter(e => !e.qRef && e.ageH > slaTargets[e.urg]).slice(0, 1).map(e => (
                <div 
                  key={e.id}
                  onClick={() => navigate(`/enquiries/new?id=${e.id}`)}
                  className="flex items-center gap-2 p-[12px_16px] bg-orange-50 border border-orange-200 rounded-[4px] text-orange-900 cursor-pointer hover:bg-orange-100 transition-colors"
                >
                  <span className="text-[14px]">⚠</span>
                  <div className="text-[11.5px] font-medium">
                    <strong className="font-mono tracking-wider">{e.id}</strong> {e.urg} · <span className="font-bold">{e.ageH.toFixed(1)}h</span> without response — <span className="font-bold text-blk">{e.cust}</span>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
