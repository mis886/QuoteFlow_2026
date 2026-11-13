// Workspace switcher pill in the CRM Topbar (replaced the old Production pill, 2026-11-02).
// Click → /fms. From inside /fms the same pill links back to the CRM.
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeftRight, Workflow } from 'lucide-react';

export function WorkspaceSwitcher() {
  const location = useLocation();
  const inFms = location.pathname === '/fms' || location.pathname.startsWith('/fms/');
  const to = inFms ? '/' : '/fms';
  const label = inFms ? 'Back to CRM' : 'FMS';

  return (
    <Link
      to={to}
      title={inFms ? 'Switch to CRM workspace' : 'Switch to FMS workspace'}
      className={`h-[30px] flex items-center gap-1.5 px-2.5 rounded-[5px] border text-[11px] font-medium transition-colors ${
        inFms
          ? 'bg-[#FAFAFA] border-[#E4E5E6] text-[#666] hover:bg-[#EBEBEB]'
          : 'bg-[#E8F0FD] border-[#0A6ED1]/30 text-[#0A6ED1] hover:bg-red-mrt/15'
      }`}
    >
      {inFms ? <ArrowLeftRight size={11} /> : <Workflow size={11} />}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
