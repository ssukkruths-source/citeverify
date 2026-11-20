import React, { useState } from 'react';
import { 
  X, 
  ExternalLink, 
  SplitSquareVertical, 
  FileCheck2, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  BookOpen, 
  Globe, 
  ShieldCheck,
  Scale,
  ArrowRight
} from 'lucide-react';
import { Claim, Reference } from '../types';
import { VerdictBadge, AuthenticityBadge, RetrievalBadge } from '../components/StatusBadge';
import { submitClaimFeedback } from '../api/client';

interface ClaimDetailModalProps {
  claim: Claim | null;
  reference?: Reference;
  onClose: () => void;
  onOpenInPdf: (claim: Claim) => void;
  onExploreResearch?: (reference: Reference) => void;
  onFeedbackSaved?: (verdict: Claim['verdict'], explanation: string) => void;
}

export const ClaimDetailModal: React.FC<ClaimDetailModalProps> = ({
  claim,
  reference,
  onClose,
  onOpenInPdf,
  onExploreResearch,
  onFeedbackSaved,
}) => {
  const [reviewVerdict, setReviewVerdict] = useState<Claim['verdict']>(claim?.verdict || 'UNVERIFIED');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewState, setReviewState] = useState('');
  const [learnedSuggestion, setLearnedSuggestion] = useState<Claim['verdict'] | null>(null);
  const [learnedConfidence, setLearnedConfidence] = useState<number | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  if (!claim) return null;

  const saveReview = async () => {
    setSavingReview(true);
    setReviewState('');
    try {
      const result = await submitClaimFeedback(claim.audit_id, claim.id, reviewVerdict, reviewNote);
      setLearnedSuggestion(result.suggestion?.verdict || null);
      setLearnedConfidence(result.suggestion?.confidence ?? null);
      const explanation = `Reviewer adjudication: ${reviewNote.trim() || `Verdict confirmed as ${reviewVerdict.replace(/_/g, ' ').toLowerCase()}.`}`;
      onFeedbackSaved?.(result.saved_verdict, explanation);
      setReviewState(`${result.learning.training_examples} labeled example${result.learning.training_examples === 1 ? '' : 's'} saved. ${result.learning.message}`);
    } catch (error) {
      setReviewState(error instanceof Error ? error.message : 'Could not save reviewer label.');
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#14233F]/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div 
        className="bg-white w-full max-w-3xl rounded-3xl border border-[#E8E7E1] shadow-floating overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-6 border-b border-[#E8E7E1] bg-[#FAF9F5] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold text-white bg-[#14233F] px-2.5 py-1 rounded-lg">
              {claim.id}
            </span>
            <span className="text-xs font-mono text-[#687387]">
              Page {claim.page_number}
            </span>
            {claim.citation_marker ? (
              <span className="text-xs font-mono text-[#3268BB] font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                Citation: {claim.citation_marker}
                {(claim.all_markers?.length || 0) > 1 ? ` +${(claim.all_markers?.length || 1) - 1}` : ''}
              </span>
            ) : (
              <span className="text-[11px] font-mono text-[#687387] bg-stone-100 border border-stone-200 px-2 py-0.5 rounded">
                Citation not detected
              </span>
            )}
            {claim.mapping_status && (
              <span className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded border ${
                claim.mapping_status.toUpperCase() === 'MAPPED'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : claim.mapping_status.toUpperCase() === 'AMBIGUOUS'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-stone-100 text-stone-600 border-stone-200'
              }`}>
                {claim.mapping_status.toUpperCase()}
                {claim.mapping_method && claim.mapping_method !== 'none' ? ` (${claim.mapping_method.replace('_', ' ')})` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenInPdf(claim);
              }}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E1] hover:bg-stone-50 text-xs font-semibold text-[#14233F] shadow-subtle flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <SplitSquareVertical className="w-3.5 h-3.5 text-[#3268BB]" />
              <span>Inspect in PDF Workspace</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#687387] hover:text-[#14233F] hover:bg-stone-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Section 1: Original Claim in Paper */}
          <div className="space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
              01 &bull; Original Extracted Claim Text
            </span>
            <div className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#E8E7E1]">
              <p className="text-base text-[#14233F] font-serif leading-relaxed italic">
                "{claim.claim_text}"
              </p>
              <div className="mt-3 pt-3 border-t border-[#E8E7E1] text-xs text-[#687387]">
                <strong className="text-[#14233F] font-sans font-semibold">Manuscript Context:</strong>
                <p className="mt-0.5 font-serif italic text-stone-600">
                  "...{claim.context}..."
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#EAF1FC]/60 border border-[#D5E2F6] space-y-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#14233F]">Improve future reviews</h4>
                <p className="text-xs text-[#687387] mt-1">Your adjudication is stored as a labeled example. Learned suggestions never replace the evidence verdict.</p>
              </div>
              <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
                <select value={reviewVerdict} onChange={(e) => setReviewVerdict(e.target.value as Claim['verdict'])} className="min-w-0 rounded-lg border border-[#E8E7E1] bg-white px-3 py-2 text-xs text-[#14233F]">
                  <option value="SUPPORTED">Supported</option>
                  <option value="PARTIALLY_SUPPORTED">Partially Supported</option>
                  <option value="CONTRADICTED">Contradicted</option>
                  <option value="INSUFFICIENT_EVIDENCE">Insufficient Evidence</option>
                  <option value="UNVERIFIED">Unverified</option>
                </select>
                <input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Optional reason for the correction" className="min-w-0 rounded-lg border border-[#E8E7E1] bg-white px-3 py-2 text-xs text-[#14233F]" />
                <button disabled={savingReview} onClick={saveReview} className="rounded-lg bg-[#3268BB] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{savingReview ? 'Saving…' : 'Save label'}</button>
              </div>
              {(learnedSuggestion || claim.learned_suggestion) && <p className="text-xs text-[#3268BB]">Reviewer-trained suggestion: <strong>{(learnedSuggestion || claim.learned_suggestion)!.replace(/_/g, ' ')}</strong> ({Math.round(((learnedConfidence ?? claim.learned_confidence) || 0) * 100)}% model confidence)</p>}
              {reviewState && <p className="text-xs text-[#687387]" role="status">{reviewState}</p>}
            </div>
          </div>

          {/* Section 2: Verification Verdict & Explanation */}
          <div className="space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-[#14233F] font-bold flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#3268BB]" /> 02 &bull; Evidence Alignment Verdict
            </span>

            <div className="p-5 rounded-2xl border bg-white shadow-subtle space-y-3 border-[#E8E7E1]">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E8E7E1]">
                <VerdictBadge status={claim.verdict} size="lg" />
                <span className="text-xs font-mono text-[#687387]">
                  Confidence: {Math.round(claim.confidence * 100)}%
                </span>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#687387] mb-1">
                  Reasoning & Explanation:
                </h4>
                <p className="text-sm text-[#14233F] leading-relaxed">
                  {claim.verdict_explanation}
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Retrieved Primary Evidence Passage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-800 font-bold flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-600" /> 03 &bull; Retrieved Evidence Passage
              </span>
              {claim.retrieval_level && <RetrievalBadge level={claim.retrieval_level} />}
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200">
              <p className="text-sm text-emerald-950 font-serif leading-relaxed italic">
                "{claim.evidence_passage || 'No matching passage could be extracted from open repositories.'}"
              </p>
              {claim.source_grounded_wording && (
                <div className="mt-4 border-t border-emerald-200 pt-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 mb-1">
                    What the source reports
                  </h4>
                  <p className="text-sm text-emerald-950 font-serif leading-relaxed">
                    {claim.source_grounded_wording}
                  </p>
                  <p className="mt-2 text-xs text-emerald-900/80">{claim.correction_note}</p>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Original Research Publication Details */}
          <div className="space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-[#687387] font-bold">
              04 &bull; Associated Bibliography Reference
            </span>

            {reference ? (
              <div className="p-5 rounded-2xl bg-[#FAF9F5] border border-[#E8E7E1] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-mono font-bold text-[#14233F]">
                    Ref ID: {reference.id}
                  </div>
                  <AuthenticityBadge status={reference.authenticity_status} size="sm" />
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[#14233F]">
                    {reference.title || reference.raw_citation}
                  </h4>
                  <p className="text-xs text-[#687387] mt-1 font-serif">
                    Authors: {reference.authors} &bull; Year: {reference.year} &bull; Journal: {reference.journal}
                  </p>
                </div>

                <div className="p-3 bg-white rounded-xl border border-[#E8E7E1] text-xs text-[#687387] space-y-1">
                  <div className="font-semibold text-[#14233F]">Authentication Finding:</div>
                  <p>{reference.authenticity_reason || 'Verified scholarly record.'}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {reference.url && (
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3268BB] hover:underline"
                    >
                      <span>Open publisher record (DOI: {reference.doi || 'Indexed'})</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {onExploreResearch && (reference.paper_id || reference.doi) && (
                    <button
                      onClick={() => {
                        onClose();
                        onExploreResearch(reference);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#14233F] px-2.5 py-1 rounded-lg bg-[#FFF3D8] hover:bg-[#cbe665]"
                    >
                      <span>Explore Related Research</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-stone-100 border border-stone-200 text-xs text-stone-600">
                This claim has no mapped reference in the bibliography section (Uncited or ambiguous marker).
              </div>
            )}
          </div>

          {/* Section 5: Review Notice & Uncertainty Statement */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Scientific Reviewer Note & Uncertainty</span>
            </div>
            <p className="leading-relaxed">
              {claim.uncertainty_note || 'Natural language inference is performed on available abstracts and open-access text. Manual inspection of supplementary experimental data is encouraged for critical claims.'}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-6 border-t border-[#E8E7E1] bg-[#FAF9F5] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold transition-all shadow-subtle cursor-pointer"
          >
            Close Inspection
          </button>
        </div>
      </div>
    </div>
  );
};
