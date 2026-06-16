import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, FileSignature, ShoppingCart, Users, LineChart, Settings, Boxes, LogOut, Phone, Brain, ChevronRight, ChevronLeft, Gauge } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';

export function useSidebarCollapse() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(location.pathname === '/followups');
  useEffect(() => {
    if (location.pathname === '/followups') setCollapsed(true);
  }, [location.pathname]);
  return { collapsed, setCollapsed };
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  const { data, user, logout } = useAppStore();
  const [logoError, setLogoError] = useState(false);

  const newEnqCount = data.enquiries.filter(e => e.status === 'New' || e.status === 'In Review').length;
  const sentQuotesCount = data.quotes.filter(q => q.status === 'Sent').length;
  const activeOrdersCount = data.orders.filter(o => o.status === 'Processing').length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueFollowUpsCount = data.followups.filter(f => {
    const quote = data.quotes.find(q => q.id === f.quote_id);
    if (!quote || quote.status !== 'Sent') return false;
    return f.next_date && new Date(f.next_date) < today;
  }).length;

  const isActive = (path: string) => location.pathname === path;

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || '??';

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  return (
    <aside className={cn(
      "bg-dark flex flex-col border-r border-white/5 transition-all duration-300 shrink-0 overflow-hidden h-full",
      collapsed ? "w-[48px] min-w-[48px]" : "w-[220px] min-w-[220px]"
    )}>
      {/* Header */}
      <div className={cn(
        "bg-white border-b border-g200 flex items-center shrink-0 overflow-hidden transition-all duration-300",
        collapsed ? "px-0 py-3.5 justify-center h-[57px]" : "px-4 py-3.5 gap-3 h-[57px]"
      )}>
        {collapsed ? (
          <span className="font-serif font-bold text-[13px] text-red-mrt tracking-wide">M</span>
        ) : (
          <>
            {logoError ? (
              <span className="font-serif font-bold text-[15px] text-red-mrt tracking-wide">MANGLA</span>
            ) : (
              <img
                src="/mangla-logo.png"
                alt="Mangla"
                className="h-8"
                onError={() => setLogoError(true)}
              />
            )}
            <div className="w-px h-7 bg-g200" />
            <div className="font-mono text-[8px] font-bold tracking-[2.5px] uppercase text-g500 leading-tight">
              EQ System<br />v2.0
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        {/* Section label — hidden when collapsed */}
        {!collapsed && (
          <div className="font-mono text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 px-2.5 mb-1">Main</div>
        )}
        <div className={cn("mb-4", collapsed && "mt-1")}>
          <NavItem to="/" icon={<LayoutDashboard size={15} />} label="Dashboard" active={isActive('/')} collapsed={collapsed} dataTour="nav-dashboard" />
          <NavItem to="/enquiries" icon={<FileText size={15} />} label="Enquiries" active={isActive('/enquiries')} collapsed={collapsed}
            badge={newEnqCount > 0 ? { text: newEnqCount.toString(), className: 'bg-red-mrt' } : undefined} dataTour="nav-enquiries" />
          <NavItem to="/quotes" icon={<FileSignature size={15} />} label="Quotations" active={isActive('/quotes')} collapsed={collapsed}
            badge={sentQuotesCount > 0 ? { text: sentQuotesCount.toString(), className: 'bg-sR' } : undefined} dataTour="nav-quotations" />
          <NavItem to="/orders" icon={<ShoppingCart size={15} />} label="Orders" active={isActive('/orders')} collapsed={collapsed}
            badge={activeOrdersCount > 0 ? { text: activeOrdersCount.toString(), className: 'bg-sW' } : undefined} dataTour="nav-orders" />
          <NavItem to="/followups" icon={<Phone size={15} />} label="Follow-Ups" active={isActive('/followups')} collapsed={collapsed}
            badge={overdueFollowUpsCount > 0 ? { text: overdueFollowUpsCount.toString(), className: 'bg-red-mrt' } : undefined} dataTour="nav-followups" />
          <NavItem to="/customers" icon={<Users size={15} />} label="Customers" active={isActive('/customers')} collapsed={collapsed} dataTour="nav-customers" />
        </div>

        {!collapsed && (
          <div className="font-mono text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 px-2.5 mb-1">Insights</div>
        )}
        {collapsed && <div className="mx-2 h-px bg-white/10 mb-2" />}
        <div className="mb-4">
          <NavItem to="/analytics" icon={<LineChart size={15} />} label="Analytics" active={isActive('/analytics')} collapsed={collapsed} dataTour="nav-analytics" />
          <NavItem to="/doer-kpi" icon={<Gauge size={15} />} label="Doer KPI" active={isActive('/doer-kpi')} collapsed={collapsed} />
          <NavItem to="/intelligence" icon={<Brain size={15} />} label="Customer Intel" active={isActive('/intelligence')} collapsed={collapsed} />
          <NavItem to="/blueprint" icon={<Boxes size={15} />} label="System Plan" active={isActive('/blueprint')} collapsed={collapsed} />
          <NavItem to="/settings" icon={<Settings size={15} />} label="Settings" active={isActive('/settings')} collapsed={collapsed} />
        </div>
      </div>

      {/* Footer */}
      <div className={cn(
        "border-t border-white/5 flex flex-col shrink-0 transition-all duration-300",
        collapsed ? "p-2 items-center gap-2" : "p-3 gap-3"
      )}>
        {collapsed ? (
          <>
            <div className="w-8 h-8 rounded-full bg-red-mrt flex items-center justify-center font-mono text-[10px] font-bold text-white shrink-0" title={userName}>
              {userInitials}
            </div>
            <button
              type="button"
              onClick={() => { if (confirm('Logout from Himalaya TerpenesEQ?')) logout(); }}
              title="Sign Out"
              className="w-8 h-8 flex items-center justify-center rounded-[5px] text-white/40 hover:bg-white/5 hover:text-white/80 transition-colors"
            >
              <LogOut size={14} strokeWidth={2} />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-red-mrt flex items-center justify-center font-mono text-[10px] font-bold text-white shrink-0">
                {userInitials}
              </div>
              <div className="min-w-0">
                <div className="text-xs text-white/80 font-medium truncate">{userName}</div>
                <div className="text-[10px] text-white/20 truncate">{user?.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { if (confirm('Logout from Himalaya TerpenesEQ?')) logout(); }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-[5px] text-[12px] text-white/40 hover:bg-white/5 hover:text-white/80 transition-colors"
            >
              <LogOut size={14} strokeWidth={2} />
              <span>Sign Out</span>
            </button>
          </>
        )}

        {/* Collapse toggle at bottom of rail */}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-8 h-8 flex items-center justify-center rounded-[5px] text-white/30 hover:bg-white/5 hover:text-white/70 transition-colors"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  to, icon, label, active, collapsed, badge, dataTour,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge?: { text: string; className?: string };
  dataTour?: string;
}) {
  return (
    <Link
      to={to}
      data-tour={dataTour}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2.5 py-2 rounded-[5px] text-[13px] transition-colors relative mb-px group overflow-hidden",
        collapsed ? "justify-center px-0 mx-2" : "px-2.5 mx-0",
        active ? "bg-red-mrt/15 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/80"
      )}
    >
      {active && <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-red-mrt rounded-r-sm" />}
      <div className="relative shrink-0 [&>svg]:stroke-[1.7px]">
        {icon}
        {/* Dot badge in collapsed mode */}
        {collapsed && badge && (
          <span className={cn("absolute -top-1 -right-1 w-[14px] h-[14px] flex items-center justify-center rounded-full text-white font-mono text-[7px] font-bold", badge.className)}>
            {badge.text}
          </span>
        )}
      </div>
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge && (
        <span className={cn("ml-auto text-white font-mono text-[9px] font-bold px-1.5 py-px rounded-full min-w-[18px] text-center shrink-0", badge.className)}>
          {badge.text}
        </span>
      )}
    </Link>
  );
}
