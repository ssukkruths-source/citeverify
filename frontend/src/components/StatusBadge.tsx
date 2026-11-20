import React from 'react';
import { VerdictStatus, AuthenticityStatus, RetrievalLevel } from '../types';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, Globe, BookOpen, AlertCircle } from 'lucide-react';

interface VerdictBadgeProps {
  status: VerdictStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({ status, size = 'md', showIcon = true }) => {
  const configs = {
    SUPPORTED: {
      label: 'Supported',
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-500',
      icon: CheckCircle2,
    },
    PARTIALLY_SUPPORTED: {
      label: 'Partially Supported',
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
      icon: AlertTriangle,
    },
    CONTRADICTED: {
      label: 'Contradicted',
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      dot: 'bg-rose-500',
      icon: XCircle,
    },
    INSUFFICIENT_EVIDENCE: {
      label: 'Insufficient Evidence',
      bg: 'bg-slate-100 text-slate-700 border-slate-300',
      dot: 'bg-slate-500',
      icon: HelpCircle,
    },
    UNVERIFIED: {
      label: 'Unverified',
      bg: 'bg-blue-50 text-blue-800 border-blue-200',
      dot: 'bg-blue-500',
      icon: AlertCircle,
    },
  };

  const cfg = configs[status] || configs.UNVERIFIED;
  const Icon = cfg.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 font-medium',
    md: 'text-xs px-2.5 py-1 font-semibold tracking-wide',
    lg: 'text-sm px-3.5 py-1.5 font-semibold',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${cfg.bg} ${sizeClasses[size]}`}>
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />}
      <span>{cfg.label}</span>
    </span>
  );
};

export const AuthenticityBadge: React.FC<{ status: AuthenticityStatus; size?: 'sm' | 'md' }> = ({ status, size = 'md' }) => {
  const configs = {
    VERIFIED: {
      label: 'Verified Publication',
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: CheckCircle2,
    },
    POSSIBLE_MATCH: {
      label: 'Possible Match',
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: AlertTriangle,
    },
    MISMATCH: {
      label: 'Metadata Mismatch',
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      icon: XCircle,
    },
    UNVERIFIED: {
      label: 'Unverified Citation',
      bg: 'bg-slate-100 text-slate-700 border-slate-300',
      icon: HelpCircle,
    },
    RETRIEVAL_FAILED: {
      label: 'Retrieval Failed',
      bg: 'bg-purple-50 text-purple-800 border-purple-200',
      icon: AlertCircle,
    },
  };

  const cfg = configs[status] || configs.UNVERIFIED;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${cfg.bg} ${size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1 font-medium'}`}>
      <Icon className="w-3 h-3" />
      <span>{cfg.label}</span>
    </span>
  );
};

export const RetrievalBadge: React.FC<{ level: RetrievalLevel }> = ({ level }) => {
  const configs = {
    full_text: {
      label: 'Full Text Inspected',
      bg: 'bg-teal-50 text-teal-800 border-teal-200',
      icon: BookOpen,
    },
    abstract_only: {
      label: 'Abstract Only',
      bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      icon: FileText,
    },
    metadata_only: {
      label: 'Metadata Only (Paywalled)',
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: Globe,
    },
    unavailable: {
      label: 'Source Unavailable',
      bg: 'bg-stone-100 text-stone-600 border-stone-200',
      icon: HelpCircle,
    },
  };

  const cfg = configs[level] || configs.unavailable;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono ${cfg.bg}`}>
      <Icon className="w-3 h-3" />
      <span>{cfg.label}</span>
    </span>
  );
};
