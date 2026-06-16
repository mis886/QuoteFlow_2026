import React, { useEffect } from 'react';
import { useAppStore } from '../store';
import { fmtIST } from '../lib/utils';
import { Button, Badge } from './ui';
import { X, ArrowRight, Paperclip, Download, Loader2, Phone, MessageCircle, Mail, ChevronDown, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getS3SignedUrl } from '../lib/s3';
import { FollowUpSummary } from './FollowUpSummary';
import { generateQuotePDF, generatePIPDF } from '../lib/pdfGenerator';

const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <section>
    <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1">{title}</div>
    {children}
  </section>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-2 gap-4 text-[13px]">
    {children}
  </div>
);

const InfoItem = ({ label, value }: { label: string, value: string }) => (
  <div>
    <div className="text-g500 font-mono text-[10.5px] font-bold tracking-wider mb-0.5 uppercase">{label}</div>
    <div className="text-blk font-medium">{value}</div>
  </div>
);

export function DetailPanel() {
  const { detailPanel, closeDetailPanel, openDetailPanel, data, updateEnquiry, updateQuote, updateOrder, deleteEnquiry, closeFollowUp } = useAppStore();
  const navigate = useNavigate();
  const [downloadingItemId, setDownloadingItemId] = React.useState<string | null>(null);
  const [showLineItems, setShowLineItems] = React.useState(false);

  const handleDownload = async (path: string, id: string, name?: string) => {
    if (path.startsWith('mock') || downloadingItemId === id) return;
    setDownloadingItemId(id);
    try {
      const url = await getS3SignedUrl(path, true);
      setDownloadingItemId(null);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name || '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        alert("Failed to download file. It might have been deleted or is unavailable.");
      }
    } catch (e) {
      setDownloadingItemId(null);
      alert("Failed to download file. It might have been deleted or is unavailable.");
    }
  };

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetailPanel();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [closeDetailPanel]);

  if (!detailPanel.type || !detailPanel.id) return null;

  const renderEnquiry = () => {
    const enq = data.enquiries.find(e => e.id === detailPanel.id);
    if (!enq) return null;

    const dt = new Date(enq.recv);
    
    return (
      <div className="flex flex-col h-full bg-white relative animate-in slide-in-from-right duration-300 w-full sm:w-[500px]">
        {/* Header */}
        <div className="p-6 border-b border-g200 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-sm font-bold text-red-mrt">{enq.id}</span>
              <Badge status={enq.urg} />
              <Badge status={enq.status as any} />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-2xl text-blk">{enq.cust}</h2>
              {(() => {
                const custRec = data.customers.find(c => c.name === enq.cust);
                if (!custRec) return null;
                return (
                  <button type="button" title="Edit Customer" onClick={() => { closeDetailPanel(); navigate(`/customers/new?id=${custRec.id}`); }} className="text-g400 hover:text-red-mrt transition-colors p-0.5">
                    <ExternalLink size={14} />
                  </button>
                );
              })()}
            </div>
          </div>
          <button onClick={closeDetailPanel} className="text-g500 hover:text-blk p-1 border border-g300 rounded hover:bg-g100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section>
            <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1">Enquiry Details</div>
            <div className="grid grid-cols-[100px_1fr] gap-y-2 text-[13px]">
              <div className="text-g500 font-mono text-[10.5px] font-bold tracking-wider pt-0.5">RECEIVED</div>
              <div className="text-blk">{fmtIST(dt, 'dd-MMM-yyyy, hh:mm a')}</div>
              
              <div className="text-g500 font-mono text-[10.5px] font-bold tracking-wider pt-0.5">SOURCE</div>
              <div className="text-blk flex items-center gap-1.5">
                <span className="text-g500 text-[10px]">✉</span> {enq.src}
              </div>

              <div className="text-g500 font-mono text-[10.5px] font-bold tracking-wider pt-0.5">CONTACT</div>
              <div className="text-blk">{enq.contact || '—'}</div>

              <div className="text-g500 font-mono text-[10.5px] font-bold tracking-wider pt-0.5">EMAIL</div>
              <div className="text-red-mrt">{enq.email || '—'}</div>

              <div className="text-g500 font-mono text-[10.5px] font-bold tracking-wider pt-0.5">SUBMITTED BY</div>
              <div className="text-blk">{enq.doer || enq.assigned || '—'}</div>

              {enq.qRef && (
                <>
                  <div className="text-g500 font-mono text-[10.5px] font-bold tracking-wider pt-0.5">QUOTE REF</div>
                  <div className="text-[#8B5CF6] font-mono text-[11px] font-bold cursor-pointer hover:underline" onClick={() => {
                    closeDetailPanel();
                    navigate('/quotes');
                  }}>{enq.qRef}</div>
                </>
              )}
            </div>
          </section>

          <section>
            <button
              type="button"
              onClick={() => setShowLineItems(v => !v)}
              className="w-full flex items-center justify-between font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1 hover:opacity-70 transition-opacity focus:outline-none"
            >
              Line Items ({enq.items.length})
              <ChevronDown size={12} className={`transition-transform duration-200 ${showLineItems ? 'rotate-180' : ''}`} />
            </button>
            {showLineItems && (
              <div className="bg-g100/50 border border-g200 p-2 text-black">
                <table className="w-full text-left text-[11.5px]">
                  <thead className="text-[10px] font-mono text-g500 border-b border-g200">
                    <tr>
                      <th className="pb-1.5 font-bold">#</th>
                      <th className="pb-1.5 font-bold">DESCRIPTION</th>
                      <th className="pb-1.5 font-bold">MATERIAL</th>
                      <th className="pb-1.5 font-bold">QTY</th>
                      <th className="pb-1.5 font-bold">UOM</th>
                      <th className="pb-1.5 font-bold">DWG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enq.items.map((it, idx) => (
                      <tr key={idx} className="border-b border-g200/50 last:border-0 hover:bg-white transition-colors">
                        <td className="py-2 text-g500 font-mono">{it.seq}</td>
                        <td className="py-2 font-medium">{it.desc}</td>
                        <td className="py-2 text-g600">{it.mat || '—'}</td>
                        <td className="py-2 font-bold">{it.qty}</td>
                        <td className="py-2 text-g500">{it.uom}</td>
                        <td className="py-2 text-g500">{it.drwg || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {enq.attachments && enq.attachments.length > 0 && (
            <>
              <section>
                <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1">Enquiry Documents</div>
                <div className="grid grid-cols-1 gap-2">
                  {enq.attachments
                    .filter(a => !a.fileName.toLowerCase().includes('drawing'))
                    .map(att => (
                      <div key={att.id} className="flex items-center justify-between p-3 bg-white border border-g200 rounded-[3px] hover:border-red-mrt/50 transition-colors group">
                        <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-red-lt flex items-center justify-center text-red-mrt">
                            <Paperclip size={16} />
                        </div>
                        <div>
                            <div className="text-[13px] font-bold text-blk leading-tight">{att.fileName}</div>
                            <div className="text-[10px] text-g500 font-mono mt-0.5 uppercase">Uploaded {fmtIST(new Date(att.uploadedAt), 'dd MMM')}</div>
                        </div>
                        </div>
                        <button 
                        onClick={(e) => { e.stopPropagation(); handleDownload(att.storagePath, att.id, att.fileName); }}
                        disabled={downloadingItemId === att.id}
                        className="p-2 text-g400 hover:text-red-mrt transition-colors disabled:opacity-50"
                        >
                        {downloadingItemId === att.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        </button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1">Technical Drawings</div>
                <div className="grid grid-cols-1 gap-2">
                  {enq.attachments
                    .filter(a => a.fileName.toLowerCase().includes('drawing'))
                    .map(att => (
                      <div key={att.id} className="flex items-center justify-between p-3 bg-white border border-g200 rounded-[3px] hover:border-red-mrt/50 transition-colors group">
                        <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-red-lt flex items-center justify-center text-red-mrt">
                            <Paperclip size={16} />
                        </div>
                        <div>
                            <div className="text-[13px] font-bold text-blk leading-tight">{att.fileName}</div>
                            <div className="text-[10px] text-g500 font-mono mt-0.5 uppercase">Uploaded {fmtIST(new Date(att.uploadedAt), 'dd MMM')}</div>
                        </div>
                        </div>
                        <button 
                        onClick={(e) => { e.stopPropagation(); handleDownload(att.storagePath, att.id, att.fileName); }}
                        disabled={downloadingItemId === att.id}
                        className="p-2 text-g400 hover:text-red-mrt transition-colors disabled:opacity-50"
                        >
                        {downloadingItemId === att.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        </button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {enq.notes && (
            <section>
              <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1">Internal Notes</div>
              <div className="bg-orange-50 border border-orange-100 p-3 text-[12.5px] text-orange-900 rounded-[3px]">
                {enq.notes}
              </div>
            </section>
          )}

          <section>
            <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1">Activity</div>
            <div className="relative pl-3 border-l-[1.5px] border-g200 ml-[5px] space-y-5">
              
              <div className="relative">
                <div className="absolute -left-[20px] top-[4px] w-2.5 h-2.5 rounded-full border-2 border-red-mrt bg-white shadow-[0_0_0_2px_#fff]"></div>
                <div className="font-mono text-[9.5px] text-g500 mb-0.5">{fmtIST(dt, 'dd-MMM-yyyy, hh:mm a')}</div>
                <div className="text-[13px] font-semibold text-blk">Enquiry Received — {enq.src}</div>
                <div className="text-[12px] text-g500">{enq.contact || enq.cust} · {enq.items.length} items</div>
              </div>

              {enq.status !== 'New' && (
                <div className="relative">
                  <div className="absolute -left-[20px] top-[4px] w-2.5 h-2.5 rounded-full border-2 border-red-mrt bg-white shadow-[0_0_0_2px_#fff]"></div>
                  <div className="font-mono text-[9.5px] text-g500 mb-0.5">Updated Status</div>
                  <div className="text-[13px] font-semibold text-blk">Moved to {enq.status}</div>
                </div>
              )}

              {enq.qRef && (() => {
                const quote = data.quotes.find(q => q.id === enq.qRef);
                const qDt = quote?.date ? new Date(quote.date) : null;
                return (
                  <div className="relative">
                    <div className="absolute -left-[20px] top-[4px] w-2.5 h-2.5 rounded-full border-2 border-red-mrt bg-white shadow-[0_0_0_2px_#fff]"></div>
                    <div className="font-mono text-[9.5px] text-g500 mb-0.5">
                      {qDt ? fmtIST(qDt, 'dd-MMM-yyyy, hh:mm a') : '—'}
                      <span className="text-red-mrt font-bold ml-2">E2Q: {Number(enq.ageH).toFixed(2)}h</span>
                    </div>
                    <div className="text-[13px] font-semibold text-blk">Quotation Created — {enq.qRef}</div>
                    <div className="text-[12px] text-g500">Document generated & sent (simulated)</div>
                  </div>
                );
              })()}

            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-g200 flex items-center justify-between bg-g100/30">
          <div className="flex items-center gap-2">
            <select
              value={enq.status}
              onChange={async (e) => {
                await updateEnquiry(enq.id, { status: e.target.value as any });
              }}
              className="font-sans text-[12px] text-blk bg-white border border-g300 rounded-[3px] p-[6px_10px] outline-none hover:border-g400"
            >
              <option value="New">New</option>
              <option value="In Review">In Review</option>
              <option value="Quoted">Quoted</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
              <option value="Parked">Parked</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="!text-red-mrt !border-red-lt hover:!bg-red-lt" onClick={async () => {
              if (confirm('Are you sure you want to delete this enquiry?')) {
                await deleteEnquiry(enq.id);
                closeDetailPanel();
              }
            }}>Delete</Button>
            <Button variant="secondary" onClick={closeDetailPanel}>Close</Button>
          </div>
        </div>
      </div>
    );
  };

  const renderQuote = () => {
    const q = data.quotes.find(x => x.id === detailPanel.id);
    if (!q) return null;

    const parentEnq = data.enquiries.find(e => e.id === q.enqRef);

    return (
       <div className="flex flex-col h-full bg-white relative animate-in slide-in-from-right duration-300 w-full sm:w-[500px]">
          <div className="p-6 border-b border-g200 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-sm font-bold text-sQ">{q.id}</span>
              <Badge status={q.status as any} />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-2xl text-blk">{q.cust}</h2>
              {(() => {
                const custRec = data.customers.find(c => c.name === q.cust);
                if (!custRec) return null;
                return (
                  <button type="button" title="Edit Customer" onClick={() => { closeDetailPanel(); navigate(`/customers/new?id=${custRec.id}`); }} className="text-g400 hover:text-red-mrt transition-colors p-0.5">
                    <ExternalLink size={14} />
                  </button>
                );
              })()}
            </div>
          </div>
          <button onClick={closeDetailPanel} className="text-g500 hover:text-blk p-1 border border-g300 rounded hover:bg-g100 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <Section title="Quote Meta">
            <Grid>
              <InfoItem label="Date" value={q.date} />
              <InfoItem label="Valid Until" value={q.validity || '--'} />
              <InfoItem label="Incoterms" value={q.inco} />
              <InfoItem label="Payment Terms" value={q.pay} />
              <InfoItem label="Currency" value={q.curr} />
            </Grid>
          </Section>

          {(() => {
            const custRec = data.customers.find(c => c.name === q.cust);
            const site = custRec?.sites.find(s => s.isPrimary) ?? custRec?.sites[0];
            const contacts = site?.contacts ?? [];
            if (!custRec || contacts.length === 0) return null;
            return (
              <Section title="Customer Contact">
                {site?.gstin && (
                  <div className="mb-2 px-3 py-1.5 bg-g50 border border-g200 rounded-[4px] flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-g400">GSTIN</span>
                    <span className="font-mono text-[11.5px] font-bold text-blk">{site.gstin}</span>
                    <span className="text-[10px] text-g400">· {site.name}</span>
                  </div>
                )}
                <div className="border border-g200 rounded-[4px] divide-y divide-g100 overflow-hidden">
                  {contacts.map(ct => (
                    <div key={ct.id} className="px-3 py-2.5 bg-g50 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12.5px] font-semibold text-blk">{ct.name}</span>
                        {ct.role && (
                          <span className="px-1.5 py-0.5 bg-g200 rounded text-[8.5px] font-bold uppercase text-g600 tracking-wide">
                            {ct.role}
                          </span>
                        )}
                        {ct.isPrimary && (
                          <span className="px-1.5 py-0.5 bg-red-50 border border-red-200 rounded text-[8px] font-bold uppercase text-red-700 tracking-wide">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        {ct.phone && (
                          <a href={`tel:${ct.phone}`} className="inline-flex items-center gap-1 text-[11px] text-blk hover:text-red-mrt transition-colors">
                            <Phone size={10} className="text-g400 shrink-0" />
                            {ct.phone}
                          </a>
                        )}
                        {ct.phone && (
                          <a href={`https://wa.me/91${ct.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 transition-colors">
                            <MessageCircle size={10} className="shrink-0" />
                            {ct.phone}
                          </a>
                        )}
                        {ct.email && (
                          <a href={`mailto:${ct.email}`} className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors">
                            <Mail size={10} className="shrink-0" />
                            {ct.email}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            );
          })()}

          {q.enqRef && (
            <Section title="Linked Enquiry">
              <div 
                className="group flex items-center justify-between p-3 border border-red-lt bg-red-mrt/[0.02] rounded cursor-pointer hover:bg-red-mrt/[0.05] transition-colors"
                onClick={() => {
                   openDetailPanel('enquiry', q.enqRef!);
                }}
              >
                <div>
                  <div className="text-[10px] uppercase font-bold text-red-mrt mb-0.5">Enquiry Reference</div>
                  <div className="font-mono text-[13px] text-blk font-medium">{q.enqRef}</div>
                </div>
                <ArrowRight size={16} className="text-red-mrt opacity-50 group-hover:opacity-100" />
              </div>
            </Section>
          )}

          {parentEnq?.attachments && parentEnq.attachments.length > 0 && (
            <section>
              <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1">Enquiry Attachments ({parentEnq.attachments.length})</div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {parentEnq.attachments.map(att => (
                  <div 
                    key={att.id} 
                    onClick={(e) => { e.stopPropagation(); handleDownload(att.storagePath, att.id, att.fileName); }}
                    className={`flex-shrink-0 flex items-center gap-2 p-2 bg-g50 border border-g200 rounded-[3px] text-[11px] font-medium hover:border-red-mrt/30 transition-colors cursor-pointer group ${downloadingItemId === att.id ? 'opacity-70 pointer-events-none' : ''}`}
                  >
                    {downloadingItemId === att.id ? <Loader2 size={12} className="text-g400 animate-spin" /> : <Paperclip size={12} className="text-g400" />}
                    <span className="text-blk truncate max-w-[100px]">{att.fileName}</span>
                    <Download size={12} className="text-g400 group-hover:text-red-mrt" />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <button
              type="button"
              onClick={() => setShowLineItems(v => !v)}
              className="w-full flex items-center justify-between font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1 hover:opacity-70 transition-opacity focus:outline-none"
            >
              Line Items ({q.items.length})
              <ChevronDown size={12} className={`transition-transform duration-200 ${showLineItems ? 'rotate-180' : ''}`} />
            </button>
            {showLineItems && (
              <div className="border border-g200 rounded divide-y divide-g100 text-[12px]">
                {q.items.map((it, i) => (
                  <div key={i} className="p-3 bg-g50 flex justify-between gap-4">
                    <div>
                      <div className="font-sans font-medium text-blk">{it.desc}</div>
                      <div className="text-g500 mt-1">Material: {it.mat}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-blk">{it.qty} {it.uom}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <FollowUpSummary quote={q} />
        </div>
        <div className="p-4 border-t border-g200 flex items-center justify-between bg-g100/30">
          <div className="flex items-center gap-2">
            <select
              title="Quote status"
              value={q.status}
              onChange={async (e) => {
                const next = e.target.value as any;
                await updateQuote(q.id, { status: next });
                // Marking Won closes the follow-up process (outcome = Won).
                if (next === 'Won') {
                  try { await closeFollowUp(q.id, 'Won'); } catch { /* no follow-up row — ignore */ }
                }
                // Keep the parent enquiry in sync so its Won/Lost/Quoted tabs and
                // enquiry-based analytics match the quote. Won/Lost via closeFollowUp
                // already syncs when a follow-up exists; this covers the direct path
                // and the no-follow-up case. A quote still implies 'Quoted'.
                if (q.enqRef) {
                  const enqStatus = next === 'Won' ? 'Won' : next === 'Lost' ? 'Lost' : 'Quoted';
                  const enq = data.enquiries.find(en => en.id === q.enqRef);
                  if (enq && enq.status !== enqStatus) await updateEnquiry(q.enqRef, { status: enqStatus });
                }
              }}
              className="font-sans text-[12px] text-blk bg-white border border-g300 rounded-[3px] p-[6px_10px] outline-none hover:border-g400"
            >
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
              <option value="Parked">Parked</option>
            </select>
          </div>
          <div className="flex gap-2">
            {(q.status === 'Sent' || q.status === 'Won') && (() => {
              // Mirror the Quotations Register: once an order exists for this
              // quote (or it's marked Won), it's already converted — show a
              // disabled "Ordered" state instead of letting it convert again.
              const isOrdered = q.status === 'Won' || data.orders.some(o => o.quoteRef === q.id);
              return isOrdered ? (
                <Button
                  variant="secondary"
                  disabled
                  className="bg-g100 text-g400 cursor-not-allowed font-mono tracking-wider font-bold !text-[11px] px-3 py-1.5 uppercase"
                >
                  Ordered
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    closeDetailPanel();
                    navigate(`/orders/new?quoteRef=${q.id}`);
                  }}
                  className="btn-order transition-colors font-mono tracking-wider font-bold !text-[11px] px-3 py-1.5 uppercase"
                >
                  + Convert to Order
                </Button>
              );
            })()}
            <Button variant="secondary" onClick={() => {
              const cust = data.customers.find(c => c.name === q.cust);
              const unit = q.unitId ? data.units.find(u => u.id === q.unitId) : data.units.find(u => u.is_default);
              const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
              const sig = unitSig ?? data.signatories.find(s => s.is_default);
              generateQuotePDF(q, cust, data.settings, sig, true, unit);
            }}>PDF</Button>
            <Button variant="secondary" onClick={closeDetailPanel}>Close</Button>
          </div>
        </div>
       </div>
    );
  };

  const renderOrder = () => {
    const o = data.orders.find(x => x.id === detailPanel.id);
    if (!o) return null;

    const parentEnq = data.enquiries.find(e => e.id === o.enqRef);

    return (
       <div className="flex flex-col h-full bg-white relative animate-in slide-in-from-right duration-300 w-full sm:w-[500px]">
          <div className="p-6 border-b border-g200 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-sm font-bold text-sN">{o.id}</span>
              <Badge status={o.status as any} />
            </div>
            <h2 className="font-serif text-2xl text-blk">{o.cust}</h2>
          </div>
          <button type="button" title="Close" onClick={closeDetailPanel} className="text-g500 hover:text-blk p-1 border border-g300 rounded hover:bg-g100 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <Section title="Order Meta">
            <Grid>
              <InfoItem label="PO No." value={o.poNo} />
              <InfoItem label="PO Date" value={o.poDate} />
              <InfoItem label="Delivery Date" value={o.dlvDate} />
            </Grid>
          </Section>

          {o.quoteRef && (
            <Section title="Linked Quote">
              <div
                className="group flex items-center justify-between p-3 border border-sQ/30 bg-sQ/[0.02] rounded cursor-pointer hover:bg-sQ/[0.05] transition-colors"
                onClick={() => {
                   openDetailPanel('quote', o.quoteRef!);
                }}
              >
                <div>
                  <div className="text-[10px] uppercase font-bold text-sQ mb-0.5">Quote Reference</div>
                  <div className="font-mono text-[13px] text-blk font-medium">{o.quoteRef}</div>
                </div>
                <ArrowRight size={16} className="text-sQ opacity-50 group-hover:opacity-100" />
              </div>
            </Section>
          )}

          {parentEnq?.attachments && parentEnq.attachments.length > 0 && (
            <section>
              <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1">Enquiry Attachments ({parentEnq.attachments.length})</div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {parentEnq.attachments.map(att => (
                  <div 
                    key={att.id} 
                    onClick={(e) => { e.stopPropagation(); handleDownload(att.storagePath, att.id, att.fileName); }}
                    className={`flex-shrink-0 flex items-center gap-2 p-2 bg-g50 border border-g200 rounded-[3px] text-[11px] font-medium hover:border-red-mrt/30 transition-colors cursor-pointer group ${downloadingItemId === att.id ? 'opacity-70 pointer-events-none' : ''}`}
                  >
                    {downloadingItemId === att.id ? <Loader2 size={12} className="text-g400 animate-spin" /> : <Paperclip size={12} className="text-g400" />}
                    <span className="text-blk truncate max-w-[100px]">{att.fileName}</span>
                    <Download size={12} className="text-g400 group-hover:text-red-mrt" />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <button
              type="button"
              onClick={() => setShowLineItems(v => !v)}
              className="w-full flex items-center justify-between font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-3 border-b border-red-lt pb-1 hover:opacity-70 transition-opacity focus:outline-none"
            >
              Line Items ({o.items.length})
              <ChevronDown size={12} className={`transition-transform duration-200 ${showLineItems ? 'rotate-180' : ''}`} />
            </button>
            {showLineItems && (
              <div className="border border-g200 rounded divide-y divide-g100 text-[12px]">
                {o.items.map((it, i) => (
                  <div key={i} className="p-3 bg-g50 flex justify-between gap-4">
                    <div>
                      <div className="font-sans font-medium text-blk">{it.desc}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-blk">{it.qty} {it.uom}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="p-4 border-t border-g200 flex items-center justify-between bg-g100/30">
          <div className="flex items-center gap-2">
            <select
              title="Order status"
              value={o.status}
              onChange={async (e) => {
                await updateOrder(o.id, { status: e.target.value as any });
              }}
              className="font-sans text-[12px] text-blk bg-white border border-g300 rounded-[3px] p-[6px_10px] outline-none hover:border-g400"
            >
              <option value="Processing">Processing</option>
              <option value="Delivered">Delivered</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => {
              closeDetailPanel();
              navigate(`/orders/new?orderId=${o.id}`);
            }}>Edit</Button>
            <Button variant="secondary" onClick={() => {
              const qt = data.quotes.find(q => q.id === o.quoteRef);
              const cust = data.customers.find(c => c.name === o.cust);
              const unit = o.unitId ? data.units.find(u => u.id === o.unitId) : data.units.find(u => u.is_default);
              const bank = o.bankAccountId ? data.bankAccounts.find(b => b.id === o.bankAccountId)
                : data.bankAccounts.find(b => b.unit_id === unit?.id && b.is_default);
              const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
              const sig = unitSig ?? data.signatories.find(s => s.is_default);
              generatePIPDF(o, qt, cust, data.settings, sig, true, unit, bank);
            }}>PI</Button>
            <Button variant="secondary" onClick={closeDetailPanel}>Close</Button>
          </div>
        </div>
       </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px] animate-in fade-in duration-300"
        onClick={closeDetailPanel}
      />
      {/* Panel */}
      {detailPanel.type === 'enquiry' && renderEnquiry()}
      {detailPanel.type === 'quote' && renderQuote()}
      {detailPanel.type === 'order' && renderOrder()}
    </div>
  );
}
