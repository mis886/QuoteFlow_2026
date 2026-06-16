import React, { useState } from 'react';
import { Search, RefreshCw, UserCircle2 } from 'lucide-react';
import { SlaNotificationBell } from './SlaNotificationBell';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import { hasActiveToken } from '../lib/gmail';
import { GlobalDateRangePicker } from './GlobalDateRangePicker';
import { WorkspaceSwitcher } from '../production/components/WorkspaceSwitcher';

const PATH_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/enquiries': 'Enquiries',
  '/quotes': 'Quotations',
  '/orders': 'Orders',
  '/customers': 'Customers',
  '/analytics': 'Analytics',
  '/blueprint': 'System Plan',
  '/settings': 'Settings',
};

export function Topbar() {
  const location = useLocation();
  const { globalSearchQuery, setGlobalSearchQuery, syncGmailEnquiries, data, activeDoer, clearActiveDoer } = useAppStore();
  const [isSyncing, setIsSyncing] = useState(false);

  const basePath = '/' + location.pathname.split('/')[1];
  const title = PATH_TITLES[basePath] || 'Dashboard';

  const gmailEnabled = data.settings?.gmail_enabled ?? false;

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try { await syncGmailEnquiries(); } catch {}
    setIsSyncing(false);
  };

  const lastSync = data.settings?.gmail_last_sync
    ? new Date(data.settings.gmail_last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header className="h-[50px] bg-white border-b border-g200 flex items-center px-5 gap-2.5 shrink-0">
      <div className="text-[13px] text-g500">
        Himalaya TerpenesEQ <span className="text-g300 mx-1">/</span> <strong className="text-blk font-semibold">{title}</strong>
      </div>

      <div className="ml-auto flex items-center gap-2 bg-g100 border border-g200 rounded-[5px] px-2.5 h-[30px] w-[200px] transition-all focus-within:bg-white focus-within:border-g400 focus-within:ring-[3px] focus-within:ring-red-lt">
        <Search size={12} className="text-g400 shrink-0" />
        <input
          type="text"
          placeholder="Search everywhere..."
          value={globalSearchQuery}
          onChange={(e) => setGlobalSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none font-sans text-[12.5px] text-blk w-full placeholder:text-g400"
        />
      </div>

      {/* Gmail sync pill — only shown when gmail is enabled */}
      {gmailEnabled && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          title={lastSync ? `Last synced ${lastSync}` : 'Sync Gmail enquiries'}
          className={`h-[30px] flex items-center gap-1.5 px-2.5 rounded-[5px] border text-[11px] font-medium transition-colors disabled:opacity-60 ${
            hasActiveToken()
              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
              : 'bg-g100 border-g200 text-g500 hover:bg-g200'
          }`}
        >
          <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{isSyncing ? 'Syncing…' : lastSync ? `Synced ${lastSync}` : 'Sync Gmail'}</span>
        </button>
      )}

      {/* Active doer — who is being credited; click to switch on shared terminals */}
      {activeDoer && (
        <button
          type="button"
          onClick={clearActiveDoer}
          title={`Working as ${activeDoer.display_name} (${activeDoer.role}) — click to switch doer`}
          className="h-[30px] flex items-center gap-1.5 px-2.5 rounded-[5px] border border-g200 bg-g100 text-[11px] font-medium text-g600 hover:bg-g200 transition-colors"
        >
          <UserCircle2 size={13} className="text-red-mrt shrink-0" />
          <span className="hidden md:inline max-w-[120px] truncate">{activeDoer.display_name}</span>
          <span className="text-g400 hidden lg:inline">· switch</span>
        </button>
      )}

      <WorkspaceSwitcher />

      <GlobalDateRangePicker />

      <SlaNotificationBell />
    </header>
  );
}
