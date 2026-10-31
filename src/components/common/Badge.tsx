import React from 'react';
import { JobStatus, ShopStatus } from '../../types';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'amber' | 'sky' | 'rose' | 'slate' | 'indigo';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md'
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-medium',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border whitespace-nowrap ${variantStyles[variant]} ${sizeStyles[size]}`}>
      {children}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: JobStatus | ShopStatus | string }> = ({ status }) => {
  const getStyle = (s: string) => {
    switch (s) {
      case 'WAITING':
      case 'pending':
        return { variant: 'amber' as const, label: s === 'pending' ? 'Pending Approval' : 'Waiting in Queue' };
      case 'REVIEWING':
        return { variant: 'sky' as const, label: 'Reviewing Files' };
      case 'PRINTING':
        return { variant: 'indigo' as const, label: 'Printing Now' };
      case 'PRINTED':
      case 'active':
        return { variant: 'emerald' as const, label: s === 'active' ? 'Active' : 'Printed' };
      case 'REJECTED':
      case 'blocked':
      case 'suspended':
        return { variant: 'rose' as const, label: s === 'suspended' ? 'Suspended' : s === 'blocked' ? 'Blocked' : 'Rejected' };
      case 'EXPIRED':
      case 'expired':
        return { variant: 'slate' as const, label: 'Expired' };
      default:
        return { variant: 'slate' as const, label: s };
    }
  };

  const config = getStyle(status);

  return (
    <Badge variant={config.variant}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {config.label}
    </Badge>
  );
};

export const TokenBadge: React.FC<{ token: string; className?: string }> = ({ token, className = '' }) => {
  return (
    <span className={`inline-flex items-center px-3 py-1 font-mono font-bold text-sm tracking-wider bg-slate-900 text-emerald-400 rounded-lg shadow-sm border border-slate-800 ${className}`}>
      {token}
    </span>
  );
};
