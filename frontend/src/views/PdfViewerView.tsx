import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  Maximize2,
  SplitSquareVertical,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Audit, Claim, Reference } from '../types';
import { VerdictBadge, AuthenticityBadge, RetrievalBadge } from '../components/StatusBadge';
import { backendUrl, fetchAuditPage } from '../api/client';
import { signedPrivatePdfUrl } from '../lib/supabase';

interface PdfViewerViewProps {
  audit: Audit;
  claims: Claim[];
  references: Reference[];
  initialClaim?: Claim | null;
  onNavigate: (view: string) => void;
}

interface Segment {
  text: string;
  claim?: Claim;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Locates a claim inside the extracted page text.
 * PDF text has irregular line breaks, so words are matched with flexible
 * whitespace. If the sentence cannot be located we do not draw a highlight.
 */
function findClaimRange(pageText: string, claimText: string): [number, number] | null {
  const words = claimText.split(/\s+/).filter(Boolean).slice(0, 14);
  if (words.length < 4) return null;
  const pattern = words.map(escapeRegex).join('\\s+');
  try {
    const match = new RegExp(pattern, 'i').exec(pageText);
    if (!match) return null;
    return [match.index, match.index + match[0].length];
  } catch {
    return null;
  }
}

function buildSegments(pageText: string, claims: Claim[]): { segments: Segment[]; located: Set<string> } {
  const ranges: { start: number; end: number; claim: Claim }[] = [];
  const located = new Set<string>();
  claims.forEach((claim) => {
    const range = findClaimRange(pageText, claim.claim_text);
    if (!range) return;
    located.add(claim.id);
    ranges.push({ start: range[0], end: range[1], claim });
  });
  ranges.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start < cursor) return;
    if (range.start > cursor) {
      segments.push({ text: pageText.slice(cursor, range.start) });
    }
    segments.push({ text: pageText.slice(range.start, range.end), claim: range.claim });
    cursor = range.end;
  });
  if (cursor < pageText.length) segments.push({ text: pageText.slice(cursor) });
  return { segments, located };
}

const highlightClass = (verdict: string) => {
  switch (verdict) {
    case 'SUPPORTED':
      return 'bg-emerald-100/90 border-b-2 border-emerald-400';
    case 'PARTIALLY_SUPPORTED':
      return 'bg-amber-100/90 border-b-2 border-amber-400';
    case 'CONTRADICTED':
      return 'bg-rose-100/90 border-b-2 border-rose-400';
    case 'INSUFFICIENT_EVIDENCE':
      return 'bg-slate-200/90 border-b-2 border-slate-400';
    default:
      return 'bg-blue-100/90 border-b-2 border-blue-400';
  }
};

