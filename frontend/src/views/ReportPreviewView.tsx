import React from 'react';
import { 
  Download, 
  Printer, 
  FileText, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import { Audit, Claim, Reference } from '../types';
import { getReportDownloadUrl } from '../api/client';
import { VerdictBadge, AuthenticityBadge, RetrievalBadge } from '../components/StatusBadge';

interface ReportPreviewViewProps {
  audit: Audit;
  claims: Claim[];
  references: Reference[];
  onNavigate: (view: string) => void;
}

export const ReportPreviewView: React.FC<ReportPreviewViewProps> = ({
  audit,
  claims,
  references,
  onNavigate,
}) => {
  const refMap = new Map(references.map((r) => [r.id, r]));
  const summary = audit.summary || {};
  const claimStats = summary.claims;
  const refStats = summary.references;

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto space-y-8 font-sans">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E8E7E1] gap-4">
        <button
          onClick={() => onNavigate('results')}
          className="text-xs font-semibold text-[#687387] hover:text-[#14233F] flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Audit Results</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl bg-white border border-[#E8E7E1] hover:bg-stone-50 text-xs font-semibold text-[#14233F] shadow-subtle flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#687387]" />
            <span>Print Report</span>
          </button>

          <a
            href={getReportDownloadUrl(audit.id)}
            target="_blank"
            rel="noreferrer"
            className="px-5 py-2 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold transition-all shadow-editorial flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Official PDF</span>
          </a>
        </div>
      </div>

      {/* Printable Report Document Surface */}
      <div className="bg-white rounded-3xl border border-[#E8E7E1] shadow-floating p-8 sm:p-14 space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Report Header */}
        <div className="border-b-2 border-[#14233F] pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#3268BB]">
              <ShieldCheck className="w-6 h-6" />
              <span className="font-extrabold text-xl tracking-tight text-[#14233F]">
                CITEVERIFY
              </span>
              <span className="text-xs font-mono uppercase tracking-widest text-[#687387]">
                &bull; RESEARCH AUDIT REPORT
              </span>
            </div>
            <p className="text-xs text-[#687387]">
              Automated Academic Citation & Empirical Evidence Verification
            </p>
          </div>

          <div className="text-left sm:text-right text-xs font-mono text-[#687387] space-y-0.5">
            <div>Date: <strong className="text-[#14233F]">{new Date(audit.created_at).toLocaleDateString()}</strong></div>
            <div>Audit ID: <strong className="text-[#14233F]">{audit.id}</strong></div>
            <div>Status: <span className="text-emerald-700 font-bold uppercase">{audit.status}</span></div>
          </div>
        </div>

        {/* Document Metadata Table */}
        <div className="p-5 rounded-2xl bg-[#FAF9F5] border border-[#E8E7E1] space-y-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <span className="font-bold text-[#687387]">Manuscript Title:</span>
            <span className="sm:col-span-3 font-serif font-bold text-sm text-[#14233F]">{audit.title || audit.filename}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <span className="font-bold text-[#687387]">Detected Authors:</span>
            <span className="sm:col-span-3 text-[#14233F]">{audit.authors || 'Unknown'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <span className="font-bold text-[#687387]">Pages Analyzed:</span>
            <span className="sm:col-span-3 text-[#14233F]">{audit.total_pages} pages &bull; File: {audit.filename}</span>
          </div>
        </div>

        {/* Executive Summary Ledger */}
        <div className="space-y-3">
          <h2 className="text-sm font-mono uppercase tracking-wider text-[#14233F] font-extrabold">
            01 &bull; Verification Executive Summary
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Claims Summary */}
            <div className="p-4 rounded-xl border border-[#E8E7E1] bg-white space-y-2 text-xs">
              <h4 className="font-bold text-[#14233F] border-b border-[#E8E7E1] pb-1.5">
                Claim-Evidence Findings ({claimStats?.total || claims.length})
              </h4>
              <div className="space-y-1 text-[#687387]">
                <div className="flex justify-between">
                  <span>Supported by Evidence:</span>
                  <strong className="text-emerald-700 font-mono">{claimStats?.supported || 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Partially Supported (with caveats):</span>
                  <strong className="text-amber-700 font-mono">{claimStats?.partial || 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Contradicted by Literature:</span>
                  <strong className="text-rose-700 font-mono">{claimStats?.contradicted || 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Insufficient Evidence (Paywalled):</span>
                  <strong className="text-slate-700 font-mono">{claimStats?.insufficient || 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Unverified / Unmapped:</span>
                  <strong className="text-blue-700 font-mono">{claimStats?.unverified || 0}</strong>
                </div>
              </div>
            </div>

            {/* References Summary */}
            <div className="p-4 rounded-xl border border-[#E8E7E1] bg-white space-y-2 text-xs">
              <h4 className="font-bold text-[#14233F] border-b border-[#E8E7E1] pb-1.5">
                Reference Authenticity ({refStats?.total || references.length})
              </h4>
              <div className="space-y-1 text-[#687387]">
                <div className="flex justify-between">
                  <span>Verified in OpenAlex/Crossref:</span>
                  <strong className="text-emerald-700 font-mono">{refStats?.verified || 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Possible Matches (review suggested):</span>
                  <strong className="text-amber-700 font-mono">{refStats?.possible_match || 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Critical Metadata Mismatches:</span>
                  <strong className="text-rose-700 font-mono">{refStats?.mismatch || 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Unverified Citations:</span>
                  <strong className="text-blue-700 font-mono">{refStats?.unverified || 0}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Claim Findings */}
        <div className="space-y-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-[#14233F] font-extrabold">
            02 &bull; Claim-by-Claim Verification Findings
          </h2>

          <div className="space-y-4">
            {claims.map((claim, idx) => {
              const ref = claim.reference_id ? refMap.get(claim.reference_id) : undefined;

              return (
                <div key={claim.id} className="p-5 rounded-2xl bg-[#FAF9F5] border border-[#E8E7E1] space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-[#14233F]">Claim #{idx + 1} ({claim.id})</strong>
                      <span className="text-[#687387]">&bull; Page {claim.page_number}</span>
                      {claim.citation_marker && (
                        <span className="font-mono text-[#3268BB] font-bold">
                          Marker: {claim.citation_marker}
                        </span>
                      )}
                    </div>
                    <VerdictBadge status={claim.verdict} size="sm" />
                  </div>

                  <p className="font-serif text-sm italic text-[#14233F]">
                    "{claim.claim_text}"
                  </p>

                  <div className="p-3 bg-white rounded-xl border border-[#E8E7E1] space-y-1">
                    <div>
                      <strong className="text-[#14233F] font-semibold">Evaluation:</strong> {claim.verdict_explanation}
                    </div>
                    {claim.evidence_passage && (
                      <div className="text-stone-700 pt-1 border-t border-[#E8E7E1]/60">
                        <strong className="text-emerald-900 font-semibold">Retrieved Evidence:</strong> <i>"{claim.evidence_passage}"</i>
                      </div>
                    )}
                  </div>

                  {ref && (
                    <div className="text-[11px] text-[#687387] flex items-center justify-between pt-1">
                      <span>Cited: {ref.title} ({ref.year}) &bull; DOI: {ref.doi || 'N/A'}</span>
                      <AuthenticityBadge status={ref.authenticity_status} size="sm" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* References Ledger */}
        <div className="space-y-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-[#14233F] font-extrabold">
            03 &bull; Bibliography Authenticity Ledger
          </h2>

          <div className="border border-[#E8E7E1] rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9F5] text-[#687387] font-mono border-b border-[#E8E7E1]">
                <tr>
                  <th className="py-2.5 px-3">Ref ID</th>
                  <th className="py-2.5 px-3">Cited Reference</th>
                  <th className="py-2.5 px-3">Authenticity</th>
                  <th className="py-2.5 px-3">Registry Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E7E1]">
                {references.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#14233F]">{r.id}</td>
                    <td className="py-2.5 px-3 max-w-sm truncate">{r.title || r.raw_citation}</td>
                    <td className="py-2.5 px-3">
                      <AuthenticityBadge status={r.authenticity_status} size="sm" />
                    </td>
                    <td className="py-2.5 px-3 text-[#687387]">{r.authenticity_reason || 'Verified'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="pt-6 border-t border-[#E8E7E1] text-[11px] text-[#687387] leading-relaxed">
          <strong>Methodological Notice & Limitations:</strong> CiteVerify cross-references citations against authoritative scholarly APIs (OpenAlex, Crossref). Evidence verdicts evaluate the degree of support between claim assertions and available original abstracts/open-access texts. An unverified status or insufficient evidence verdict does not necessarily indicate bad faith or falsified work, as paywalled or non-indexed publications cannot be inspected directly. Researchers must exercise domain expertise when assessing nuanced scholarly debate.
        </div>
      </div>
    </div>
  );
};
