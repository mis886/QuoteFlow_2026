import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Workflow, Factory, AlertTriangle,
  Settings as Cog, ArrowLeftRight, Package, FlaskConical,
  LayoutGrid, Hammer, Scissors, Microscope, Truck, ShieldCheck,
  FileInput, FolderOpen,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const SHOP_ITEMS = [
  { to: '/production',            icon: LayoutDashboard, label: 'Dashboard',      exact: true },
  { to: '/production/orders',     icon: FileInput,       label: 'Orders' },
  { to: '/production/sequencer',  icon: Workflow,        label: 'Sequencer' },
  { to: '/production/presses',    icon: Factory,         label: 'Press Board' },
  { to: '/production/ncr',        icon: AlertTriangle,   label: 'NCR Log' },
  { to: '/production/docs',       icon: FolderOpen,      label: 'Docs' },
  { to: '/production/settings',   icon: Cog,             label: 'Shop Floor' },
];

const MASTER_ITEMS = [
  { to: '/production/products',   icon: Package,         label: 'Products & BOM' },
  { to: '/production/compounds',  icon: FlaskConical,    label: 'Compounds' },
];

const LOG_ITEMS = [
  { to: '/production/board',          icon: LayoutGrid,   label: 'Job Card Board' },
  { to: '/production/log-molding',    icon: Hammer,       label: 'Log Molding' },
  { to: '/production/log-finishing',  icon: Scissors,     label: 'Log Finishing' },
  { to: '/production/log-inspection', icon: Microscope,   label: 'Log Inspection' },
  { to: '/production/log-pdi',        icon: ShieldCheck,  label: 'Log PDI' },
  { to: '/production/dispatch',       icon: Truck,        label: 'Dispatch' },
];

export function ProductionSidebar() {
  const location = useLocation();
  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <aside className="prod-sidebar">
      {/* Logo */}
      <div className="prod-sidebar-logo">
        <div className="prod-sidebar-icon">
          <Factory size={14} color="#fff" />
        </div>
        <div>
          <div className="prod-sidebar-brand">MRT ERP</div>
          <div className="prod-sidebar-app">Production</div>
        </div>
      </div>

      {/* Nav */}
      <div className="prod-sidebar-nav">
        <SectionLabel label="Shop Floor" />
        {SHOP_ITEMS.map(item => (
          <NavItem key={item.to} {...item} active={isActive(item.to, item.exact)} />
        ))}
        <div className="prod-sidebar-spacer" />
        <SectionLabel label="Production Log" />
        {LOG_ITEMS.map(item => (
          <NavItem key={item.to} {...item} active={isActive(item.to)} />
        ))}
        <div className="prod-sidebar-spacer" />
        <SectionLabel label="Master Data" />
        {MASTER_ITEMS.map(item => (
          <NavItem key={item.to} {...item} active={isActive(item.to)} />
        ))}
      </div>

      {/* Back to CRM */}
      <div className="prod-sidebar-footer">
        <Link to="/" className="prod-sidebar-back">
          <ArrowLeftRight size={13} />
          <span>Back to CRM</span>
        </Link>
      </div>
    </aside>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <div className="prod-sidebar-section">{label}</div>;
}

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link to={to} className={cn('prod-nav-item', active && 'active')}>
      <Icon size={14} />
      <span>{label}</span>
    </Link>
  );
}
