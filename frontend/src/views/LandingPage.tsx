import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight,
  CircleHelp, Compass, FileCheck2, FileSearch, Fingerprint, GitBranch, LockKeyhole,
  Network, Quote, Search, ShieldCheck, Sparkles, SplitSquareVertical, UploadCloud,
} from 'lucide-react';
import { fetchAudits, fetchClaims, fetchReferences } from '../api/client';
import { Claim, Reference } from '../types';
import { HeroIllustration } from '../components/HeroIllustration';
import { Navbar } from '../components/Navbar';

interface LandingPageProps {
  onStartAudit: () => void;
  onExploreDemo: () => void;
  onNavigate: (view: string) => void;
}

const verdictStyle: Record<string, string> = {
  SUPPORTED: 'bg-[#DFF3E8] text-[#397552]',
  PARTIALLY_SUPPORTED: 'bg-[#FFF3D8] text-[#936B21]',
  CONTRADICTED: 'bg-[#F9E3E1] text-[#A75D58]',
  INSUFFICIENT_EVIDENCE: 'bg-[#EAE9FA] text-[#625E98]',
  UNVERIFIED: 'bg-[#EAF1FC] text-[#3268BB]',
};

function EvidencePreview({ onExploreDemo }: { onExploreDemo: () => void }) {
  const [items, setItems] = useState<Array<{ claim: Claim; reference?: Reference }>>([]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const audits = await fetchAudits();
        const audit = audits.find((item) => item.status === 'completed');
        if (!audit) return;
        const [claims, references] = await Promise.all([fetchClaims(audit.id), fetchReferences(audit.id)]);
        if (!live) return;
        const refs = new Map(references.map((reference) => [reference.id, reference]));
        const mapped = claims.filter((claim) => claim.reference_id).map((claim) => ({ claim, reference: refs.get(claim.reference_id!) }));
        setItems(mapped.length ? mapped : claims.map((claim) => ({ claim })));
      } catch {
        // Keep the preview honest when the local API is not available.
      } finally {
        if (live) setLoaded(true);
      }
    };
    void load();
    return () => { live = false; };
  }, []);

  const current = items[index];
  const evidence = current?.claim.evidence_passage || current?.reference?.full_text_snippet || current?.reference?.abstract || '';
  const evidenceLabel = current?.claim.evidence_passage || current?.reference?.full_text_snippet
    ? 'Retrieved source passage'
    : current?.reference?.abstract ? 'Abstract-only source passage' : 'Source passage unavailable';

  return (
    <section id="statement-check" className="cv-section cv-preview-section scroll-mt-24">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:py-28">
        <div>
          <span className="cv-eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-[#3268BB]"/> Evidence preview</span>
          <h2 className="cv-section-title mt-5">See the claim.<br/><em>Follow the evidence.</em></h2>
          <p className="cv-lede mt-5">CiteVerify links each extracted statement to its citation, the publication record, and any passage it could actually retrieve. When evidence is missing, the gap stays visible.</p>
          <button onClick={onExploreDemo} className="cv-text-link mt-7">Explore the sample audit <ArrowRight className="h-4 w-4"/></button>
        </div>

        <div className="cv-evidence-window">
          <div className="flex items-center justify-between border-b border-[#E8E7E1] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EAF1FC] text-[#3268BB]"><FileSearch className="h-4 w-4"/></span><div><p className="text-[12px] font-bold text-[#14233F]">Claim evidence record</p><p className="text-[10px] text-[#687387]">{current ? `Record ${index + 1} of ${items.length}` : 'Live from the latest completed audit'}</p></div></div>
            {items.length > 1 && <div className="flex gap-1"><button className="cv-small-icon" onClick={() => setIndex((index - 1 + items.length) % items.length)} aria-label="Previous claim"><ChevronLeft className="h-4 w-4"/></button><button className="cv-small-icon" onClick={() => setIndex((index + 1) % items.length)} aria-label="Next claim"><ChevronRight className="h-4 w-4"/></button></div>}
          </div>

          {current ? <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-2xl bg-[#FAF9F5] p-4 sm:p-5"><div className="mb-2 flex items-center justify-between gap-3"><span className="cv-card-label"><Quote className="h-3.5 w-3.5"/> Manuscript claim</span><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#687387]">{current.claim.citation_marker || 'No marker'}</span></div><p className="font-serif text-[15px] leading-7 text-[#14233F]">“{current.claim.claim_text}”</p><p className="mt-3 text-[10px] font-medium text-[#687387]">Page {current.claim.page_number} · {current.claim.claim_type} claim</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-[#E8E7E1] p-4"><span className="cv-card-label"><BookOpen className="h-3.5 w-3.5"/> Cited publication</span><p className="mt-2 line-clamp-3 text-[13px] font-bold leading-5 text-[#14233F]">{current.reference?.matched_title || current.reference?.title || 'No bibliography record mapped'}</p><p className="mt-2 truncate text-[10px] text-[#687387]">{current.reference?.matched_authors || current.reference?.authors || 'Publication details unavailable'}{current.reference?.year ? ` · ${current.reference.year}` : ''}</p></div>
              <div className="rounded-2xl border border-[#E8E7E1] bg-white p-4"><span className="cv-card-label"><Search className="h-3.5 w-3.5"/> {evidenceLabel}</span><p className="mt-2 line-clamp-4 text-[11px] leading-5 text-[#687387]">{evidence ? `“${evidence}”` : 'No source passage was retrieved for this record. CiteVerify leaves the excerpt empty instead of inventing evidence.'}</p>{current.reference?.retrieval_level === 'abstract_only' && <span className="mt-2 inline-flex rounded-full bg-[#FFF3D8] px-2 py-1 text-[9px] font-bold text-[#936B21]">Abstract only</span>}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F4F5F2] px-4 py-3"><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.08em] ${verdictStyle[current.claim.verdict] || verdictStyle.UNVERIFIED}`}>{current.claim.verdict.replace(/_/g, ' ')}</span><span className="text-[10px] text-[#687387]">{current.claim.retrieval_level.replace(/_/g, ' ')}</span></div><span className="text-[10px] text-[#687387]">{current.reference?.authenticity_status?.replace(/_/g, ' ') || 'Source not linked'}</span></div>
          </div> : <div className="p-7 sm:p-9"><div className="rounded-2xl bg-[#FAF9F5] p-6 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF1FC] text-[#3268BB]"><FileSearch className="h-5 w-5"/></span><p className="mt-3 text-sm font-bold text-[#14233F]">{loaded ? 'No completed audit to preview yet' : 'Looking for an audit record…'}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#687387]">The preview uses saved audit results. It does not create sample quotations or verdicts.</p><button onClick={onExploreDemo} className="mt-4 rounded-full bg-[#3268BB] px-4 py-2.5 text-xs font-bold text-white">Open sample audit</button></div></div>}
        </div>
      </div>
    </section>
  );
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStartAudit, onExploreDemo, onNavigate }) => {
  const [networkFocus, setNetworkFocus] = useState('Your paper');
  const networkDetails: Record<string, string> = {
    'Your paper': 'Start here. Follow a claim to the publication it cites.',
    'Cited work': 'Move backward to the sources this paper builds on.',
    'Citing papers': 'See later publications that reference this work.',
    'Related work': 'Find nearby research topics and connected publications.',
    'Authors': 'Follow the people and research groups behind the papers.',
  };
  const features = useMemo(() => [
    { icon: Fingerprint, title: 'Citation authenticity', text: 'Check publication records against scholarly indexes, with retrieval failures kept separate from a failed match.', tone: 'blue' },
    { icon: FileSearch, title: 'Research claim extraction', text: 'Identify factual, scientific, statistical, and quantitative statements while preserving page context.', tone: 'yellow' },
    { icon: GitBranch, title: 'Citation mapping', text: 'Trace in-text markers to bibliography records and flag missing or uncited entries.', tone: 'lavender' },
    { icon: BookOpen, title: 'Original source retrieval', text: 'Show whether source text, an abstract, metadata, or no source material was available.', tone: 'green' },
    { icon: CheckCircle2, title: 'Claim-evidence review', text: 'Compare exact claims with retrieved passages and explain where support is direct, partial, or uncertain.', tone: 'coral' },
    { icon: SplitSquareVertical, title: 'Interactive PDF workspace', text: 'Move between manuscript pages, claim records, citations, and source evidence in one view.', tone: 'blue' },
    { icon: Compass, title: 'Research discovery', text: 'Explore references, citing papers, related literature, authors, and collections.', tone: 'green' },
    { icon: Network, title: 'Citation networks', text: 'See how indexed publications connect through citations and related-work records.', tone: 'lavender' },
  ], []);

  return (
    <div id="home" className="cv-site min-h-screen bg-[#FAF9F5] text-[#14233F] font-sans selection:bg-[#EAF1FC]">
      <Navbar onNavigate={onNavigate} activeView="landing" />

      <main>
        <section className="cv-hero relative overflow-hidden px-5 sm:px-8">
          <div className="cv-hero-glow cv-hero-glow--blue"/><div className="cv-hero-glow cv-hero-glow--yellow"/>
          <div className="relative mx-auto grid max-w-[1240px] items-center gap-8 py-14 sm:py-20 lg:min-h-[650px] lg:grid-cols-[1.02fr_.98fr] lg:gap-5 lg:py-16">
            <div className="relative z-10 max-w-[610px]">
              <div className="cv-pill mb-7"><Sparkles className="h-3.5 w-3.5 text-[#D8FF45]"/><span>Research, with the receipts</span></div>
              <h1 className="cv-hero-title">Don’t just trust<br className="hidden sm:block"/> the citation.<br/><em>Verify the evidence.</em></h1>
              <p className="cv-hero-copy mt-6 max-w-[540px]">Automatically verify academic references, trace claims to original research, and discover whether cited evidence actually supports what’s written.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button onClick={onStartAudit} className="cv-button-primary"><UploadCloud className="h-[17px] w-[17px]"/> Upload Paper <ArrowRight className="ml-1 h-4 w-4"/></button>
                <a href="#statement-check" className="cv-button-secondary"><Search className="h-4 w-4 text-[#3268BB]"/> Check a Statement</a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-medium text-[#687387]"><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#63A982]"/> No account needed for a first analysis</span><span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5 text-[#3268BB]"/> Privacy-conscious document processing</span></div>
              <a href="#how-it-works" className="mt-11 hidden items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#687387] lg:inline-flex">See how it works <ArrowDownRight className="h-4 w-4"/></a>
            </div>
            <div className="relative z-10 -mx-3 sm:mx-0"><HeroIllustration/><div className="cv-status-floats"><span className="cv-status-float cv-status-float--green"><Check className="h-3 w-3"/> Supported</span><span className="cv-status-float cv-status-float--amber">Partially supported</span><span className="cv-status-float cv-status-float--coral">Contradicted</span><span className="cv-status-float cv-status-float--blue">Unverified</span></div></div>
          </div>
        </section>

        <div className="cv-motion-ribbon" aria-label="CiteVerify research workflow">
          <div className="cv-motion-ribbon-track" aria-hidden="true">
            {[0, 1].map((copy) => <div className="cv-motion-ribbon-copy" key={copy}>
              <span>Trace the claim</span><i>✳</i><span>Find the original</span><i>✳</i><span>Read the evidence</span><i>✳</i><span>Keep uncertainty visible</span><i>✳</i>
            </div>)}
          </div>
        </div>

        <div className="cv-trust-strip"><span>Built for careful research</span><i/><span>Clear source provenance</span><i/><span>Honest about uncertainty</span><i/><span>Reference checks with Crossref &amp; OpenAlex</span></div>

        <section id="how-it-works" className="cv-section scroll-mt-24 px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto max-w-[1180px]">
            <div className="cv-section-heading"><span className="cv-eyebrow">A clear path through the literature</span><h2 className="cv-section-title mt-4">From citation to evidence.<br/><em>In three simple steps.</em></h2><p className="cv-lede mt-4">A transparent workflow that shows what was checked, what was found, and what still needs a human eye.</p></div>
            <div className="cv-steps mt-12 grid gap-0 md:grid-cols-3">
              {[
                { n: '01', icon: UploadCloud, title: 'Upload your paper', text: 'Add a PDF and let CiteVerify identify its title, authors, citations, references, and evidence-bearing claims.', tone: 'blue' },
                { n: '02', icon: Fingerprint, title: 'Verify your references', text: 'Compare bibliography details with scholarly records and map each in-text citation to its source.', tone: 'yellow' },
                { n: '03', icon: FileSearch, title: 'Examine the evidence', text: 'Review source passages beside the claims they are meant to support. Unavailable evidence stays unverified.', tone: 'green' },
              ].map((step, index) => <article key={step.n} className={`cv-step cv-step--${step.tone}`}><div className="flex items-center justify-between"><span className="cv-step-number">{step.n}</span><span className="cv-icon-tile"><step.icon className="h-5 w-5"/></span></div><h3>{step.title}</h3><p>{step.text}</p>{index < 2 && <span className="cv-step-arrow"><ArrowRight className="h-4 w-4"/></span>}</article>)}
            </div>
          </div>
        </section>

        <EvidencePreview onExploreDemo={onExploreDemo}/>

        <section id="features" className="cv-section cv-feature-section scroll-mt-24 px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto max-w-[1180px]">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><span className="cv-eyebrow">More than a reference list</span><h2 className="cv-section-title mt-4 max-w-[680px]">Research deserves<br/><em>a closer read.</em></h2></div><p className="cv-lede max-w-[400px] md:pb-2">One calm workspace for citation checks, claim review, source retrieval, and the next question your reading raises.</p></div>
            <div className="cv-feature-grid mt-12">
              {features.map(({ icon: Icon, title, text, tone }, i) => <article key={title} className={`cv-feature cv-feature--${tone}`}><div className="flex items-center justify-between"><span className="cv-icon-tile"><Icon className="h-5 w-5"/></span><span className="cv-feature-number">0{i + 1}</span></div><h3>{title}</h3><p>{text}</p></article>)}
            </div>
          </div>
        </section>

        <section id="explore" className="cv-section scroll-mt-24 px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
            <div><span className="cv-eyebrow">Beyond the bibliography</span><h2 className="cv-section-title mt-4">Discover how<br/><em>research connects.</em></h2><p className="cv-lede mt-5">Move from a verified publication into the work it cites, papers that cite it, and related research. Save useful papers into collections and follow a topic through time.</p><button onClick={() => onNavigate('discover')} className="cv-button-primary mt-7">Explore research <ArrowRight className="h-4 w-4"/></button><div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-[11px] font-semibold text-[#687387]"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#3268BB]"/> Collections &amp; notes</span><span className="flex items-center gap-2"><Compass className="h-4 w-4 text-[#63A982]"/> Author &amp; timeline views</span></div></div>
            <div className="cv-network-panel"><div className="flex items-center justify-between"><span className="cv-card-label"><Network className="h-3.5 w-3.5"/> Research connections</span><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-[#687387]">Tap a node</span></div><svg viewBox="0 0 620 330" className="mt-4 h-auto w-full" role="group" aria-label="Interactive citation map. Select a node to explore its relationship to a paper."><path className="cv-network-link" d="M309 164 145 83M309 164 480 75M309 164 142 258M309 164 480 255M145 83 142 258M480 75 480 255" stroke="#BCCBE0" strokeWidth="2" strokeDasharray="5 7"/><g className={`cv-network-node ${networkFocus === 'Your paper' ? 'is-active' : ''}`} role="button" tabIndex={0} aria-label="Your paper" onClick={() => setNetworkFocus('Your paper')} onKeyDown={(event) => event.key === 'Enter' && setNetworkFocus('Your paper')}><circle cx="310" cy="164" r="68" fill="#EAF1FC"/><circle cx="310" cy="164" r="51" fill="white" stroke="#3268BB" strokeWidth="2"/><text x="310" y="158" textAnchor="middle" fill="#14233F" fontSize="13" fontWeight="700">Your paper</text><text x="310" y="178" textAnchor="middle" fill="#687387" fontSize="10">start here</text></g><g className={`cv-network-node ${networkFocus === 'Cited work' ? 'is-active' : ''}`} role="button" tabIndex={0} aria-label="Cited work" onClick={() => setNetworkFocus('Cited work')} onKeyDown={(event) => event.key === 'Enter' && setNetworkFocus('Cited work')}><circle cx="145" cy="83" r="39" fill="#DFF3E8"/><text x="145" y="87" textAnchor="middle" fill="#397552" fontSize="11" fontWeight="700">Cited work</text></g><g className={`cv-network-node ${networkFocus === 'Citing papers' ? 'is-active' : ''}`} role="button" tabIndex={0} aria-label="Citing papers" onClick={() => setNetworkFocus('Citing papers')} onKeyDown={(event) => event.key === 'Enter' && setNetworkFocus('Citing papers')}><circle cx="480" cy="75" r="39" fill="#FFF3D8"/><text x="480" y="79" textAnchor="middle" fill="#936B21" fontSize="11" fontWeight="700">Citing papers</text></g><g className={`cv-network-node ${networkFocus === 'Related work' ? 'is-active' : ''}`} role="button" tabIndex={0} aria-label="Related work" onClick={() => setNetworkFocus('Related work')} onKeyDown={(event) => event.key === 'Enter' && setNetworkFocus('Related work')}><circle cx="142" cy="258" r="39" fill="#EAE9FA"/><text x="142" y="262" textAnchor="middle" fill="#625E98" fontSize="11" fontWeight="700">Related work</text></g><g className={`cv-network-node ${networkFocus === 'Authors' ? 'is-active' : ''}`} role="button" tabIndex={0} aria-label="Authors" onClick={() => setNetworkFocus('Authors')} onKeyDown={(event) => event.key === 'Enter' && setNetworkFocus('Authors')}><circle cx="480" cy="255" r="39" fill="#F9E3E1"/><text x="480" y="259" textAnchor="middle" fill="#A75D58" fontSize="11" fontWeight="700">Authors</text></g><circle cx="73" cy="161" r="5" fill="#3268BB"/><circle cx="555" cy="160" r="5" fill="#63A982"/></svg><div className="cv-network-status" aria-live="polite"><span className="cv-network-status-dot"/><strong>{networkFocus}</strong><span>{networkDetails[networkFocus]}</span></div><div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[#E8E7E1] pt-4 text-[10px] text-[#687387]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#3268BB]"/>Citation link</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#63A982]"/>Indexed related work</span><span>Open the map with real indexed records in Explore</span></div></div>
          </div>
        </section>

        <section id="about" className="cv-about-section scroll-mt-24 px-5 py-20 sm:px-8 lg:py-24">
          <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><span className="cv-eyebrow"><LockKeyhole className="h-3.5 w-3.5"/> Privacy &amp; care</span><h2 className="cv-section-title mt-4">A more thoughtful<br/><em>way to verify.</em></h2><p className="cv-lede mt-4">Research files deserve careful handling, and an audit should be clear about what it can and cannot conclude.</p><button onClick={() => onNavigate('settings')} className="cv-text-link mt-6">Review privacy settings <ArrowRight className="h-4 w-4"/></button></div><div className="grid gap-4 sm:grid-cols-2"><article className="cv-about-note"><span className="cv-icon-tile"><LockKeyhole className="h-5 w-5"/></span><h3>Privacy-conscious processing</h3><p>Documents are handled within the CiteVerify workspace. Retention and cleanup controls remain available in Settings.</p></article><article className="cv-about-note"><span className="cv-icon-tile"><CircleHelp className="h-5 w-5"/></span><h3>Uncertainty is part of the answer</h3><p>Unavailable sources are not treated as proof that a citation is false. Evidence excerpts appear only when source text was retrieved.</p></article></div></div>
        </section>

        <section className="cv-final-cta px-5 py-16 sm:px-8 lg:py-20"><div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-8 md:flex-row md:items-center"><div><span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#D4E3F6]">Read with confidence</span><h2 className="mt-3 max-w-[720px] text-3xl font-extrabold leading-tight tracking-[-.045em] text-white sm:text-5xl">Make every citation earn its place.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-white/75">Start with a paper. Leave with a clearer view of what the evidence says.</p></div><button onClick={onStartAudit} className="inline-flex shrink-0 items-center gap-3 rounded-full bg-white px-6 py-4 text-sm font-bold text-[#3268BB] transition hover:-translate-y-0.5 hover:bg-[#EAF1FC]">Upload your paper <ArrowRight className="h-4 w-4"/></button></div></section>
      </main>

      <footer className="cv-footer px-5 py-8 sm:px-8"><div className="mx-auto flex max-w-[1180px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2 text-left"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#3268BB] text-white"><ShieldCheck className="h-4 w-4"/></span><span className="text-sm font-extrabold tracking-tight text-[#14233F]">CiteVerify</span></button><p className="text-[11px] text-[#687387]">A clearer path from citation to evidence.</p><div className="flex gap-5 text-[11px] font-semibold text-[#687387]"><button onClick={() => onNavigate('settings')} className="hover:text-[#3268BB]">Privacy settings</button><button onClick={() => onNavigate('dashboard')} className="hover:text-[#3268BB]">Workspace</button></div></div></footer>
    </div>
  );
};
