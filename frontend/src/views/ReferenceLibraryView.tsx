import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ExternalLink, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
    Globe,
  FileText,
  BookMarked,
  Compass
} from 'lucide-react';
import { Reference, AuthenticityStatus } from '../types';
import { AuthenticityBadge, RetrievalBadge } from '../components/StatusBadge';

interface ReferenceLibraryViewProps {
  references: Reference[];
  auditTitle?: string;
  diagnostics?: {
    total_detected: number;
    successfully_parsed: number;
    manual_review_needed: number;
  };
  onNavigate: (view: string) => void;
  onExploreResearch?: (reference: Reference) => void;
}

export const ReferenceLibraryView: React.FC<ReferenceLibraryViewProps> = ({
  references,
  auditTitle,
  diagnostics,
  onNavigate,
  onExploreResearch,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'id' | 'year' | 'title'>('id');
  const [expandedRefId, setExpandedRefId] = useState<string | null>(null);

  const filteredRefs = useMemo(() => {
    return references
      .filter((r) => {
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const matchTitle = (r.title || '').toLowerCase().includes(term);
          const matchAuthor = (r.authors || '').toLowerCase().includes(term);
          const matchRaw = (r.raw_citation || '').toLowerCase().includes(term);
          const matchDoi = (r.doi || '').toLowerCase().includes(term);
          if (!matchTitle && !matchAuthor && !matchRaw && !matchDoi) return false;
        }

        if (statusFilter !== 'ALL' && r.authenticity_status !== statusFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'year') return (b.year || '').localeCompare(a.year || '');
        if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
        return a.id.localeCompare(b.id, undefined, { numeric: true });
      });
  }, [references, searchTerm, statusFilter, sortBy]);

  const filterButtons = [
    { label: 'All References', value: 'ALL', count: references.length },
    { label: 'Verified', value: 'VERIFIED', count: references.filter(r => r.authenticity_status === 'VERIFIED').length },
    { label: 'Possible Match', value: 'POSSIBLE_MATCH', count: references.filter(r => r.authenticity_status === 'POSSIBLE_MATCH').length },
    { label: 'Mismatch', value: 'MISMATCH', count: references.filter(r => r.authenticity_status === 'MISMATCH').length },
    { label: 'Unverified', value: 'UNVERIFIED', count: references.filter(r => r.authenticity_status === 'UNVERIFIED').length },
  ];

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8E7E1]">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
            Scholarly Authenticity Registry
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
            Reference Library & Integrity Ledger
          </h1>
          <p className="text-sm text-[#687387] mt-1">
            Auditing bibliography citations against OpenAlex and Crossref academic indices for publication existence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {diagnostics && (
            <div className="flex items-center gap-3 bg-[#FAF9F5] px-4 py-2 rounded-xl border border-[#E8E7E1] text-xs font-mono">
              <span className="text-[#14233F]">
                Detected: <strong className="font-bold">{diagnostics.total_detected}</strong>
              </span>
              <span className="text-stone-300">&bull;</span>
              <span className="text-emerald-700">
                Parsed: <strong className="font-bold">{diagnostics.successfully_parsed}</strong>
              </span>
              <span className="text-stone-300">&bull;</span>
              <span className="text-amber-700">
                Review Needed: <strong className="font-bold">{diagnostics.manual_review_needed}</strong>
              </span>
            </div>
          )}
          <div className="text-xs font-mono text-[#687387] bg-white px-3.5 py-2 rounded-xl border border-[#E8E7E1] shadow-subtle shrink-0">
            Total Citations: <strong className="text-[#14233F]">{references.length}</strong>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="bg-white p-5 rounded-2xl border border-[#E8E7E1] shadow-subtle space-y-4">
        {/* Status Tabs */}
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

        {/* Search & Sort */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#687387] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reference by title, author name, DOI, or journal..."
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

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-[#687387] whitespace-nowrap">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs px-3 py-2 rounded-xl border border-[#E8E7E1] bg-white outline-none cursor-pointer font-medium"
            >
              <option value="id">Citation Order</option>
              <option value="year">Publication Year</option>
              <option value="title">Title Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reference Cards / Rows */}
      <div className="space-y-3">
        {filteredRefs.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white border border-[#E8E7E1] space-y-2">
            <BookMarked className="w-8 h-8 text-[#687387] mx-auto opacity-40" />
            <h3 className="text-sm font-bold text-[#14233F]">No references found matching criteria</h3>
            <p className="text-xs text-[#687387]">Try selecting a different authenticity filter or clearing search.</p>
          </div>
        ) : (
          filteredRefs.map((ref) => {
            const isExpanded = expandedRefId === ref.id;
            const isMismatch = ref.authenticity_status === 'MISMATCH';
            const isUnverified = ref.authenticity_status === 'UNVERIFIED';

            return (
              <div
                key={ref.id}
                className={`p-5 rounded-2xl bg-white border shadow-subtle transition-all space-y-3 ${
                  isMismatch
                    ? 'border-rose-300 hover:border-rose-500'
                    : isUnverified
                    ? 'border-blue-200 hover:border-blue-400'
                    : 'border-[#E8E7E1] hover:border-[#3268BB]'
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-[#14233F] bg-[#FAF9F5] px-2 py-0.5 rounded border border-[#E8E7E1]">
                      {ref.id}
                    </span>
                    {ref.year && (
                      <span className="text-xs font-mono text-[#687387]">
                        Year: {ref.year}
                      </span>
                    )}
                    {ref.doi && (
                      <span className="text-xs font-mono text-stone-500 hidden sm:inline">
                        DOI: {ref.doi}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <AuthenticityBadge status={ref.authenticity_status} size="sm" />
                    {ref.retrieval_level && <RetrievalBadge level={ref.retrieval_level} />}
                  </div>
                </div>

                {/* Publication Title & Authors */}
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#14233F] leading-snug">
                    {ref.title || ref.raw_citation}
                  </h3>
                  <p className="text-xs text-[#687387] mt-1 font-serif">
                    Authors: <span className="text-stone-800 font-medium">{ref.authors || 'Unknown'}</span> &bull; {ref.journal}
                  </p>
                </div>

                {/* Authenticity Explanation Box */}
                <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  isMismatch
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : isUnverified
                    ? 'bg-blue-50 border-blue-200 text-blue-900'
                    : 'bg-[#FAF9F5] border-[#E8E7E1] text-[#687387]'
                }`}>
                  <strong className="text-[#14233F] font-sans font-semibold">
                    Registry Cross-Check:
                  </strong>{' '}
                  {ref.authenticity_reason || 'Verified match in scholarly index.'}
                </div>

                {/* Expandable Section: Metadata Comparison (Cited vs Matched in Crossref/OpenAlex) */}
                {isExpanded && (
                  <div className="pt-3 border-t border-[#E8E7E1] space-y-3 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left: Cited in Manuscript */}
                      <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1] space-y-1.5">
                        <span className="font-mono text-[11px] font-bold uppercase text-[#687387]">
                          A &bull; As Cited in Manuscript:
                        </span>
                        <p className="font-serif italic text-[#14233F]">
                          "{ref.raw_citation}"
                        </p>
                      </div>

                      {/* Right: Matched in Academic Index */}
                      <div className="p-4 rounded-xl bg-white border border-[#E8E7E1] space-y-1.5">
                        <span className="font-mono text-[11px] font-bold uppercase text-[#63A982]">
                          B &bull; Matched in {ref.matched_source || 'Scholarly Registry'}:
                        </span>
                        {ref.matched_title ? (
                          <div className="space-y-1 text-[#14233F]">
                            <div className="font-bold">{ref.matched_title}</div>
                            <div className="text-xs text-[#687387]">
                              Authors: {ref.matched_authors} ({ref.matched_year})
                            </div>
                            {ref.doi && <div className="font-mono text-[11px]">DOI: {ref.doi}</div>}
                          </div>
                        ) : (
                          <p className="text-stone-500 italic">
                            No corresponding record retrieved from OpenAlex or Crossref.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Abstract snippet if retrieved */}
                    {ref.abstract && (
                      <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-1">
                        <span className="font-mono text-[11px] font-bold uppercase text-emerald-900">
                          Retrieved Abstract Excerpt:
                        </span>
                        <p className="font-serif italic text-emerald-950 leading-relaxed">
                          "{ref.abstract}"
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom Row: Actions */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setExpandedRefId(isExpanded ? null : ref.id)}
                    className="text-xs font-semibold text-[#3268BB] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{isExpanded ? 'Hide metadata comparison' : 'Inspect metadata comparison'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {onExploreResearch && (ref.paper_id || ref.doi || ref.matched_doi) && (
                      <button
                        onClick={() => onExploreResearch(ref)}
                        title="Use this publication as a seed in Research Discovery"
                        className="px-3.5 py-1.5 rounded-lg bg-[#FFF3D8] hover:bg-[#cbe665] text-xs font-bold text-[#14233F] flex items-center gap-1.5 transition-colors"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        Explore Related Research
                      </button>
                    )}
                    {ref.url && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 rounded-lg bg-white border border-[#E8E7E1] hover:bg-stone-50 text-xs font-semibold text-[#14233F] shadow-subtle flex items-center gap-1.5 transition-colors"
                      >
                        <span>Open Publication (DOI)</span>
                        <ExternalLink className="w-3.5 h-3.5 text-[#3268BB]" />
                      </a>
                    )}
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
