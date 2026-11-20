import React, { useEffect, useState } from 'react';
import { 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  RefreshCw, 
  ArrowRight, 
  FileText, 
  ArrowLeft,
  FileCheck2,
  Database,
  Search,
  Scale
} from 'lucide-react';
import { Audit } from '../types';
import { fetchAudit } from '../api/client';

interface ProcessingViewProps {
  auditId: string;
  onComplete: (auditId: string) => void;
  onNavigate: (view: string) => void;
}

const STAGES = [
  { step: 1, title: 'Document uploaded', desc: 'Validating the PDF and creating a private workspace' },
  { step: 2, title: 'Text extracted', desc: 'Reading every page and reporting unreadable pages' },
  { step: 3, title: 'Metadata identified', desc: 'Title, authors, DOI, journal and abstract' },
  { step: 4, title: 'Research claims extracted', desc: 'Selecting factual, statistical and empirical statements' },
  { step: 5, title: 'Citations identified', desc: 'Numeric, superscript-style and author-year markers' },
  { step: 6, title: 'References extracted', desc: 'Segmenting the bibliography into individual entries' },
  { step: 7, title: 'Claims mapped to references', desc: 'Resolving each citation to a bibliography entry' },
  { step: 8, title: 'Academic records searched', desc: 'Crossref, OpenAlex and Semantic Scholar lookups' },
  { step: 9, title: 'Original sources retrieved', desc: 'Abstracts and open-access metadata where available' },
  { step: 10, title: 'Evidence analysed', desc: 'Comparing each claim with retrieved source text' },
  { step: 11, title: 'Report generated', desc: 'Compiling the findings and PDF report' },
];

export const ProcessingView: React.FC<ProcessingViewProps> = ({
  auditId,
  onComplete,
  onNavigate,
}) => {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let pollInterval: any = null;

    const checkStatus = async () => {
      try {
        const data = await fetchAudit(auditId);
        if (!isMounted) return;
        setAudit(data);

        if (data.status === 'completed') {
          clearInterval(pollInterval);
          setTimeout(() => {
            if (isMounted) onComplete(auditId);
          }, 800);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          setError(data.step_message || 'Verification process encountered an unrecoverable error.');
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Polling error:', err);
      }
    };

    checkStatus();
    pollInterval = setInterval(checkStatus, 1000);

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [auditId, onComplete]);

  const currentStep = audit?.current_step || 1;
  const totalSteps = audit?.total_steps || STAGES.length;
  const progressPercent = Math.min(100, Math.round((currentStep / totalSteps) * 100));

  return (
    <div className="p-6 sm:p-10 max-w-4xl mx-auto space-y-8 font-sans">
      {/* Top Breadcrumb / Return */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate('dashboard')}
          className="text-xs font-semibold text-[#687387] hover:text-[#14233F] flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </button>

        <span className="text-xs font-mono text-[#687387]">
          Session ID: <code className="text-[#14233F]">{auditId.slice(0, 12)}</code>
        </span>
      </div>

      {/* Main Status Header */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-mono">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Live Pipeline Execution</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#14233F] tracking-tight">
          Verifying Research Claims
        </h1>

        <p className="text-sm text-[#687387]">
          {audit?.title ? `Auditing: "${audit.title}"` : 'Analyzing manuscript text, mapping references, and evaluating scholarly evidence...'}
        </p>

        {/* Real Backend Status Message */}
        <div className="inline-block px-4 py-2 bg-white rounded-xl border border-[#E8E7E1] shadow-subtle text-xs font-mono text-[#14233F]">
          Status: <span className="font-semibold text-[#3268BB]">{audit?.step_message || 'Initializing pipeline...'}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white p-6 rounded-2xl border border-[#E8E7E1] shadow-subtle space-y-2">
        <div className="flex justify-between text-xs font-mono">
          <span className="font-semibold text-[#14233F]">Overall Progress</span>
          <span className="text-[#3268BB] font-bold">{progressPercent}%</span>
        </div>
        <div className="w-full h-3 bg-[#FAF9F5] rounded-full overflow-hidden border border-[#E8E7E1]">
          <div
            className="h-full bg-[#3268BB] transition-all duration-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Live 11-stage timeline */}
      <div className="bg-white rounded-3xl border border-[#E8E7E1] shadow-editorial p-6 sm:p-8">
        <h3 className="text-sm font-mono uppercase tracking-wider text-[#687387] font-bold mb-6">
          Pipeline Stages (Live Backend Synchronization)
        </h3>

        <div className="space-y-4">
          {STAGES.map((stage) => {
            const isCompleted = currentStep > stage.step;
            const isCurrent = currentStep === stage.step && audit?.status !== 'failed';
            const isPending = currentStep < stage.step;
            const isFailed = currentStep === stage.step && audit?.status === 'failed';

            return (
              <div
                key={stage.step}
                className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                  isCurrent
                    ? 'bg-blue-50/70 border-blue-200 shadow-sm'
                    : isCompleted
                    ? 'bg-emerald-50/40 border-emerald-100'
                    : isFailed
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-[#FAF9F5]/40 border-[#E8E7E1] opacity-50'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-bold ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-[#3268BB] text-white animate-pulse'
                        : isFailed
                        ? 'bg-rose-600 text-white'
                        : 'bg-[#E8E7E1] text-[#687387]'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isFailed ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      stage.step
                    )}
                  </div>

                  <div>
                    <h4 className={`text-sm font-bold ${isCurrent ? 'text-[#14233F]' : isCompleted ? 'text-emerald-950' : 'text-[#687387]'}`}>
                      {stage.title}
                    </h4>
                    <p className="text-xs text-[#687387]">
                      {stage.desc}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${
                    isCompleted
                      ? 'bg-emerald-100 text-emerald-800'
                      : isCurrent
                      ? 'bg-blue-100 text-blue-800'
                      : isFailed
                      ? 'bg-rose-100 text-rose-800'
                      : 'text-[#687387]'
                  }`}>
                    {isCompleted ? 'Completed' : isCurrent ? 'Processing...' : isFailed ? 'Failed' : 'Queued'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error State Banner if Failed */}
      {error && (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-900">
                Pipeline Failed
              </h4>
              <p className="text-xs text-rose-800 mt-1">
                {error}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onNavigate('upload')}
              className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition-colors"
            >
              Upload Another Paper
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2 bg-white text-[#14233F] border border-[#E8E7E1] text-xs font-semibold rounded-lg hover:bg-stone-50 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
