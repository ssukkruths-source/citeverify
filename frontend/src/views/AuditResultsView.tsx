import React, { useEffect, useState } from 'react';
import { 
  FileText, 
  Download, 
  Search, 
  BookMarked, 
  SplitSquareVertical, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
  Globe, 
  Share2, 
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis 
} from 'recharts';
import { Audit, Claim, Reference } from '../types';
import { fetchAudit, fetchClaims, fetchReferences, getReportDownloadUrl } from '../api/client';
import { VerdictBadge, AuthenticityBadge, RetrievalBadge } from '../components/StatusBadge';

interface AuditResultsViewProps {
  auditId: string;
  onNavigate: (view: string, auditId?: string, filterParam?: string) => void;
  onSelectClaim: (claim: Claim) => void;
}

export const AuditResultsView: React.FC<AuditResultsViewProps> = ({
  auditId,
  onNavigate,
  onSelectClaim,
}) => {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVerdictFilter, setSelectedVerdictFilter] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [a, c, r] = await Promise.all([
          fetchAudit(auditId),
          fetchClaims(auditId),
          fetchReferences(auditId),
        ]);
        setAudit(a);
        setClaims(c);
        setReferences(r);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [auditId]);

  if (loading || !audit) {
    return (
      <div className="p-12 text-center text-[#687387] font-mono text-sm">
        Loading audit findings ledger...
      </div>
    );
  }

  const summary = audit.summary || {};
  const claimStats = summary.claims || {
    total: claims.length,
    supported: claims.filter(c => c.verdict === 'SUPPORTED').length,
    partial: claims.filter(c => c.verdict === 'PARTIALLY_SUPPORTED').length,
    contradicted: claims.filter(c => c.verdict === 'CONTRADICTED').length,
    insufficient: claims.filter(c => c.verdict === 'INSUFFICIENT_EVIDENCE').length,
    unverified: claims.filter(c => c.verdict === 'UNVERIFIED').length,
  };

  const refStats = summary.references || {
    total: references.length,
    verified: references.filter(r => r.authenticity_status === 'VERIFIED').length,
    possible_match: references.filter(r => r.authenticity_status === 'POSSIBLE_MATCH').length,
    mismatch: references.filter(r => r.authenticity_status === 'MISMATCH').length,
    unverified: references.filter(r => r.authenticity_status === 'UNVERIFIED').length,
    retrieval_failed: references.filter(r => r.authenticity_status === 'RETRIEVAL_FAILED').length,
  };

  const retrievalStats = summary.retrieval || {
    full_text: references.filter(r => r.retrieval_level === 'full_text').length,
    abstract_only: references.filter(r => r.retrieval_level === 'abstract_only').length,
    metadata_only: references.filter(r => r.retrieval_level === 'metadata_only').length,
    unavailable: references.filter(r => r.retrieval_level === 'unavailable').length,
  };

  // Recharts Data for Claims Pie
  const claimChartData = [
    { name: 'Supported', value: claimStats.supported, color: '#63A982', code: 'SUPPORTED' },
    { name: 'Partially Supported', value: claimStats.partial, color: '#F59E0B', code: 'PARTIALLY_SUPPORTED' },
    { name: 'Contradicted', value: claimStats.contradicted, color: '#D8847E', code: 'CONTRADICTED' },
    { name: 'Insufficient Evidence', value: claimStats.insufficient, color: '#64748B', code: 'INSUFFICIENT_EVIDENCE' },
    { name: 'Unverified', value: claimStats.unverified, color: '#3B82F6', code: 'UNVERIFIED' },
  ].filter(d => d.value > 0);

  // References Authenticity Bar Data
  const refChartData = [
    { name: 'Verified', count: refStats.verified, fill: '#63A982' },
    { name: 'Possible', count: refStats.possible_match, fill: '#F59E0B' },
    { name: 'Mismatch', count: refStats.mismatch, fill: '#D8847E' },
    { name: 'Unverified', count: refStats.unverified, fill: '#3B82F6' },
  ];

  const filteredClaims = selectedVerdictFilter
    ? claims.filter(c => c.verdict === selectedVerdictFilter)
    : claims;

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Header & Meta Bar */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E8E7E1] shadow-editorial flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold uppercase tracking-wider">
              Audit Complete
            </span>
            <span className="text-xs font-mono text-[#687387]">
              {new Date(audit.created_at).toLocaleDateString()} &bull; ID: {audit.id.slice(0, 10)}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight">
            {audit.title || audit.filename}
          </h1>

          <p className="text-xs sm:text-sm text-[#687387] font-serif italic">
            Authors: {(audit.authors_list?.length ? audit.authors_list.join(', ') : audit.authors) || 'Unknown'} &bull; {audit.total_pages} Pages Inspected
          </p>
          {audit.affiliations?.length ? <p className="text-xs text-[#687387]">Affiliations: {audit.affiliations.join(' · ')}</p> : null}
          {(audit.corresponding_author || audit.publication_date) && <p className="text-xs text-[#687387]">{audit.corresponding_author && `Corresponding author: ${audit.corresponding_author}`}{audit.publication_date && ` · Published: ${audit.publication_date}`}</p>}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <a
            href={getReportDownloadUrl(audit.id)}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold transition-all shadow-subtle flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Official PDF Report</span>
          </a>

          <button
            onClick={() => onNavigate('pdf-viewer', audit.id)}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-stone-50 text-[#14233F] border border-[#E8E7E1] text-xs font-bold transition-all shadow-subtle flex items-center gap-2 cursor-pointer"
          >
            <SplitSquareVertical className="w-4 h-4 text-[#3268BB]" />
            <span>Interactive PDF Workspace</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-3xl border border-[#E8E7E1] shadow-subtle space-y-3">
          <h2 className="text-sm font-bold text-[#14233F]">A. Citation and Evidence Verification</h2>
          <p className="text-xs text-[#687387]">External publication checks and claim verdicts are calculated from the source records.</p>
          <div className="flex flex-wrap gap-2 text-xs font-mono"><span>{claimStats.supported} supported</span><span>{claimStats.partial} partial</span><span>{claimStats.contradicted} contradicted</span><span>{claimStats.insufficient} insufficient</span><span>{claimStats.unverified} unverified</span></div>
        </section>
        <section className="bg-white p-6 rounded-3xl border border-[#E8E7E1] shadow-subtle space-y-3">
          <h2 className="text-sm font-bold text-[#14233F]">B. Internal Document Consistency</h2>
          <p className="text-xs text-[#687387]">These findings assess the uploaded manuscript itself and do not change external evidence verdicts.</p>
          {(audit.consistency_findings || []).map(f => <article key={f.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-1"><h3 className="text-xs font-bold text-[#14233F]">{f.title}</h3><p className="text-xs text-[#565D59]">{f.explanation}</p>{f.calculation && <p className="font-mono text-[11px] text-[#3268BB]">{f.calculation}</p>}<p className="text-[11px] text-[#687387]">{f.evidence?.join(' · ')}</p></article>)}
          {!audit.consistency_findings?.length && <p className="text-xs text-[#687387]">No internal consistency findings were detected.</p>}
        </section>
      </div>
      <section className="bg-[#FAF9F5] p-5 rounded-2xl border border-[#E8E7E1]"><h2 className="text-sm font-bold text-[#14233F] mb-2">Detected Issues Summary</h2><div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#565D59]"><span>Unconfirmed references: {refStats.mismatch + refStats.unverified}</span><span>Lookup failures: {refStats.retrieval_failed}</span><span>Missing bibliography entries: {summary.reference_issues?.missing_bibliography_entries?.length || 0}</span><span>Uncited references: {summary.reference_issues?.uncited_bibliography_entries?.length || 0}</span><span>Metadata mismatches: {refStats.mismatch}</span><span>Internal inconsistencies: {audit.consistency_findings?.filter(f => f.finding_type === 'internal_contradiction' || f.finding_type === 'numerical_inconsistency').length || 0}</span><span>Unsupported generalisations: {audit.consistency_findings?.filter(f => f.finding_type === 'unsupported_generalisation').length || 0}</span><span>Claims needing review: {audit.consistency_findings?.filter(f => f.severity === 'review').length || 0}</span><span>References needing review: {refStats.needs_review || 0}</span></div></section>

      {/* 3 Overview Visualisation Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Claim Status Distribution (Interactive Recharts) */}
        <div className="bg-white p-6 rounded-3xl border border-[#E8E7E1] shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#14233F]">
              Claim Evidence Verdicts ({claimStats.total})
            </h3>
            {selectedVerdictFilter && (
              <button
                onClick={() => setSelectedVerdictFilter(null)}
                className="text-[11px] font-mono text-[#3268BB] hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={claimChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={38}
                  outerRadius={65}
                  paddingAngle={3}
                  dataKey="value"
                  onClick={(entry) => {
                    setSelectedVerdictFilter(
                      selectedVerdictFilter === entry.code ? null : entry.code
                    );
                  }}
                  cursor="pointer"
                >
                  {claimChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color} 
                      stroke={selectedVerdictFilter === entry.code ? '#14233F' : 'none'}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val: any, name: any) => [`${val} claims`, name]}
                  contentStyle={{ borderRadius: '12px', fontSize: '12px', borderColor: '#E8E7E1' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 text-xs">
            {claimChartData.map((d) => (
              <div 
                key={d.name}
                onClick={() => setSelectedVerdictFilter(selectedVerdictFilter === d.code ? null : d.code)}
                className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors ${
                  selectedVerdictFilter === d.code ? 'bg-[#FAF9F5] font-bold' : 'hover:bg-[#FAF9F5]/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-[#14233F]">{d.name}</span>
                </div>
                <span className="font-mono text-[#687387]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Reference Authenticity Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-[#E8E7E1] shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#14233F]">
              Reference Authenticity ({refStats.total})
            </h3>
            <button
              onClick={() => onNavigate('references', audit.id)}
              className="text-xs text-[#3268BB] hover:underline"
            >
              Ledger &rarr;
            </button>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={refChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#687387" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#687387" />
                <Tooltip 
                  formatter={(val: any) => [`${val} citations`, 'Count']}
                  contentStyle={{ borderRadius: '12px', fontSize: '12px', borderColor: '#E8E7E1' }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} cursor="pointer">
                  {refChartData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 text-xs text-[#687387]">
            <div className="flex justify-between">
              <span>Verified in OpenAlex/Crossref:</span>
              <strong className="text-emerald-700 font-mono">{refStats.verified}</strong>
            </div>
            <div className="flex justify-between">
              <span>Possible Matches (review):</span>
              <strong className="text-amber-700 font-mono">{refStats.possible_match}</strong>
            </div>
            <div className="flex justify-between">
              <span>Severe Metadata Mismatches:</span>
              <strong className="text-rose-700 font-mono">{refStats.mismatch}</strong>
            </div>
            <div className="flex justify-between">
              <span>Unverified / not confirmed:</span>
              <strong className="text-blue-700 font-mono">{refStats.unverified}</strong>
            </div>
          </div>
        </div>

        {/* Card 3: Evidence Availability Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-[#E8E7E1] shadow-subtle space-y-4">
          <h3 className="text-sm font-bold text-[#14233F]">
            Evidence Retrieval Depth
          </h3>

          <p className="text-xs text-[#687387] leading-relaxed">
            Transparently discloses source availability. We never infer contradiction from paywalled or unavailable literature:
          </p>

          <div className="space-y-3 pt-2">
            <div className="p-2.5 rounded-xl bg-teal-50/60 border border-teal-200 flex items-center justify-between text-xs">
              <span className="font-medium text-teal-900">Full Text Available:</span>
              <strong className="font-mono text-teal-800">{retrievalStats.full_text} sources</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 flex items-center justify-between text-xs">
              <span className="font-medium text-indigo-900">Abstract Only:</span>
              <strong className="font-mono text-indigo-800">{retrievalStats.abstract_only} sources</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center justify-between text-xs">
              <span className="font-medium text-amber-900">Metadata Only (Paywalled):</span>
              <strong className="font-mono text-amber-800">{retrievalStats.metadata_only} sources</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-between text-xs">
              <span className="font-medium text-stone-800">Source Unavailable:</span>
              <strong className="font-mono text-stone-700">{retrievalStats.unavailable} sources</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Claims Breakdown Table & Direct Actions */}
      <div className="bg-white rounded-3xl border border-[#E8E7E1] shadow-editorial p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#14233F] tracking-tight">
              Audited Claims Ledger {selectedVerdictFilter && `(Filtered: ${selectedVerdictFilter})`}
            </h2>
            <p className="text-xs text-[#687387]">
              Showing {filteredClaims.length} of {claims.length} claims extracted from manuscript
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('claims', audit.id)}
              className="px-4 py-2 bg-[#FAF9F5] hover:bg-stone-200 text-[#14233F] text-xs font-bold rounded-xl border border-[#E8E7E1] transition-colors cursor-pointer"
            >
              Open in Claim Explorer &rarr;
            </button>
          </div>
        </div>

        {/* Claims Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF9F5] text-[#687387] font-mono uppercase tracking-wider border-y border-[#E8E7E1]">
              <tr>
                <th className="py-3 px-4">Claim ID</th>
                <th className="py-3 px-4">Page</th>
                <th className="py-3 px-4">Marker</th>
                <th className="py-3 px-4">Claim Statement</th>
                <th className="py-3 px-4">Verdict</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E7E1]">
              {filteredClaims.map((claim) => (
                <tr key={claim.id} className="hover:bg-[#FAF9F5]/50 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-[#14233F]">
                    {claim.id}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#687387]">
                    p.{claim.page_number}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-[#3268BB]">
                    {claim.citation_marker || 'None'}
                  </td>
                  <td className="py-3 px-4 max-w-md font-serif text-[#14233F] line-clamp-2">
                    "{claim.claim_text}"
                  </td>
                  <td className="py-3 px-4">
                    <VerdictBadge status={claim.verdict} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onSelectClaim(claim)}
                      className="px-3 py-1 rounded-lg bg-white border border-[#E8E7E1] hover:bg-[#14233F] hover:text-white text-[#14233F] text-xs font-semibold shadow-subtle transition-all cursor-pointer"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