export const PdfViewerView: React.FC<PdfViewerViewProps> = ({
  audit,
  claims,
  references,
  initialClaim,
  onNavigate,
}) => {
  const totalPages = Math.max(
    audit.total_pages || 1,
    ...claims.map((c) => c.page_number),
    1,
  );
  const [currentPage, setCurrentPage] = useState<number>(initialClaim?.page_number || 1);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(
    initialClaim || (claims.length > 0 ? claims[0] : null),
  );
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [viewerMode, setViewerMode] = useState<'annotated' | 'native'>('annotated');
  const [pageText, setPageText] = useState('');
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [privatePdfUrl, setPrivatePdfUrl] = useState('');
  const [privatePdfError, setPrivatePdfError] = useState('');

  const refMap = useMemo(() => new Map(references.map((r) => [r.id, r])), [references]);
  const claimsOnCurrentPage = useMemo(
    () => claims.filter((c) => c.page_number === currentPage),
    [claims, currentPage],
  );

  useEffect(() => {
    let active = true;
    setPrivatePdfUrl('');
    setPrivatePdfError('');
    if (audit.storage_path) {
      signedPrivatePdfUrl(audit.storage_path)
        .then((url) => { if (active) setPrivatePdfUrl(url); })
        .catch((error) => { if (active) setPrivatePdfError(error.message || 'Could not open private PDF.'); });
    }
    return () => { active = false; };
  }, [audit.id, audit.storage_path]);

  useEffect(() => {
    if (initialClaim) {
      setSelectedClaim(initialClaim);
      setCurrentPage(initialClaim.page_number);
    }
  }, [initialClaim]);

  useEffect(() => {
    let active = true;
    setPageLoading(true);
    setPageError(null);
    fetchAuditPage(audit.id, currentPage)
      .then((data) => {
        if (!active) return;
        setPageText(data.text || '');
      })
      .catch((err) => {
        if (!active) return;
        setPageError(err.message || 'This page could not be read from the PDF.');
        setPageText('');
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [audit.id, currentPage]);

  const { segments, located } = useMemo(
    () => buildSegments(pageText, claimsOnCurrentPage),
    [pageText, claimsOnCurrentPage],
  );

  const handleClaimSelect = (claim: Claim) => {
    setSelectedClaim(claim);
    if (claim.page_number !== currentPage) {
      setCurrentPage(claim.page_number);
    }
  };

  const selectedRef = selectedClaim?.reference_id
    ? refMap.get(selectedClaim.reference_id)
    : undefined;
  const pdfUrl = audit.storage_path ? privatePdfUrl : backendUrl(`/${audit.pdf_path}`);
  const unlocated = claimsOnCurrentPage.filter((c) => !located.has(c.id));

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen bg-[#FAF9F5] font-sans overflow-hidden">
      {/* Toolbar */}
      <div className="min-h-14 border-b border-[#E8E7E1] bg-white px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onNavigate('results')}
            className="text-[11px] font-semibold text-[#687387] hover:text-[#14233F] flex items-center gap-1 shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Results
          </button>
          <div className="h-4 w-px bg-[#E8E7E1]" />
          <h2 className="text-[11.5px] sm:text-xs font-bold text-[#14233F] truncate max-w-[220px] sm:max-w-sm">
            {audit.title || audit.filename}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center bg-[#FAF9F5] rounded-lg border border-[#E8E7E1] p-0.5 text-[11px] font-mono">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded hover:bg-white disabled:opacity-30"
              title="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-semibold whitespace-nowrap">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded hover:bg-white disabled:opacity-30"
              title="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="hidden sm:flex items-center bg-[#FAF9F5] rounded-lg border border-[#E8E7E1] p-0.5 text-[11px]">
            <button
              onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
              className="p-1 rounded hover:bg-white"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 font-mono">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
              className="p-1 rounded hover:bg-white"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center bg-[#FAF9F5] p-0.5 rounded-lg border border-[#E8E7E1] text-[10.5px] font-medium">
            <button
              onClick={() => setViewerMode('annotated')}
              className={`px-2 py-1 rounded-md transition-all ${
                viewerMode === 'annotated' ? 'bg-white text-[#14233F] font-semibold shadow-sm' : 'text-[#687387]'
              }`}
            >
              Evidence text
            </button>
            <button
              onClick={() => setViewerMode('native')}
              className={`px-2 py-1 rounded-md transition-all ${
                viewerMode === 'native' ? 'bg-white text-[#14233F] font-semibold shadow-sm' : 'text-[#687387]'
              }`}
            >
              Original PDF
            </button>
          </div>
        </div>

        <div className="text-[10px] font-mono text-[#687387] hidden md:block">
          {claimsOnCurrentPage.length} claim(s) · {located.size} highlighted
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: document */}
        <div className="flex-1 bg-[#E8E7E1]/40 p-3 sm:p-5 overflow-y-auto">
          {viewerMode === 'native' ? (
            <div className="w-full h-full min-h-[520px] bg-white rounded-2xl shadow-editorial overflow-hidden border border-[#E8E7E1]">
              {audit.storage_path && !privatePdfUrl ? (
                <div className="grid h-full min-h-[520px] place-items-center p-6 text-center text-sm text-[#687387]">{privatePdfError || 'Opening your private PDF…'}</div>
              ) : (
                <iframe src={`${pdfUrl}#page=${currentPage}`} className="w-full h-full min-h-[520px] border-0" title="Original PDF document" />
              )}
            </div>
          ) : (
            <div
              className="bg-white rounded-xl shadow-editorial border border-[#E8E7E1] px-6 sm:px-10 py-8 w-full max-w-3xl mx-auto min-h-[560px]"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-[#687387] border-b border-[#E8E7E1] pb-2 mb-4">
                <span>Page {currentPage} · extracted text layer</span>
                <span>Click a highlighted passage to inspect evidence</span>
              </div>

              {pageLoading ? (
                <div className="py-16 text-center text-xs text-[#687387] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading page…
                </div>
              ) : pageError ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {pageError}
                </div>
              ) : segments.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <FileText className="w-7 h-7 text-[#687387] opacity-40 mx-auto" />
                  <p className="text-xs font-semibold text-[#14233F]">No text layer on this page</p>
                  <p className="text-[11px] text-[#687387] max-w-xs mx-auto">
                    This page may be scanned imagery without OCR. Use the Original PDF view.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[12.5px] leading-[1.85] font-serif text-[#1F2E2B] whitespace-pre-wrap break-words">
                    {segments.map((segment, idx) =>
                      segment.claim ? (
                        <mark
                          key={`seg-${idx}`}
                          onClick={() => handleClaimSelect(segment.claim as Claim)}
                          title={`${segment.claim.id} — ${segment.claim.verdict.replace(/_/g, ' ').toLowerCase()}`}
                          className={`cursor-pointer rounded-[2px] px-0.5 text-[#14233F] transition-colors ${
                            selectedClaim?.id === segment.claim.id
                              ? 'ring-2 ring-[#3268BB] ring-offset-1'
                              : ''
                          } ${highlightClass(segment.claim.verdict)}`}
                        >
                          {segment.text}
                        </mark>
                      ) : (
                        <span key={`seg-${idx}`}>{segment.text}</span>
                      ),
                    )}
                  </p>

                  {unlocated.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-[#E8E7E1] space-y-2">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#687387]">
                        Claims on this page without a reliable text match
                      </div>
                      <p className="text-[10.5px] text-[#687387] leading-relaxed">
                        CiteVerify does not draw a highlight when the exact text span cannot be
                        located in the extracted layer. Inspect these claims in the panel:
                      </p>
                      {unlocated.map((claim) => (
                        <button
                          key={claim.id}
                          onClick={() => handleClaimSelect(claim)}
                          className="block w-full text-left p-2 rounded-lg border border-[#E8E7E1] hover:border-[#3268BB] text-[11px]"
                        >
                          <span className="font-mono text-[9.5px] text-[#687387] mr-1">{claim.id}</span>
                          {claim.claim_text.slice(0, 160)}
                          {claim.claim_text.length > 160 ? '…' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: evidence panel */}
        <div className="w-full lg:w-[420px] bg-white border-t lg:border-t-0 lg:border-l border-[#E8E7E1] flex flex-col overflow-y-auto z-10 shadow-editorial shrink-0">
          {selectedClaim ? (
            <div className="p-5 space-y-5">
              <div className="pb-3 border-b border-[#E8E7E1] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#3268BB] font-bold">
                    Evidence inspection
                  </span>
                  <span className="text-[10px] font-mono text-[#687387]">
                    Page {selectedClaim.page_number}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <VerdictBadge status={selectedClaim.verdict} size="md" />
                  {selectedRef && <AuthenticityBadge status={selectedRef.authenticity_status} size="sm" />}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-[#687387]">
                  <span className="px-1.5 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1]">
                    {selectedClaim.id}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1]">
                    {selectedClaim.citation_marker
                      ? `Citation ${selectedClaim.citation_marker}`
                      : 'Citation not detected'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded border ${
                      selectedClaim.mapping_status?.toUpperCase() === 'MAPPED'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : selectedClaim.mapping_status?.toUpperCase() === 'AMBIGUOUS'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-stone-100 text-stone-600 border-stone-200'
                    }`}
                  >
                    {selectedClaim.mapping_status?.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-[#687387] font-semibold">
                  Manuscript claim
                </span>
                <p className="text-[12px] font-serif text-[#14233F] italic leading-relaxed bg-[#FAF9F5] p-3 rounded-xl border border-[#E8E7E1]">
                  “{selectedClaim.claim_text}”
                </p>
                {selectedClaim.mapping_note && (
                  <p className="text-[10px] text-[#687387] leading-relaxed">
                    {selectedClaim.mapping_note}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-[#14233F] font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-[#3268BB]" />
                  Verification finding
                </span>
                <p className="text-[11px] text-[#14233F] leading-relaxed bg-white p-3 rounded-xl border border-[#E8E7E1]">
                  {selectedClaim.verdict_explanation}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase text-emerald-800 font-semibold flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3 text-emerald-600" />
                    Retrieved source text
                  </span>
                  {selectedClaim.retrieval_level && (
                    <RetrievalBadge level={selectedClaim.retrieval_level} />
                  )}
                </div>
                {selectedClaim.evidence_passage ? (
                  <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 text-[11px] font-serif italic text-emerald-950 leading-relaxed">
                    “{selectedClaim.evidence_passage}”
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1] text-[10.5px] text-[#687387] flex items-start gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    No original source text was retrievable for this claim, so no support verdict
                    was issued.
                  </div>
                )}
                {selectedClaim.evidence_source && (
                  <p className="text-[9.5px] font-mono text-[#687387]">
                    Source: {selectedClaim.evidence_source}
                  </p>
                )}
              </div>

              {selectedRef ? (
                <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1] space-y-1.5">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#687387] font-bold">
                    Cited publication
                  </span>
                  <h4 className="text-[11.5px] font-bold text-[#14233F] leading-snug">
                    {selectedRef.title || selectedRef.raw_citation}
                  </h4>
                  <p className="text-[10px] text-[#687387] font-serif">
                    {selectedRef.authors} ({selectedRef.year})
                    {selectedRef.journal ? ` · ${selectedRef.journal}` : ''}
                  </p>
                  {selectedRef.url && (
                    <a
                      href={selectedRef.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10.5px] text-[#3268BB] font-semibold hover:underline pt-0.5"
                    >
                      Open publisher record <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-[10.5px] text-blue-900 leading-relaxed">
                  No bibliography entry is mapped to this statement. The claim remains unverified
                  rather than contradicted.
                </div>
              )}

              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-[10px] text-amber-900 leading-relaxed">
                <b>Uncertainty.</b> {selectedClaim.uncertainty_note || 'No additional uncertainty note was recorded.'}
              </div>

              <div className="pt-3 border-t border-[#E8E7E1] space-y-2">
                <span className="text-[10px] font-mono text-[#687387] uppercase tracking-wider">
                  All claims ({claims.length})
                </span>
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                  {claims.map((claim) => (
                    <button
                      key={claim.id}
                      onClick={() => handleClaimSelect(claim)}
                      className={`w-full text-left p-2 rounded-lg text-[10.5px] transition-colors flex items-center justify-between gap-2 ${
                        selectedClaim.id === claim.id
                          ? 'bg-[#14233F] text-white font-semibold'
                          : 'bg-[#FAF9F5] hover:bg-stone-200 text-[#14233F]'
                      }`}
                    >
                      <span className="truncate flex-1">
                        {claim.id}: {claim.claim_text.slice(0, 44)}
                      </span>
                      <span className="text-[9px] font-mono shrink-0">p.{claim.page_number}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-[#687387] font-serif italic space-y-2">
              <Layers className="w-7 h-7 mx-auto opacity-40" />
              <p className="text-xs">
                Select a highlighted passage to inspect its evidence.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
