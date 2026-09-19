import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar, useSidebarCollapse } from './Sidebar';
import { Topbar } from './Topbar';
import { DetailPanel } from './DetailPanel';
import { AttachmentModal } from './AttachmentModal';
import { AppTour } from './AppTour';
import { MilestoneConfetti } from './MilestoneConfetti';
import { SalesIdentityGate } from './SalesIdentityGate';
import { useAppStore } from '../store';
import { Loader2 } from 'lucide-react';

export function Layout() {
  const { loading, attachmentModal, closeAttachmentModal, isReadOnlyUser } = useAppStore();
  const { collapsed, setCollapsed } = useSidebarCollapse();
  const location = useLocation();
  // Whole-app view-only mode is enforced here for every routed page in one
  // place — except New Dispatch Entry, which contains the one field
  // (LR, in Dispatch → Sent) that stays editable for this same read-only
  // login. That page locks down everything else about itself internally
  // instead (see NewDispatchEntry.tsx), so it's excluded from this blanket
  // lock rather than being doubly-locked.
  const lockThisRoute = isReadOnlyUser && location.pathname !== '/dispatch/new';

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-cream relative">
        <Topbar />
        {isReadOnlyUser && (
          <div className="shrink-0 bg-amber-50 border-b border-amber-200 text-amber-800 text-[11px] font-semibold px-4 py-1.5 text-center">
            View-only access — changes can't be saved here (except the LR document in Dispatch → Sent)
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          <fieldset disabled={lockThisRoute} className="contents">
            <Outlet />
          </fieldset>
        </main>

        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-[100] animate-in fade-in duration-200">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blk opacity-20 animate-spin" />
              <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-blk opacity-50">Synchronizing...</div>
            </div>
          </div>
        )}
      </div>
      <DetailPanel />
      <AttachmentModal
        entityType={attachmentModal.type as any}
        entityId={attachmentModal.id as any}
        isOpen={!!attachmentModal.type}
        onClose={closeAttachmentModal}
      />
      <AppTour />
      <MilestoneConfetti />
      <SalesIdentityGate />
    </div>
  );
}
