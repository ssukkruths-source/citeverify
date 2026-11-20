import React, { useEffect, useState } from 'react';
import { 
  UploadCloud, 
  FileText, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  ChevronRight, 
  BookOpen, 
  Search, 
  TrendingUp, 
  ShieldAlert, 
  Download,
  Eye,
  RefreshCw,
  Compass,
  FolderOpen,
  Users,
  GitBranch
} from 'lucide-react';
import { Audit, Claim, DiscoveryMetrics } from '../types';
import {
  fetchAudits,
  fetchClaims,
  fetchDashboard,
  getReportDownloadUrl,
  loadSampleAudit,
} from '../api/client';
import { VerdictBadge, AuthenticityBadge } from '../components/StatusBadge';

interface DashboardViewProps {
  onNavigate: (view: string, auditId?: string) => void;
  onSelectAudit: (auditId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onSelectAudit,
}) => {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentClaims, setRecentClaims] = useState<Claim[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryMetrics | null>(null);
  const [mapping, setMapping] = useState<{ mapped: number; ambiguous: number; unmapped: number } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      fetchDashboard()
        .then((dash) => {
          setDiscovery(dash.discovery);
          setMapping(dash.mapping || null);
        })
        .catch(() => setDiscovery(null));
      const data = await fetchAudits();
      setAudits(data);
      if (data.length > 0) {
        // Fetch claims for the most recent audit to show flagged findings
        const firstAudit = data[0];
        try {
          const claims = await fetchClaims(firstAudit.id);
          setRecentClaims(claims);
        } catch (e) {
          console.error(e);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalDocuments = audits.length;
  const totalClaims = audits.reduce((acc, a) => acc + (a.summary?.claims?.total || 0), 0);
  const totalSupported = audits.reduce((acc, a) => acc + (a.summary?.claims?.supported || 0), 0);
  const totalContradicted = audits.reduce((acc, a) => acc + (a.summary?.claims?.contradicted || 0), 0);
  const totalUnverifiedRefs = audits.reduce((acc, a) => acc + (a.summary?.references?.unverified || 0) + (a.summary?.references?.mismatch || 0), 0);

  // Findings needing manual review: contradicted claims or unverified claims
  const reviewFindings = recentClaims.filter(c => c.verdict === 'CONTRADICTED' || c.verdict === 'PARTIALLY_SUPPORTED' || c.mapping_status === 'ambiguous');

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-8">
      {/* Top Welcome Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-[#E8E7E1] gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#687387] uppercase tracking-wider">
            <span>Research Intelligence Workspace</span>
            <span>&bull;</span>
            <span className="text-emerald-700 font-semibold">Scholarly APIs Connected</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
            Research Citation & Evidence Overview
          </h1>
          <p className="text-sm text-[#687387] mt-1">
            Audit manuscript references, detect hallucinated citations, and verify claim-level support.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            title="Refresh dashboard data"
            className="p-2.5 rounded-xl border border-[#E8E7E1] bg-white text-[#687387] hover:text-[#14233F] hover:bg-stone-50 transition-colors shadow-subtle cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => onNavigate('upload')}
            className="px-5 py-2.5 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold shadow-editorial transition-all flex items-center gap-2 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Start New Audit</span>
          </button>
        </div>
      </div>

      {/* Editorial Metric Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Panel 1 */}
        <div className="p-5 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle hover:border-[#3268BB] transition-all">
          <div className="flex items-center justify-between text-[#687387] mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Documents Audited</span>
            <FileText className="w-4 h-4 text-[#3268BB]" />
          </div>
          <div className="text-3xl font-extrabold text-[#14233F] tracking-tight">
            {totalDocuments}
          </div>
          <div className="text-xs text-[#687387] mt-2 flex items-center gap-1">
            <span className="font-semibold text-emerald-700">100% parsed</span> via structured extraction
          </div>
        </div>

        {/* Panel 2 */}
        <div className="p-5 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle hover:border-[#63A982] transition-all">
          <div className="flex items-center justify-between text-[#687387] mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Claims Evaluated</span>
            <CheckCircle2 className="w-4 h-4 text-[#63A982]" />
          </div>
          <div className="text-3xl font-extrabold text-[#14233F] tracking-tight">
            {totalClaims}
          </div>
          <div className="text-xs text-[#687387] mt-2 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>{totalSupported} Supported by primary evidence</span>
          </div>
        </div>

        {/* Panel 3 */}
        <div className="p-5 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle hover:border-[#D8847E] transition-all">
          <div className="flex items-center justify-between text-[#687387] mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Contradicted Claims</span>
            <XCircle className="w-4 h-4 text-[#D8847E]" />
          </div>
          <div className="text-3xl font-extrabold text-rose-600 tracking-tight">
            {totalContradicted}
          </div>
          <div className="text-xs text-[#687387] mt-2 flex items-center gap-1">
            <span className="text-rose-700 font-semibold">Direct disagreement</span> with primary findings
          </div>
        </div>

        {/* Panel 4 */}
        <div className="p-5 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle hover:border-[#F59E0B] transition-all">
          <div className="flex items-center justify-between text-[#687387] mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Unverified Citations</span>
            <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <div className="text-3xl font-extrabold text-amber-600 tracking-tight">
            {totalUnverifiedRefs}
          </div>
          <div className="text-xs text-[#687387] mt-2 flex items-center gap-1">
            <span>Missing from Crossref / Mismatches</span>
          </div>
        </div>
      </div>

      {/* Discovery & mapping integrity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-[#14233F] flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#3268BB]" /> Research library
            </h3>
            <button
              onClick={() => onNavigate('discover')}
              className="text-[11px] font-semibold text-[#3268BB] hover:underline"
            >
              Open Research Discovery →
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Saved papers', value: discovery?.saved_papers ?? 0, icon: FolderOpen },
              { label: 'Collections', value: discovery?.collections ?? 0, icon: BookOpen },
              { label: 'Relationships', value: discovery?.relationships ?? 0, icon: GitBranch },
              { label: 'Authors', value: discovery?.authors ?? 0, icon: Users },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1]">
                  <div className="flex items-center justify-between text-[#687387]">
                    <span className="text-[9.5px] font-mono uppercase">{item.label}</span>
                    <Icon className="w-3 h-3" />
                  </div>
                  <div className="text-xl font-extrabold text-[#14233F] mt-1">{item.value}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle">
          <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-[#14233F] mb-3">
            Citation mapping integrity
          </h3>
          {mapping ? (
            <div className="space-y-2">
              {[
                ['Mapped to a reference', mapping.mapped, 'bg-emerald-500'],
                ['Ambiguous mapping', mapping.ambiguous, 'bg-amber-500'],
                ['No citation detected', mapping.unmapped, 'bg-stone-400'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-[#687387]">
                    <span className={`w-2 h-2 rounded-full ${color}`} />
                    {label}
                  </span>
                  <span className="font-mono font-bold text-[#14233F]">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[#687387] leading-relaxed">
              Mapping figures appear once an audit has completed. Statements without a citation
              are reported as “Citation not detected” rather than guessed.
            </p>
          )}
        </div>
      </div>

      {/* Main Content Grid: Recent Audits & Attention Flags */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Recent Audits (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#14233F] tracking-tight">
              Recent Manuscript Audits
            </h2>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs font-semibold text-[#3268BB] hover:underline flex items-center gap-1"
            >
              <span>View all ({audits.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {audits.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white border border-[#E8E7E1] text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FAF9F5] text-[#687387] flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#14233F]">No manuscript audits found</h3>
                <p className="text-xs text-[#687387] max-w-sm mx-auto mt-1">
                  Upload a research paper in PDF format or try our bundled benchmark sample to see live citation verification.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => onNavigate('upload')}
                  className="px-4 py-2 rounded-lg bg-[#14233F] text-white text-xs font-bold hover:bg-[#3268BB] transition-colors"
                >
                  Upload Research PDF
                </button>
                <button
                  onClick={async () => {
                    const sample = await loadSampleAudit();
                    onSelectAudit(sample.audit_id);
                    onNavigate('results', sample.audit_id);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#FFF3D8] text-[#14233F] text-xs font-bold hover:bg-[#cbe665] transition-colors"
                >
                  Load Sample Paper
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {audits.slice(0, 5).map((audit) => {
                const isComplete = audit.status === 'completed';
                const claimsTotal = audit.summary?.claims?.total || 0;
                const refsTotal = audit.summary?.references?.total || 0;
                const contradictedCount = audit.summary?.claims?.contradicted || 0;

                return (
                  <div
                    key={audit.id}
                    className="p-5 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle hover:border-[#3268BB] transition-all group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            isComplete ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200 animate-pulse'
                          }`}>
                            {audit.status}
                          </span>
                          <span className="text-xs font-mono text-[#687387]">
                            {new Date(audit.created_at).toLocaleDateString()}
                          </span>
                          {contradictedCount > 0 && (
                            <span className="text-[10px] font-mono px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-full font-bold">
                              {contradictedCount} Contradicted
                            </span>
                          )}
                        </div>

                        <h3 
                          onClick={() => {
                            onSelectAudit(audit.id);
                            onNavigate('results', audit.id);
                          }}
                          className="text-base font-bold text-[#14233F] truncate hover:text-[#3268BB] cursor-pointer transition-colors"
                        >
                          {audit.title || audit.filename}
                        </h3>

                        <p className="text-xs text-[#687387] line-clamp-1 mt-1 font-serif italic">
                          Authors: {audit.authors || 'Unknown'} &bull; {audit.total_pages} pages
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-[#687387]">
                          <span>Claims: <strong className="text-[#14233F]">{claimsTotal}</strong></span>
                          <span>References: <strong className="text-[#14233F]">{refsTotal}</strong></span>
                          <span>Verified: <strong className="text-emerald-700">{audit.summary?.references?.verified || 0}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          onClick={() => {
                            onSelectAudit(audit.id);
                            onNavigate('results', audit.id);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-[#FAF9F5] hover:bg-[#14233F] hover:text-white text-[#14233F] text-xs font-semibold border border-[#E8E7E1] transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Results</span>
                        </button>

                        <button
                          onClick={() => {
                            onSelectAudit(audit.id);
                            onNavigate('pdf-viewer', audit.id);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-stone-50 text-[#14233F] text-xs font-semibold border border-[#E8E7E1] transition-all flex items-center gap-1.5 shadow-subtle cursor-pointer"
                        >
                          <span>PDF Reader</span>
                        </button>

                        <a
                          href={getReportDownloadUrl(audit.id)}
                          target="_blank"
                          rel="noreferrer"
                          title="Download ReportLab PDF"
                          className="p-1.5 rounded-lg text-[#687387] hover:text-[#14233F] hover:bg-[#FAF9F5] transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Highlighted Findings Requiring Manual Review (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#14233F] tracking-tight flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>Flagged Findings</span>
            </h2>
            <span className="text-xs font-mono text-[#687387]">
              {reviewFindings.length} requiring review
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-[#E8E7E1] p-5 shadow-subtle space-y-4">
            <p className="text-xs text-[#687387] leading-relaxed">
              These claims exhibited empirical contradiction or qualified discrepancy during scholarly cross-referencing:
            </p>

            {reviewFindings.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#FAF9F5] text-center text-xs text-[#687387]">
                No critical discrepancies flagged in recent audits.
              </div>
            ) : (
              <div className="space-y-3">
                {reviewFindings.slice(0, 3).map((claim) => (
                  <div 
                    key={claim.id}
                    onClick={() => {
                      onSelectAudit(claim.audit_id);
                      onNavigate('claims', claim.audit_id);
                    }}
                    className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1] hover:border-[#14233F] transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <VerdictBadge status={claim.verdict} size="sm" />
                      <span className="text-[10px] font-mono text-[#687387]">
                        Marker: {claim.citation_marker || 'not detected'}
                      </span>
                    </div>

                    <p className="text-xs font-serif text-[#14233F] italic line-clamp-2">
                      "{claim.claim_text}"
                    </p>

                    <p className="text-[11px] text-[#687387] line-clamp-2 mt-1.5">
                      <strong className="text-rose-700 font-sans font-medium">Finding:</strong> {claim.verdict_explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-[#E8E7E1]">
              <button
                onClick={() => {
                  if (audits.length > 0) {
                    onSelectAudit(audits[0].id);
                    onNavigate('claims', audits[0].id);
                  }
                }}
                className="w-full py-2 text-center text-xs font-semibold text-[#3268BB] hover:underline"
              >
                Inspect All Flagged Claims in Explorer &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
