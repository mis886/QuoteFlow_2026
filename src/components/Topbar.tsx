import React, { useState } from 'react';
import { Search, RefreshCw, UserCircle2, X, LogOut } from 'lucide-react';
import { SlaNotificationBell } from './SlaNotificationBell';
import { GlobalSearchResults } from './GlobalSearchResults';
import { useLocation } from 'react-router-dom';
import { useAppStore, SALES_EMAIL } from '../store';
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
  const { globalSearchQuery, setGlobalSearchQuery, syncGmailEnquiries, data, activeDoer, user, salesIdentity, setSalesIdentity } = useAppStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

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

      <div className="relative ml-auto flex items-center gap-2 bg-g100 border border-g200 rounded-[5px] px-2.5 h-[30px] w-[200px] transition-all focus-within:bg-white focus-within:border-g400 focus-within:ring-[3px] focus-within:ring-red-lt">
        <Search size={12} className="text-g400 shrink-0" />
        <input
          type="text"
          placeholder="Search everywhere..."
          value={globalSearchQuery}
          onChange={(e) => setGlobalSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="bg-transparent border-none outline-none font-sans text-[12.5px] text-blk w-full placeholder:text-g400"
        />
        {globalSearchQuery && (
          <button
            type="button"
            onClick={() => setGlobalSearchQuery('')}
            className="text-g400 hover:text-blk transition-colors shrink-0"
            title="Clear search"
          >
            <X size={11} />
          </button>
        )}
        {searchFocused && globalSearchQuery.trim() && (
          <GlobalSearchResults query={globalSearchQuery} onNavigate={() => { setGlobalSearchQuery(''); setSearchFocused(false); }} />
        )}
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

      {/* Active doer — identity resolved automatically from login email */}
      {activeDoer && (
        <div
          title={`Signed in as ${activeDoer.display_name} (${activeDoer.role})`}
          className="h-[30px] flex items-center gap-1.5 px-2.5 rounded-[5px] border border-g200 bg-g100 text-[11px] font-medium text-g600"
        >
          <UserCircle2 size={13} className="text-red-mrt shrink-0" />
          <span className="hidden md:inline max-w-[120px] truncate">{activeDoer.display_name}</span>
        </div>
      )}

      {/* sales@ shared login — identity picked via PIN gate, since activeDoer
          can't resolve (two people share this one login). This persists
          across browser restarts (see store's salesIdentity/localStorage),
          so this button is the only way to deliberately re-prompt the PIN
          for a different person on this machine without signing out of
          Google entirely. */}
      {!activeDoer && salesIdentity && user?.email?.toLowerCase() === SALES_EMAIL && (
        <div
          title={`Signed in as ${salesIdentity}`}
          className="h-[30px] flex items-center gap-1 pl-2.5 pr-1.5 rounded-[5px] border border-g200 bg-g100 text-[11px] font-medium text-g600"
        >
          <UserCircle2 size={13} className="text-red-mrt shrink-0" />
          <span className="hidden md:inline max-w-[120px] truncate">{salesIdentity}</span>
          <button
            type="button"
            title="Sign out — you'll need your PIN again to continue as this person"
            onClick={() => {
              if (confirm(`Sign out ${salesIdentity}? You'll need to enter your PIN again to continue.`)) {
                setSalesIdentity(null);
              }
            }}
            className="ml-0.5 p-1 rounded text-g400 hover:text-red-mrt hover:bg-white transition-colors"
          >
            <LogOut size={12} />
          </button>
        </div>
      )}

      <WorkspaceSwitcher />

      <GlobalDateRangePicker />

      <SlaNotificationBell />
    </header>
  );
}
