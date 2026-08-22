import { cn } from '../../lib/utils';

interface HighlighterProps {
  children: React.ReactNode;
  action?: 'highlight' | 'underline';
  color?: string;
  className?: string;
}

export function Highlighter({ children, action = 'highlight', color = '#FFD700', className }: HighlighterProps) {
  if (action === 'underline') {
    return (
      <span
        className={cn('relative inline whitespace-nowrap', className)}
        style={{
          backgroundImage: `linear-gradient(transparent 60%, ${color}99 60%, ${color}99 88%, transparent 88%)`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn('relative inline rounded-[2px] px-[2px]', className)}
      style={{ backgroundColor: color + '55', boxShadow: `0 0 0 2px ${color}33` }}
    >
      {children}
    </span>
  );
}
