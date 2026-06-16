// Full Press Board — large cards, plus list of queued jobs per press.

import { useState, useMemo } from 'react';
import { Plus, Workflow, ChevronUp, ChevronDown, ArrowUpToLine, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';
import { useProductionData } from '../lib/useProductionData';
import { PressBoard } from '../components/PressBoard';
import { AssignPressModal } from '../components/AssignPressModal';
import {
  assignJobsToPress, markPressDone, pressQueueJobs,
  moveQueueJob, moveQueueJobToFront, preemptActiveJob,
} from '../lib/actions';
import { productIdentity } from '../lib/productLabel';
import { PageHeader } from '../components/table';

export function PressBoardPage() {
  const { presses, jobs, products, settings, refresh, loading } = useProductionData();
  const [assigning, setAssigning] = useState<{ pressId: string | null } | null>(null);

  const queuedByPress = useMemo(() => {
    const map: Record<string, typeof jobs> = {};
    for (const p of presses) map[p.id] = pressQueueJobs(jobs, p.id);
    return map;
  }, [presses, jobs]);

  const queuedNoPress = jobs.filter(j => j.stage === 'moulding' && !j.press_id);

  const onConfirmAssign = async (jobIds: string[], pressId: string) => {
    await assignJobsToPress(jobIds, pressId);
    await refresh();
  };
  const onMarkDone = async (pressId: string) => {
    await markPressDone(pressId);
    await refresh();
  };

  // Queue reordering
  const onMove = async (jobId: string, dir: 'up' | 'down') => {
    await moveQueueJob(jobId, dir);
    await refresh();
  };
  const onMoveToFront = async (jobId: string) => {
    await moveQueueJobToFront(jobId);
    await refresh();
  };
  const onPreempt = async (jobId: string, pressName: string) => {
    if (!confirm(`Preempt the job currently running on ${pressName}?\n\nThe running job will be paused (sent back to the front of the queue) and this emergency loaded immediately. Only do this if interrupting the current cure is justified.`)) return;
    await preemptActiveJob(jobId);
    await refresh();
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module="Production · Shop Floor"
        title="Press"
        accent="Board"
        subtitle="Live status of every press. Assign jobs, mark complete, or schedule maintenance."
        actions={
          <>
            <Link to="/production/sequencer/mould">
              <Button variant="secondary" className="gap-1">
                <Workflow size={12} /> Sequencer
              </Button>
            </Link>
            <Button
              variant="primary"
              onClick={() => setAssigning({ pressId: null })}
              disabled={queuedNoPress.length === 0}
              className="gap-1"
            >
              <Plus size={13} /> Assign Jobs
            </Button>
          </>
        }
      />

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto space-y-4">
        {settings && (
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] px-3 py-2 text-[11.5px] text-[#666] flex items-center gap-3">
            <span>Shift: <strong className="text-[#111]">{settings.shift_hours_left}h left</strong> of {settings.shift_hours}h</span>
            <span className="text-[#555]">·</span>
            <span>OT budget: <strong className="text-[#111]">{settings.overtime_max}h</strong></span>
            <span className="text-[#555]">·</span>
            <span>Planned: <strong className="text-[#111]">{settings.planned_finishers}F / {settings.planned_inspectors}I</strong></span>
            {queuedNoPress.length > 0 && (
              <span className="ml-auto text-[#0A6ED1] font-semibold">
                {queuedNoPress.length} job{queuedNoPress.length === 1 ? '' : 's'} unassigned
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] p-8 text-center text-[12px] text-[#555]">
            Loading press status…
          </div>
        ) : (
          <PressBoard
            presses={presses}
            jobs={jobs}
            onAssign={pressId => setAssigning({ pressId })}
            onMarkDone={onMarkDone}
          />
        )}

        {/* Queues per press */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {presses.map(p => {
            const queue = queuedByPress[p.id] || [];
            if (queue.length === 0) return null;
            const pressBusy = p.status !== 'idle' && !!p.active_job_id;
            return (
              <div key={p.id} className="bg-white border border-[#E4E5E6] rounded-[3px]">
                <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
                  <div className="text-[12px] font-semibold text-[#111] flex-1">
                    {p.name} — Queue
                  </div>
                  <span className="font-mono text-[10px] text-[#333]">{queue.length} waiting</span>
                </div>
                <ul className="divide-y divide-[#F3F3F3]">
                  {queue.map((j, idx) => {
                    const isEmergency = j.priority === 'emergency';
                    return (
                      <li key={j.id} className={`px-3 py-2 text-[12px] flex items-center gap-2 ${isEmergency ? 'bg-[#FFF6F6]' : ''}`}>
                        <span className="font-mono text-[10px] text-[#999] w-4 shrink-0 text-right">{idx + 1}</span>
                        <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1] shrink-0">
                          {isEmergency && '🔴 '}{j.id}
                        </span>
                        <span className="text-[#444] truncate flex-1">{productIdentity(j)}</span>
                        <span className="text-[#333] font-mono text-[10.5px] shrink-0">{j.qty.toLocaleString()} pcs</span>
                        {/* Reorder controls */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <QBtn title="Move up" disabled={idx === 0} onClick={() => onMove(j.id, 'up')}>
                            <ChevronUp size={13} />
                          </QBtn>
                          <QBtn title="Move down" disabled={idx === queue.length - 1} onClick={() => onMove(j.id, 'down')}>
                            <ChevronDown size={13} />
                          </QBtn>
                          <QBtn title="Move to front of queue" disabled={idx === 0} onClick={() => onMoveToFront(j.id)}>
                            <ArrowUpToLine size={12} />
                          </QBtn>
                          {pressBusy && (
                            <QBtn
                              title="Preempt: pause the running job and load this one now"
                              tone="danger"
                              onClick={() => onPreempt(j.id, p.name)}
                            >
                              <Zap size={12} />
                            </QBtn>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <AssignPressModal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        jobs={queuedNoPress}
        presses={presses}
        products={products}
        preselectPressId={assigning?.pressId || null}
        onConfirm={onConfirmAssign}
      />
    </div>
  );
}

// Small icon button used for queue reordering / preempt actions.
function QBtn({ children, title, onClick, disabled, tone = 'default' }: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const toneCls = tone === 'danger'
    ? 'text-[#BB0000] hover:bg-[#FFEBEE] hover:text-[#8E0000]'
    : 'text-[#666] hover:bg-[#E8F0FD] hover:text-[#0A6ED1]';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-0.5 rounded-[3px] transition-colors disabled:opacity-25 disabled:pointer-events-none ${toneCls}`}
    >
      {children}
    </button>
  );
}
