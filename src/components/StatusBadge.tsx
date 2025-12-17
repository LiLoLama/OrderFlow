import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ProcessStatus, StepStatus } from '../App';

interface StatusBadgeProps {
  status: StepStatus | ProcessStatus;
  text?: string;
}

const statusStyles: Record<StepStatus | ProcessStatus, string> = {
  pending: 'bg-slate-100 text-slate-400 border-slate-200',
  open: 'bg-blue-50 text-blue-600 border-blue-200',
  analyzing: 'bg-purple-50 text-purple-600 border-purple-200 animate-pulse',
  conflict: 'bg-red-50 text-red-600 border-red-200',
  verified: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

const labels: Record<StepStatus | ProcessStatus, string> = {
  pending: 'Ausstehend',
  open: 'Offen',
  analyzing: 'Prüfung...',
  conflict: 'Konflikt',
  verified: 'OK',
  completed: 'Abgeschlossen',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, text }) => (
  <div
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
      statusStyles[status] ?? statusStyles.pending
    }`}
  >
    {status === 'conflict' && <AlertCircle className="w-3 h-3" />}
    {(status === 'verified' || status === 'completed') && <CheckCircle2 className="w-3 h-3" />}
    {status === 'analyzing' && <Loader2 className="w-3 h-3 animate-spin" />}
    <span>{text ?? labels[status] ?? status}</span>
  </div>
);

export default StatusBadge;
