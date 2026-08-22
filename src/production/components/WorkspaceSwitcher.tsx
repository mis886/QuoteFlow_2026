// Workspace switcher pill rendered in the CRM Topbar.
// Click → /production. From inside /production the same pill links back.

import { Link, useLocation } from 'react-router-dom';
import { Factory, ArrowLeftRight } from 'lucide-react';

export function WorkspaceSwitcher() {
  const location = useLocation();
  const inProduction = location.pathname.startsWith('/production');
  const to = inProduction ? '/' : '/production';
  const label = inProduction ? 'Back to CRM' : 'Production';

  return (
    <Link
      to={to}
      title={inProduction ? 'Switch to CRM workspace' : 'Switch to Production workspace'}
      className={`h-[30px] flex items-center gap-1.5 px-2.5 rounded-[5px] border text-[11px] font-medium transition-colors ${
        inProduction
          ? 'bg-[#FAFAFA] border-[#E4E5E6] text-[#666] hover:bg-[#EBEBEB]'
          : 'bg-[#E8F0FD] border-[#0A6ED1]/30 text-[#0A6ED1] hover:bg-red-mrt/15'
      }`}
    >
      {inProduction ? <ArrowLeftRight size={11} /> : <Factory size={11} />}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
