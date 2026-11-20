import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  ArrowUpDown, 
  FileText, 
  Eye, 
  ExternalLink,
  BookOpen,
  ArrowRight,
  SplitSquareVertical
} from 'lucide-react';
import { Claim, Reference, VerdictStatus } from '../types';
import { VerdictBadge, AuthenticityBadge, RetrievalBadge } from '../components/StatusBadge';

interface ClaimExplorerViewProps {
  claims: Claim[];
  references: Reference[];
  onSelectClaim: (claim: Claim) => void;
  onOpenPdfViewer: (claim: Claim) => void;
  initialFilter?: string | null;
}

export const ClaimExplorerView: React.FC<ClaimExplorerViewProps> = ({
  claims,
  references,
  onSelectClaim,
  onOpenPdfViewer,
  initialFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter || 'ALL');
  const [pageFilter, setPageFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'page' | 'verdict' | 'confidence'>('page');
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);

  const refMap = useMemo(() => {
    return new Map(references.map((r) => [r.id, r]));
  }, [references]);

  // Extract unique pages
  const uniquePages = useMemo(() => {
    const pages = Array.from(new Set(claims.map((c) => c.page_number))).sort((a, b) => a - b);
    return pages;
  }, [claims]);

  // Filter and sort claims
  const filteredClaims = useMemo(() => {
    return claims
      .filter((c) => {
        // Search filter
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const matchText = c.claim_text.toLowerCase().includes(term);
          const matchMarker = c.citation_marker.toLowerCase().includes(term);
          const matchExpl = c.verdict_explanation.toLowerCase().includes(term);
          if (!matchText && !matchMarker && !matchExpl) return false;
        }

        // Status filter
        if (statusFilter !== 'ALL' && c.verdict !== statusFilter) {
          return false;
        }

        // Page filter
        if (pageFilter !== 'ALL' && c.page_number.toString() !== pageFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'page') return a.page_number - b.page_number;
        if (sortBy === 'confidence') return b.confidence - a.confidence;
        if (sortBy === 'verdict') return a.verdict.localeCompare(b.verdict);
        return 0;
      });
  }, [claims, searchTerm, statusFilter, pageFilter, sortBy]);

  const filterButtons: { label: string; value: string; count: number }[] = [
    { label: 'All Claims', value: 'ALL', count: claims.length },
    { label: 'Supported', value: 'SUPPORTED', count: claims.filter((c) => c.verdict === 'SUPPORTED').length },
    { label: 'Partially Supported', value: 'PARTIALLY_SUPPORTED', count: claims.filter((c) => c.verdict === 'PARTIALLY_SUPPORTED').length },
    { label: 'Contradicted', value: 'CONTRADICTED', count: claims.filter((c) => c.verdict === 'CONTRADICTED').length },
    { label: 'Insufficient Evidence', value: 'INSUFFICIENT_EVIDENCE', count: claims.filter((c) => c.verdict === 'INSUFFICIENT_EVIDENCE').length },
    { label: 'Unverified', value: 'UNVERIFIED', count: claims.filter((c) => c.verdict === 'UNVERIFIED').length },
  ];

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8E7E1]">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
            Interactive Claim Ledger
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
            Claim Explorer & Evidence Alignment
          </h1>
          <p className="text-sm text-[#687387] mt-1">
            Search, filter, and inspect empirical assertions extracted from the uploaded research paper.
          </p>
        </div>

        <div className="text-xs font-mono text-[#687387] bg-white px-3.5 py-2 rounded-xl border border-[#E8E7E1] shadow-subtle shrink-0">
          Showing <strong className="text-[#14233F]">{filteredClaims.length}</strong> of {claims.length} claims
        </div>
      </div>

      {/* Filter and Search Control Bar */}
      <div className="space-y-4 bg-white p-5 rounded-2xl border border-[#E8E7E1] shadow-subtle">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E8E7E1] pb-3">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setStatusFilter(btn.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                statusFilter === btn.value
                  ? 'bg-[#14233F] text-white shadow-sm'
                  : 'text-[#687387] hover:bg-[#FAF9F5] hover:text-[#14233F]'
              }`}
            >
              <span>{btn.label}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                statusFilter === btn.value ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-700'
              }`}>
                {btn.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search, Page, and Sort Row */}
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#687387] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search claims by keyword, citation marker [1], or finding..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#E8E7E1] bg-[#FAF9F5]/50 focus:bg-white focus:border-[#3268BB] outline-none transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-[#687387] hover:text-[#14233F] absolute right-3 top-1/2 -translate-y-1/2 font-mono"
              >
                Clear
              </button>
            )}
          </div>

          {/* Page Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs text-[#687387] whitespace-nowrap">Page:</span>
            <select
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl border border-[#E8E7E1] bg-white outline-none cursor-pointer"
            >
              <option value="ALL">All Pages</option>
              {uniquePages.map((p) => (
                <option key={p} value={p.toString()}>
                  Page {p}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs text-[#687387] whitespace-nowrap">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs px-3 py-2 rounded-xl border border-[#E8E7E1] bg-white outline-none cursor-pointer font-medium"
            >
              <option value="page">Page Order</option>
              <option value="verdict">Evidence Verdict</option>
              <option value="confidence">Extraction Confidence</option>
            </select>
          </div>
        </div>
      </div>

      {/* Claims List */}
      <div className="space-y-3">
        {filteredClaims.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white border border-[#E8E7E1] space-y-2">
            <FileText className="w-8 h-8 text-[#687387] mx-auto opacity-40" />
            <h3 className="text-sm font-bold text-[#14233F]">No claims match your filter criteria</h3>
            <p className="text-xs text-[#687387]">Try selecting a different status filter or clearing your search term.</p>
          </div>
        ) : (
          filteredClaims.map((claim) => {
            const isExpanded = expandedClaimId === claim.id;
            const ref = claim.reference_id ? refMap.get(claim.reference_id) : undefined;

            return (
              <div
                key={claim.id}
                className="p-5 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle hover:border-[#3268BB] transition-all space-y-3"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-[#14233F] bg-[#FAF9F5] px-2 py-0.5 rounded border border-[#E8E7E1]">
                      {claim.id}
                    </span>
                    <span className="text-xs font-mono text-[#687387]">
                      Page {claim.page_number}
                    </span>
                    {claim.citation_marker ? (
                      <span className="text-xs font-mono font-bold text-[#3268BB] bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        Citation: {claim.citation_marker}
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-[#687387] bg-stone-100 border border-stone-200 px-2 py-0.5 rounded">
                        Citation not detected
                      </span>
                    )}
                    {(claim.all_markers?.length || 0) > 1 && (
                      <span className="text-[10px] font-mono text-[#687387] bg-white border border-[#E8E7E1] px-1.5 py-0.5 rounded">
                        {claim.all_markers?.length} citations
                      </span>
                    )}
                    {claim.mapping_status && (
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                        claim.mapping_status.toUpperCase() === 'MAPPED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : claim.mapping_status.toUpperCase() === 'AMBIGUOUS'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-stone-100 text-stone-500 border-stone-200'
                      }`}>
                        {claim.mapping_status.toUpperCase()}
                      </span>
                    )}
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#687387] px-2 py-0.5 rounded bg-stone-100">
                      {claim.claim_type}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <VerdictBadge status={claim.verdict} size="sm" />
                    {ref && <AuthenticityBadge status={ref.authenticity_status} size="sm" />}
                  </div>
                </div>

                {/* Claim Text */}
                <p className="text-sm text-[#14233F] font-serif leading-relaxed italic">
                  "{claim.claim_text}"
                </p>

                {/* Explanation Summary */}
                <div className="text-xs text-[#687387] flex items-start gap-2 bg-[#FAF9F5] p-3 rounded-xl border border-[#E8E7E1]">
                  <strong className="text-[#14233F] font-sans font-semibold shrink-0">
                    Finding:
                  </strong>
                  <span className="leading-relaxed">
                    {claim.verdict_explanation}
                  </span>
                </div>

                {/* Expandable Section: Context, Evidence Passage, and Reference Details */}
                {isExpanded && (
                  <div className="pt-3 border-t border-[#E8E7E1] space-y-3 text-xs">
                    {/* Retrieved Evidence */}
                    <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-1">
                      <div className="font-sans font-bold text-[11px] text-emerald-900 uppercase tracking-wider flex items-center justify-between">
                        <span>Retrieved Original Research Passage</span>
                        {claim.retrieval_level && <RetrievalBadge level={claim.retrieval_level} />}
                      </div>
                      <p className="font-serif italic text-emerald-950 leading-relaxed">
                        "{claim.evidence_passage || 'No excerpt available.'}"
                      </p>
                    </div>

                    {/* Full Context in Paper */}
                    <div className="p-3 rounded-xl bg-white border border-[#E8E7E1] text-[#687387] space-y-1">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-[#14233F] font-semibold">
                        Surrounding Manuscript Context:
                      </span>
                      <p className="font-serif italic text-stone-700">
                        "...{claim.context}..."
                      </p>
                    </div>

                    {/* Associated Reference Details */}
                    {ref && (
                      <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#14233F]">
                            {ref.title || 'Untitled Reference'}
                          </div>
                          <div className="text-[#687387] text-[11px]">
                            {ref.authors} ({ref.year}) &bull; {ref.journal}
                          </div>
                        </div>

                        {ref.url && (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#3268BB] hover:underline flex items-center gap-1 shrink-0 text-xs font-mono font-medium"
                          >
                            <span>Open DOI record</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setExpandedClaimId(isExpanded ? null : claim.id)}
                    className="text-xs font-semibold text-[#3268BB] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{isExpanded ? 'Hide evidence details' : 'Show evidence passage & context'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenPdfViewer(claim)}
                      title="Inspect this claim in the split-screen PDF workspace"
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E1] hover:bg-stone-50 text-[#14233F] text-xs font-semibold shadow-subtle flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <SplitSquareVertical className="w-3.5 h-3.5 text-[#3268BB]" />
                      <span>View in PDF</span>
                    </button>

                    <button
                      onClick={() => onSelectClaim(claim)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-subtle cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Full Inspection</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
