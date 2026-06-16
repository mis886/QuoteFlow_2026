import React from 'react';
import { useAppStore } from '../store';
import { formatINR } from '../lib/utils';
import { Button, Badge } from '../components/ui';
import { useNavigate } from 'react-router-dom';
import { PieChart, ArrowRight, Download, Link as LinkIcon, Clock, Map, Layers, Mail, Server, Database, Code, ShieldCheck } from 'lucide-react';

export function Blueprint() {
  const { data } = useAppStore();
  const navigate = useNavigate();

  const totalEnq = data.enquiries.length;
  const totalQt = data.quotes.length;
  const totalOrd = data.orders.length;
  const totalCust = data.customers.length;
  
  const totalLI = data.enquiries.reduce((a, e) => a + e.items.length, 0);
  
  const pipeline = data.quotes.filter(q => q.status === 'Sent').reduce((a, q) => {
    return a + q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0);
  }, 0);

  const slaTargets: Record<string, number> = { Hot: 4, Urgent: 24, Normal: 48, Low: 72 };
  const slaMet = data.enquiries.filter(e => e.qRef && e.ageH <= slaTargets[e.urg]).length;
  const slaTotal = data.enquiries.filter(e => e.qRef).length;
  const slaRate = slaTotal ? Math.round((slaMet / slaTotal) * 100) : 0;

  const modules = [
    { id: 'M01', name: 'Enquiry Register', icon: '📥', status: 'Live', progress: 100, desc: 'Multi-line-item enquiry logging with auto-numbering, SLA timer, urgency levels, source tracking, and inline item expansion.', entities: 'ENQUIRIES, LINE_ITEMS', records: totalEnq + ' enquiries · ' + totalLI + ' line items', color: 'text-red-mrt border-red-mrt', bg: 'bg-red-mrt' },
    { id: 'M02', name: 'Quotation Engine', icon: '📄', status: 'Live', progress: 100, desc: 'One-click ENQ→Quote conversion. Items auto-populate. Add pricing + HSN + GST. PDF generation. Gmail integration.', entities: 'QUOTES, QUOTE_ITEMS', records: totalQt + ' quotes · ' + formatINR(Math.round(pipeline)) + ' pipeline', color: 'text-sQ border-sQ', bg: 'bg-sQ' },
    { id: 'M03', name: 'Order Management', icon: '📦', status: 'Live', progress: 100, desc: 'Convert Won quotes to orders. Amend MOC/qty/rate per PO. PO number tracking. Pro-forma invoice. Delivery scheduling.', entities: 'ORDERS, ORDER_ITEMS', records: totalOrd + ' orders', color: 'text-sW border-sW', bg: 'bg-sW' },
    { id: 'M04', name: 'Customer Master', icon: '👤', status: 'Live', progress: 100, desc: 'Single source of truth — GSTIN, Incoterms, currency, payment terms, segment. Auto-populates all downstream forms.', entities: 'CUSTOMERS', records: totalCust + ' customers', color: 'text-sN border-sN', bg: 'bg-sN' },
    { id: 'M05', name: 'Analytics Engine', icon: '📊', status: 'Live', progress: 100, desc: 'E2Q time distribution, SLA compliance heatmap, conversion funnel, source analysis, pipeline by customer. All computed live.', entities: 'Computed from all modules', records: '6 KPI widgets · 4 chart panels', color: 'text-sR border-sR', bg: 'bg-sR' },
    { id: 'M06', name: 'PDF Generator', icon: '🖨️', status: 'Live', progress: 100, desc: 'Branded Himalaya Terpenesletterhead PDF. Auto-populated from quote data. High resolution vector shapes.', entities: 'QUOTE_PDF_TEMPLATES', records: 'Letterhead Integrated', color: 'text-[#EA580C] border-[#EA580C]', bg: 'bg-[#EA580C]' },
    { id: 'M07', name: 'App Settings', icon: '⚙️', status: 'Live', progress: 100, desc: 'Upload custom PDF header images and manage application configurations directly from settings.', entities: 'LOCAL_STORAGE', records: 'Custom PDF Branding', color: 'text-sW border-sW', bg: 'bg-sW' },
    { id: 'M08', name: 'Follow-Up CRM', icon: '📞', status: 'Live', progress: 100, desc: 'Split-panel Command Centre for quote follow-ups. Log activity, schedule next steps, and track overdue responses.', entities: 'FOLLOWUPS', records: 'Real-time logging active', color: 'text-sW border-sW', bg: 'bg-sW' },
  ];

  const requirementsByModule = [
    { module: 'App Shell', status: '✅ Live', features: ['Dark Sidebar with Nav Groups', 'White logo area', 'Red left-border active state', 'Nav badges (Counts)', 'Topbar breadcrumb', 'Global Search Engine', 'User avatar & Logout', 'Slide-in Detail Panels'] },
    { module: 'Dashboard', status: '✅ Live', features: ['5 Live KPI Cards', 'Needs Attention (Age ≥4h)', 'Recent Enquiries Panel', 'Quote Pipeline & Active Orders', 'KPI Click-to-Navigate'] },
    { module: 'Enquiries', status: '✅ Live', features: ['Status Tab Filter Bar', 'Urgency/Assigned Dropdowns', 'Age Pulse Animation', 'Source Icons (✉📞💬)', 'Activity Timeline', 'ENQ→Quote Conversion'] },
    { module: 'Quotations', status: '✅ Live', features: ['Line Items Total Box', 'Live GST/Grand Total math', 'PDF Generation (jsPDF)', 'Gmail mailto: integration', 'Draft/Sent/Won states'] },
    { module: 'Orders', status: '✅ Live', features: ['Won Quote→Order Banner', 'Amendable MOC/Qty/Rates', 'PO Number/Date tracking', 'Pro-forma Invoice Gen'] },
    { module: 'Customers', status: '✅ Live', features: ['Segment Dropdown Filters', 'Customer Code Auto-gen', 'Sites JSONB support', 'New ENQ shortcut button'] },
    { module: 'Analytics', status: '✅ Live', features: ['E2Q Horizontal Bar Chart', 'Conversion Funnel SVG', 'Sources Donut Chart', 'SLA Urgency Bar Chart'] },
    { module: 'Search', status: '⚠ Partial', features: ['Topbar global search input', 'Result filtering in views', 'Deeper metadata search'] },
    { module: 'Follow-Ups', status: '✅ Live', features: ['Split-Panel CRM Layout', 'Activity Logging Timeline', 'Follow-up Scheduling logic', 'Supabase Real-time Table'] },
  ];

  const schema = [
    { table: 'ENQUIRIES', cols: ['id', 'recv', 'src', 'cust', 'contact', 'email', 'urg', 'status', 'assigned', 'notes', 'ageH', 'qRef'], pk: 'id', fk: 'cust → CUSTOMERS.name', rows: totalEnq },
    { table: 'ENQ_LINE_ITEMS', cols: ['enqId', 'seq', 'desc', 'mat', 'qty', 'uom', 'drwg'], pk: 'enqId+seq', fk: 'enqId → ENQUIRIES.id', rows: totalLI },
    { table: 'QUOTES', cols: ['id', 'enqRef', 'cust', 'date', 'validity', 'status', 'inco', 'curr', 'pay'], pk: 'id', fk: 'enqRef → ENQUIRIES.id', rows: totalQt },
    { table: 'QUOTE_ITEMS', cols: ['quoteId', 'seq', 'desc', 'hsn', 'mat', 'qty', 'uom', 'unitPrice', 'gst', 'total'], pk: 'quoteId+seq', fk: 'quoteId → QUOTES.id', rows: data.quotes.reduce((a, q) => a + q.items.length, 0) },
    { table: 'ORDERS', cols: ['id', 'quoteRef', 'enqRef', 'cust', 'poNo', 'poDate', 'dlvDate', 'status', 'value'], pk: 'id', fk: 'quoteRef → QUOTES.id', rows: totalOrd },
    { table: 'ORDER_ITEMS', cols: ['orderId', 'seq', 'desc', 'mat', 'qty', 'uom', 'agreedRate', 'gst', 'total', 'remarks'], pk: 'orderId+seq', fk: 'orderId → ORDERS.id', rows: data.orders.reduce((a, o) => a + o.items.length, 0) },
    { table: 'CUSTOMERS', cols: ['code', 'name', 'seg', 'city', 'gstin', 'contact', 'email', 'phone', 'inco', 'curr', 'pay'], pk: 'code', fk: '—', rows: totalCust },
    { table: 'FOLLOWUPS', cols: ['id', 'quote_id', 'owner', 'next_date', 'logs'], pk: 'id', fk: 'quote_id → QUOTES.id', rows: modules.find(m => m.id === 'M08')?.records ? 0 : 0 },
  ];

  const integrations = [
    { name: 'Local Storage', icon: '💾', role: 'Primary Database', status: 'Active', desc: 'All data stored in browser storage for instant testing.', health: 100 },
    { name: 'React Context', icon: '⚡', role: 'State Management', status: 'Active', desc: 'Centralized store for realtime UI updates across all modules.', health: 100 },
    { name: 'jsPDF', icon: '📄', role: 'Document Generation', status: 'Active', desc: 'Client-side PDF generation for quotes and proforma invoices.', health: 100 },
    { name: 'Supabase PostgreSQL', icon: '🗄️', role: 'Cloud Database', status: 'Active', desc: 'Secure production database via Supabase. Authenticated access only.', health: 100 },
    { name: 'Supabase Storage', icon: '📦', role: 'File Storage', status: 'Active', desc: 'S3-compatible bucket for enquiry attachments and drawing storage.', health: 100 },
    { name: 'Gmail API', icon: '✉️', role: 'Email Automation', status: 'Active (mailto)', desc: 'Opens email client with pre-filled details for attachments.', health: 50 },
    { name: 'WhatsApp Business', icon: '💬', role: 'Notifications', status: 'Planned', desc: 'Alerts for SLA breaches and quote confirmations.', health: 10 },
  ];

  const phases = [
    { tag: 'Phase 0', week: 'Week 1', title: 'Enquiry Capture + React Setup', progress: 100, status: 'Complete', tasks: ['Multi-line-item entry form', 'Auto ENQ-YYYY-NNN numbering', 'React Context State logic'] },
    { tag: 'Phase 1', week: 'Week 2', title: 'Customer Master & Shell', progress: 100, status: 'Complete', tasks: ['CRUD customer master', 'Sidebar navigation', 'Global search', 'Responsive layout'] },
    { tag: 'Phase 2', week: 'Week 3–4', title: 'Quote Generator + PDF', progress: 100, status: 'Complete', tasks: ['ENQ→Quote conversion', 'Items auto-populate (zero re-entry)', 'Pricing + HSN entry', 'PDF generation'] },
    { tag: 'Phase 3', week: 'Week 5', title: 'Analytics Dashboard', progress: 100, status: 'Complete', tasks: ['E2Q time distribution', 'Conversion funnel', 'SLA compliance heatmap'] },
    { tag: 'Phase 4', week: 'Week 6', title: 'Order Module', progress: 100, status: 'Complete', tasks: ['Won quote → Order conversion', 'Amend MOC/rates per PO', 'PO number tracking', 'Delivery date scheduling'] },
    { tag: 'Phase 5', week: 'Week 7', title: 'Cloud & API Integration', progress: 100, status: 'Complete', tasks: ['Supabase Storage for attachments', 'Authenticated data syncing', 'Real-time database mirroring'] },
    { tag: 'Phase 6', week: 'Week 8', title: 'Follow-Up Command Centre', progress: 100, status: 'Complete', tasks: ['Split-panel CRM view', 'Activity logging timeline', 'Overdue scheduling logic'] },
  ];

  const timeline = [
    { date: 'May 06 - May 08', event: 'Follow-Up Module Implementation', desc: 'Build split-panel CRM view and activity logging.' },
    { date: 'May 10 - May 12', event: 'Global Search Refinement', desc: 'Sync top-bar search with active view contexts.' },
    { date: 'May 14 - May 15', event: 'SLA Alert System', desc: 'Implement automated email/whatsapp breach alerts.' },
    { date: 'May 18 - May 20', event: 'Final UAT & Polish', desc: 'Design consistency check and production deployment.' },
  ];

  const KpiCard = ({ title, value, delta, up }: { title: string, value: string | React.ReactNode, delta: string, up?: boolean }) => (
    <div className="bg-white border border-g200 p-[16px_18px] relative overflow-hidden transition-all duration-300 hover:border-red-mrt hover:shadow-[0_4px_18px_rgba(0,0,0,0.05)] group">
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-mrt transform scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
      <div className="font-mono text-[8.5px] font-bold tracking-[2px] uppercase text-g500 mb-2">{title}</div>
      <div className={"font-serif text-[28px] text-blk leading-none mb-1"}>{value}</div>
      <div className={`text-[11px] font-mono ${up === true ? 'text-sW' : up === false ? 'text-red-mrt' : 'text-g500'}`}>{delta}</div>
    </div>
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-y-auto pb-10">
      <div className="pt-5 px-6 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">System Architecture</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight mb-2">System <em className="italic text-red-mrt">Blueprint</em></h1>
            <p className="text-xs text-g500 font-light max-w-2xl">Complete module registry, React architecture, integrations, SLA engine, and phased roadmap for the Himalaya TerpenesEQ System.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/analytics')}>← Analytics</Button>
            <Button variant="primary" onClick={() => window.print()}>Export Blueprint</Button>
          </div>
        </div>
      </div>

      <div className="px-6 space-y-4">

        {/* KPIs */}
        <div className="grid grid-cols-5 gap-2.5">
          <KpiCard title="Modules Live" value={<>{modules.filter(m => m.status === 'Live').length}<span className="text-[15px] text-red-mrt">/{modules.length}</span></>} delta={`${modules.filter(m => m.status !== 'Live').length} planned for future`} up={true} />
          <KpiCard title="Data Entities" value={schema.length.toString()} delta={`${totalEnq + totalQt + totalOrd + totalCust} total records`} />
          <KpiCard title="Line Items Tracked" value={totalLI + data.quotes.reduce((a,q) => a+q.items.length,0) + data.orders.reduce((a,o) => a+o.items.length,0)} delta="Across all modules" />
          <KpiCard title="SLA Compliance" value={<>{slaRate}<span className="text-[15px] text-red-mrt">%</span></>} delta={`${slaMet}/${slaTotal} within target`} up={slaRate >= 70} />
          <KpiCard title="Build Progress" value={<>{Math.round((modules.filter(m => m.status === 'Live').length / modules.length) * 100)}<span className="text-[15px] text-red-mrt">%</span></>} delta="Phase 6 in pipeline" up={true} />
        </div>
        
        {/* PROJECTED TIMELINE */}
        <div className="bg-white border border-g200">
          <div className="p-[11px_18px] border-b border-g200 flex justify-between items-center">
            <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">📅 Projected Implementation Timeline</span>
            <span className="font-mono text-[10px] text-g400 font-bold">V3 Final Launch: May 20, 2026</span>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              {timeline.map((item, i) => (
                <div key={i} className="flex gap-4 group">
                  <div className="w-[120px] shrink-0">
                    <div className="font-mono text-[11px] font-bold text-red-mrt bg-red-lt rounded px-2 py-1 inline-block">{item.date}</div>
                  </div>
                  <div className="flex-1 pb-4 border-b border-g100 group-last:border-0 border-dashed">
                    <div className="text-[13.5px] font-bold text-blk">{item.event}</div>
                    <div className="text-[12px] text-g500 mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CORE PRINCIPLE */}
        <div className="bg-white border border-g200">
          <div className="p-[11px_18px] border-b border-g200 flex items-center gap-2">
            <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">🏗️ Core Principle — Enter Once, Use Everywhere</span>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <div className="bg-sW/10 border border-sW/20 text-sW p-[7px_12px] rounded-[3px] text-[11.5px] font-medium whitespace-nowrap">
                <strong>📥 ENQ Logged</strong><br/><span className="text-[10px] text-g600 opacity-80 font-normal">Line items entered once</span>
              </div>
              <ArrowRight size={16} className="text-g400" />
              <div className="bg-g100 border border-g200 text-blk p-[7px_12px] rounded-[3px] text-[11.5px] font-medium whitespace-nowrap">
                <strong>🔍 Review & SLA</strong><br/><span className="text-[10px] text-g500 font-normal">Timer starts, urgency set</span>
              </div>
              <ArrowRight size={16} className="text-g400" />
              <div className="bg-red-mrt border border-red-mrt text-white p-[7px_12px] rounded-[3px] text-[11.5px] font-medium whitespace-nowrap">
                <strong>📄 Quote Created</strong><br/><span className="text-[10px] text-white/70 font-normal">Items auto-fill + pricing</span>
              </div>
              <ArrowRight size={16} className="text-g400" />
              <div className="bg-g100 border border-g200 text-blk p-[7px_12px] rounded-[3px] text-[11.5px] font-medium whitespace-nowrap">
                <strong>🖨️ PDF + Email</strong><br/><span className="text-[10px] text-g500 font-normal">One-click send</span>
              </div>
              <ArrowRight size={16} className="text-g400" />
              <div className="bg-sW/10 border border-sW/20 text-sW p-[7px_12px] rounded-[3px] text-[11.5px] font-medium whitespace-nowrap">
                <strong>📦 Order Confirmed</strong><br/><span className="text-[10px] opacity-80 font-normal">Amend if PO differs</span>
              </div>
            </div>
            <div className="text-[12px] text-g500 mt-3">Total data entry per cycle: <strong className="text-blk font-semibold">One time only.</strong> Line items flow forward automatically.</div>
          </div>
        </div>

        {/* MODULE REGISTRY */}
        <div className="bg-white border border-g200">
          <div className="p-[11px_18px] border-b border-g200 flex justify-between items-center">
            <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">📦 Module Registry — {modules.length} Modules</span>
            <span className="text-[11px] text-g500">{modules.filter(m => m.status === 'Live').length} Live · {modules.filter(m => m.status !== 'Live').length} Planned</span>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {modules.map(m => (
              <div key={m.id} className={`border ${m.status === 'Live' ? 'border-g200' : 'border-g200/50 opacity-80'} rounded-[5px] p-4 relative overflow-hidden flex flex-col hover:shadow-md transition-all duration-300`}>
                <div className={`absolute bottom-0 left-0 right-0 h-[2px] ${m.bg} origin-left transition-all duration-300`} style={{ transform: `scaleX(${m.progress / 100})` }} />
                
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[18px]">{m.icon}</span>
                    <div>
                      <div className={`font-mono text-[8.5px] font-bold tracking-[2px] uppercase ${m.color.split(' ')[0]}`}>{m.id}</div>
                      <div className="text-[13.5px] font-semibold text-blk">{m.name}</div>
                    </div>
                  </div>
                  <Badge status={m.status === 'Live' ? 'Won' : 'In Review' as any} />
                </div>
                
                <p className="text-[11.5px] text-g600 leading-[1.55] mb-3 flex-1">{m.desc}</p>
                
                <div className="flex justify-between items-center mt-auto">
                  <span className="font-mono text-[9px] text-g500">{m.records}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-[60px] h-[4px] bg-g100 rounded-[3px] overflow-hidden">
                      <div className={`h-full ${m.bg} rounded-[3px]`} style={{ width: `${m.progress}%` }}></div>
                    </div>
                    <span className={`font-mono text-[9px] font-bold ${m.color.split(' ')[0]}`}>{m.progress}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SYSTEM REQUIREMENTS CHECKLIST */}
        <div className="bg-white border border-g200">
          <div className="p-[11px_18px] border-b border-g200 flex justify-between items-center">
            <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">📋 Detailed V3 Functional Requirements</span>
            <span className="font-mono text-[10px] text-sW font-bold">Comprehensive Parity Check</span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-4 gap-4">
              {requirementsByModule.map((mod, idx) => (
                <div key={idx} className="border border-g200 p-3 rounded-[3px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12.5px] font-bold text-blk">{mod.module}</span>
                    <span className="text-[12px]">{mod.status}</span>
                  </div>
                    <div className="space-y-1">
                      {mod.features.map((feat, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-1.5">
                          <div className={`w-1 h-1 rounded-full mt-1.5 ${mod.status.includes('✅') ? 'bg-sW' : mod.status.includes('⚠') ? 'bg-sR' : 'bg-red-mrt'}`} />
                          <span className="text-[10px] text-g600 leading-tight">{feat}</span>
                        </div>
                      ))}
                    </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DATA SCHEMA */}
        <div className="bg-white border border-g200">
          <div className="p-[11px_18px] border-b border-g200 flex justify-between items-center">
            <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">🗄️ Data Schema — {schema.length} Entities</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead className="bg-g100">
                <tr>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 text-left p-[9px_13px]">Entity</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 text-left p-[9px_13px]">Columns</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 text-left p-[9px_13px]">Primary Key</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 text-left p-[9px_13px]">Foreign Key</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 text-right p-[9px_13px]">Records</th>
                </tr>
              </thead>
              <tbody>
                {schema.map((s, i) => (
                  <tr key={i} className="border-b border-g100">
                    <td className="p-[10px_13px]">
                      <span className={`font-mono text-[11px] font-bold text-red-mrt bg-red-lt px-1.5 py-0.5 rounded-[2px]`}>
                        {s.table}
                      </span>
                    </td>
                    <td className="p-[10px_13px]">
                      <div className="flex flex-wrap gap-1">
                        {s.cols.map(c => (
                          <span key={c} className="font-mono text-[9.5px] bg-g100 text-g700 px-1.5 py-px rounded-[2px]">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-[10px_13px] font-mono text-[10px] text-sQ font-bold">{s.pk}</td>
                    <td className="p-[10px_13px] font-mono text-[10px] text-g500">{s.fk}</td>
                    <td className="p-[10px_13px] text-right font-mono font-bold">{s.rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {/* INTEGRATIONS */}
          <div className="bg-white border border-g200">
            <div className="p-[11px_18px] border-b border-g200">
              <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">🔗 Integration Map</span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {integrations.map(ig => (
                <div key={ig.name} className="flex items-center gap-3 pb-2 border-b border-g100 last:border-0 last:pb-0">
                  <span className="text-[20px] shrink-0">{ig.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-bold">{ig.name} <span className="font-normal text-[10px] text-g500 ml-1">— {ig.role}</span></div>
                    <div className="text-[11px] text-g500 mt-px">{ig.desc}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge status={ig.status.includes('Active') ? 'Won' : 'In Review' as any} />
                    <div className="w-[40px] h-[3px] bg-g100 rounded-[2px] overflow-hidden mt-0.5">
                      <div className={`h-full rounded-[2px] ${ig.status.includes('Active') ? 'bg-sW' : 'bg-sR'}`} style={{ width: `${ig.health}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ROADMAP */}
          <div className="bg-white border border-g200">
            <div className="p-[11px_18px] border-b border-g200 flex justify-between items-center">
              <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">🗺️ Phased Build Roadmap</span>
              <span className="font-mono text-[10px] text-sW font-bold">{phases.filter(p => p.status === 'Complete').length}/{phases.length} complete</span>
            </div>
            <div className="p-4">
              <div className="relative pl-6 border-l-2 border-g200">
                {phases.map((p, i) => {
                  const isDone = p.status === 'Complete';
                  const clr = isDone ? 'bg-sW border-sW/30 text-sW' : 'bg-g400 border-g400/30 text-g500';
                  
                  return (
                    <div key={i} className="relative pb-5 last:pb-0">
                      <div className={`absolute -left-[31px] top-1 w-3 h-3 rounded-full border-[3px] border-cream shadow-[0_0_0_2px] ${isDone ? 'bg-sW shadow-sW/50' : 'bg-g400 shadow-g400/50'}`}></div>
                      
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-mono text-[8.5px] font-bold tracking-[2px] uppercase ${isDone ? 'text-sW' : 'text-g400'}`}>{p.tag} — {p.week}</span>
                            <span className={`text-[9px] px-1.5 py-px rounded font-medium ${isDone ? 'bg-sW/10 text-sW' : 'bg-g100 text-g500'}`}>{p.status}</span>
                          </div>
                          <div className="text-[14px] font-semibold text-blk mb-1">{p.title}</div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {p.tasks.map(t => (
                              <span key={t} className={`text-[10.5px] px-2 py-0.5 rounded-[2px] font-medium ${isDone ? 'bg-sW/10 text-sW' : 'bg-g100 text-g600'}`}>
                                {isDone ? '✓ ' : ''}{t}
                              </span>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1 min-w-[70px]">
                          <div className="w-full h-[5px] bg-g100 rounded-[3px] overflow-hidden">
                            <div className={`h-full ${isDone ? 'bg-sW' : 'bg-g400'} rounded-[3px]`} style={{ width: `${p.progress}%` }}></div>
                          </div>
                          <span className={`font-mono text-[10px] font-bold ${isDone ? 'text-sW' : 'text-g400'}`}>{p.progress}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* TECH STACK */}
        <div className="grid grid-cols-3 gap-3.5">
          <div className="bg-white border border-g200 p-[16px_18px]">
            <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[10px]">Frontend Typography</div>
            <div className="text-[12px] text-g600 leading-[1.8]">
              <div><strong className="text-blk">Display:</strong> Instrument Serif</div>
              <div><strong className="text-blk">Body:</strong> Outfit</div>
              <div><strong className="text-blk">Mono:</strong> JetBrains Mono</div>
              <div className="mt-2 border-t border-g100 pt-2"><strong className="text-blk">React 18</strong> + Vite</div>
              <div><strong className="text-blk">Tailwind CSS</strong></div>
            </div>
          </div>
          <div className="bg-white border border-g200 p-[16px_18px]">
            <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-sQ mb-[10px]">Backend & Storage</div>
            <div className="text-[12px] text-g600 leading-[1.8]">
              <div><strong className="text-blk">Supabase</strong> — PostgreSQL DB</div>
              <div><strong className="text-blk">Supabase Storage</strong> — File S3</div>
              <div><strong className="text-blk">Local Engine</strong> — Browser Cache fallback</div>
              <div><strong className="text-blk">jsPDF</strong> — Letterhead Generation</div>
            </div>
          </div>
          <div className="bg-white border border-g200 p-[16px_18px]">
            <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-sW mb-[10px]">Architecture</div>
            <div className="text-[12px] text-g600 leading-[1.8]">
              <div><strong className="text-blk">React Router</strong> — Single Page App</div>
              <div><strong className="text-blk">Context API</strong> — Realtime State</div>
              <div><strong className="text-blk">Event-Driven</strong> — SLA Engine</div>
              <div><strong className="text-blk">Responsive</strong> — Desktop First</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

