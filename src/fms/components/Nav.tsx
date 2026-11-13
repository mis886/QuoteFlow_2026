import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  group: string;
  count?: number;
}

export function Nav({ items }: { items: NavItem[] }) {
  const path = useLocation().pathname.replace(/\/$/, '') || '/';
  const groups = [...new Set(items.map((i) => i.group))];
  const isActive = (href: string) => {
    if (href === '/fms') return path === '/fms' || path === '/fms/dashboard';
    if (href === '/fms/tasks/new') return path === href;
    return path === href || path.startsWith(href + '/');
  };
  return (
    <nav className="nav" aria-label="FMS">
      {groups.map((g) => (
        <div key={g}>
          <div className="nav-group">{g}</div>
          {items
            .filter((i) => i.group === g)
            .map((i) => {
              const active = isActive(i.href);
              return (
                <Link key={i.href} to={i.href} aria-current={active ? 'page' : undefined}>
                  <Icon name={i.icon} />
                  <span>{i.label}</span>
                  {i.count ? <span className="count" aria-label={`${i.count} need attention`}>{i.count}</span> : null}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
