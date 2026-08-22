// Standalone layout for the /production workspace.
// Mirrors the CRM Layout shape but uses its own Sidebar.
// Reuses the CRM Topbar so the workspace pill, search, and sync controls
// stay consistent. That's fine — Topbar is presentational; it doesn't
// touch any production state.

import { Outlet, Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { ProductionSidebar } from './ProductionSidebar';
import { Topbar } from '../../components/Topbar';
import { useProductionEnabled } from '../lib/useProductionEnabled';

export function ProductionLayout() {
  const gate = useProductionEnabled();

  if (gate === 'disabled') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-cream">
        <div className="max-w-[440px] text-center px-6">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#E8F0FD] flex items-center justify-center mb-4">
            <Lock size={22} className="text-[#0A6ED1]" />
          </div>
          <div className="font-mono text-[10px] font-bold tracking-[3px] uppercase text-[#111] opacity-60 mb-2">
            Production
          </div>
          <h1 className="text-[18px] font-semibold text-[#111] mb-2">
            Production workspace disabled
          </h1>
          <p className="text-[13px] text-[#666] mb-5 leading-relaxed">
            An administrator has turned the Production workspace off for
            this environment. Set
            <code className="mx-1 px-1.5 py-0.5 rounded bg-[#FAFAFA] text-[11px] font-mono">
              app_settings.production_beta_enabled = true
            </code>
            in Supabase to re-enable.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[5px] bg-blk text-white text-[12px] font-medium hover:bg-g700"
          >
            Back to CRM
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <ProductionSidebar />
      <div className="prod-main-bg flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
