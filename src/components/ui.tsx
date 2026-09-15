import React from 'react';
import { cn } from '../lib/utils';
import { EnqStatus, OrderStatus, QuoteStatus, Urgency, TicketStatus } from '../lib/types';
import { Mail, Phone, MessageCircle, Home, Globe, LayoutDashboard, Plus } from 'lucide-react';

export const Badge = ({ status, className }: { status: EnqStatus | QuoteStatus | OrderStatus | Urgency | TicketStatus, className?: string }) => {
  const badgeColors: Record<string, string> = {
    'New': 'bg-sN/10 text-sN',
    'In Review': 'bg-sR/10 text-sR',
    'Quoted': 'bg-sQ/10 text-sQ',
    'Sent': 'bg-sQ/10 text-sQ',
    'Won': 'bg-sW/10 text-sW',
    'Lost': 'bg-sL/10 text-sL',
    'Parked': 'bg-sP/10 text-sP',
    // 2026-09-07: added for Enquiries' new 'Not Qualified' status — a
    // distinct muted tone from 'Lost' (bg-sL) so the two read as different
    // outcomes at a glance.
    'Not Qualified': 'bg-zinc-100 text-zinc-600',
    'Draft': 'bg-sR/10 text-sR',
    'Order Confirmed': 'bg-blue-50 text-blue-700',
    'Processing': 'bg-sR/10 text-sR',
    'Delivered': 'bg-sN/10 text-sN',
    'Order Pending for Dispatch': 'bg-violet-50 text-violet-700',
    'Hot': 'bg-red-mrt/10 text-red-mrt',
    'Urgent': 'bg-sP/10 text-sP',
    'Normal': 'bg-sN/10 text-sN',
    'Low': 'bg-sL/10 text-sL',
    // Ticket statuses — Open→amber, In Progress→blue, Resolved→green, Closed→gray
    'Open': 'bg-sR/10 text-sR',
    'In Progress': 'bg-sN/10 text-sN',
    'Resolved': 'bg-sW/10 text-sW',
    'Closed': 'bg-sL/10 text-sL',
  };

  const dotColors: Record<string, string> = {
    'New': 'bg-sN',
    'In Review': 'bg-sR',
    'Quoted': 'bg-sQ',
    'Sent': 'bg-sQ',
    'Won': 'bg-sW',
    'Lost': 'bg-sL',
    'Parked': 'bg-sP',
    'Not Qualified': 'bg-zinc-500',
    'Draft': 'bg-sR',
    'Order Confirmed': 'bg-blue-500',
    'Processing': 'bg-sR',
    'Delivered': 'bg-sN',
    'Order Pending for Dispatch': 'bg-violet-500',
    'Hot': 'bg-red-mrt',
    'Urgent': 'bg-sP',
    'Normal': 'bg-sN',
    'Low': 'bg-sL',
    'Open': 'bg-sR',
    'In Progress': 'bg-sN',
    'Resolved': 'bg-sW',
    'Closed': 'bg-sL',
  };

  // Display-only override — the underlying status value stays 'Processing'
  // everywhere (DB, comparisons, filters); only what the user reads changes.
  const displayLabels: Record<string, string> = {
    'Processing': 'Order Pending for Payment',
  };

  const colorStyle = badgeColors[status] || 'bg-sL/10 text-sL';
  const dotStyle = dotColors[status] || 'bg-sL';

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold whitespace-nowrap", colorStyle, className)}>
      <span className={cn("w-[5px] h-[5px] rounded-full shrink-0", dotStyle)} />
      {displayLabels[status] || status}
    </span>
  );
};

export const SourceIcon = ({ source, className }: { source: string, className?: string }) => {
  const mapping: Record<string, React.ReactNode> = {
    'Email': <Mail size={12} />,
    'Phone': <Phone size={12} />,
    'WhatsApp': <MessageCircle size={12} />,
    'Exhibition': <Home size={12} />,
    'Website': <Globe size={12} />,
    'Walk-in': <LayoutDashboard size={12} />
  };
  return <span className={cn("inline-block", className)}>{mapping[source] || <Mail size={12} />}</span>;
};

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'dark' | 'success', size?: 'sm' | 'md' }>(
  ({ className, variant = 'secondary', size = 'md', children, ...props }, ref) => {
    
    const baseStyle = "inline-flex items-center gap-1.5 font-mono font-bold tracking-[1.5px] uppercase rounded-[3px] border transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-red-lt disabled:opacity-50 disabled:pointer-events-none";
    
    const variantStyles = {
      primary: "bg-red-mrt text-white border-transparent hover:bg-red-h hover:-translate-y-px hover:shadow-[0_5px_18px_rgba(212,32,39,0.25)]",
      secondary: "bg-white text-blk border-g200 hover:border-g400 hover:bg-g100",
      ghost: "bg-red-lt text-red-mrt border-red-mrt/15 hover:bg-red-mrt/10",
      dark: "bg-blk text-white border-transparent hover:bg-dark hover:-translate-y-px",
      success: "bg-sW/10 text-sW border-sW/20 hover:bg-sW/20"
    };

    const sizeStyles = {
      sm: "px-2.5 py-1.5 text-[9px]",
      md: "px-4 py-2 text-[10px]"
    };

    return (
      <button 
        ref={ref} 
        className={cn(baseStyle, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

