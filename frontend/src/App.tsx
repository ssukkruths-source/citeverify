import React, { useState, useEffect, useRef } from 'react';
import { Audit, Claim, Reference, ResearchPaper } from './types';
import { fetchAudits, fetchAudit, fetchClaims, fetchReferences, loadSampleAudit } from './api/client';
import { Sidebar } from './components/Sidebar';
import { LandingPage } from './views/LandingPage';
import { DashboardView } from './views/DashboardView';
import { UploadView } from './views/UploadView';
import { ProcessingView } from './views/ProcessingView';
import { AuditResultsView } from './views/AuditResultsView';
import { ClaimExplorerView } from './views/ClaimExplorerView';
import { ClaimDetailModal } from './views/ClaimDetailModal';
import { PdfViewerView } from './views/PdfViewerView';
import { ReferenceLibraryView } from './views/ReferenceLibraryView';
import { ReportPreviewView } from './views/ReportPreviewView';
import { AuditHistoryView } from './views/AuditHistoryView';
import { SettingsView } from './views/SettingsView';
import { DiscoverResearchView } from './views/DiscoverResearchView';
import { CollectionsView } from './views/CollectionsView';
import { ResearchTimelineView } from './views/ResearchTimelineView';
import { AuthorExplorerView } from './views/AuthorExplorerView';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>('landing');
  const [routeIsLeaving, setRouteIsLeaving] = useState(false);
  const routeTimer = useRef<number | null>(null);
  const pendingRoute = useRef<string | null>(null);
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [activeAudit, setActiveAudit] = useState<Audit | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedClaimForDetail, setSelectedClaimForDetail] = useState<Claim | null>(null);
  const [claimForPdfView, setClaimForPdfView] = useState<Claim | null>(null);
  const [claimFilterParam, setClaimFilterParam] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState('');

  // Discovery integration state
  const [discoverySeedId, setDiscoverySeedId] = useState<string | null>(null);
  const [discoveryPaperId, setDiscoveryPaperId] = useState<string | null>(null);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [pendingAuditPaper, setPendingAuditPaper] = useState<ResearchPaper | null>(null);

  useEffect(() => {
    fetchAudits()
      .then((audits) => {
        if (audits.length > 0) {
          const first = audits[0];
          setActiveAuditId(first.id);
          setActiveAudit(first);
        }
      })
      .catch((err) => {
        console.error(err);
        setConnectionError(err instanceof Error ? err.message : 'Could not connect to the CiteVerify workspace.');
      });
  }, []);

  useEffect(() => {
    if (!activeAuditId) return;

    fetchAudit(activeAuditId)
      .then((a) => setActiveAudit(a))
      .catch((e) => console.error(e));

    fetchClaims(activeAuditId)
      .then((c) => setClaims(c))
      .catch((e) => console.error(e));

    fetchReferences(activeAuditId)
      .then((r) => setReferences(r))
      .catch((e) => console.error(e));
  }, [activeAuditId]);

  const goToView = (view: string) => {
    if (routeTimer.current !== null) {
      window.clearTimeout(routeTimer.current);
      routeTimer.current = null;
    }
    if (view === currentView) {
      pendingRoute.current = null;
      setRouteIsLeaving(false);
      return;
    }
    pendingRoute.current = view;
    setRouteIsLeaving(true);
    routeTimer.current = window.setTimeout(() => {
      setCurrentView(pendingRoute.current || view);
      pendingRoute.current = null;
      setRouteIsLeaving(false);
      routeTimer.current = null;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280);
  };

  const handleNavigate = (view: string, auditId?: string, filterParam?: string) => {
    if (auditId && auditId !== activeAuditId) {
      setActiveAuditId(auditId);
    }
    if (filterParam) {
      setClaimFilterParam(filterParam);
    }
    goToView(view);
  };

  const handleStartAudit = () => {
    goToView('upload');
  };

  const handleExploreDemo = async () => {
    try {
      const sample = await loadSampleAudit();
      setActiveAuditId(sample.audit_id);
      goToView('results');
    } catch (e) {
      console.error(e);
      goToView('upload');
    }
  };

  const handleUploadSuccess = (auditId: string) => {
    setActiveAuditId(auditId);
    setPendingAuditPaper(null);
    goToView('processing');
  };

  const handleProcessingComplete = (auditId: string) => {
    setActiveAuditId(auditId);
    goToView('results');
  };

  const handleOpenPdfWithClaim = (claim: Claim) => {
    setClaimForPdfView(claim);
    goToView('pdf-viewer');
  };

  /** Audit reference -> Research Discovery, using the reference as a seed. */
  const handleExploreReference = (reference: Reference) => {
    const seedId =
      reference.paper_id ||
      (reference.doi ? `doi:${reference.doi.toLowerCase()}` : reference.matched_doi ? `doi:${reference.matched_doi.toLowerCase()}` : '');
    if (!seedId) return;
    setDiscoveryPaperId(null);
    setDiscoverySeedId(seedId);
    goToView('discover');
  };

  /** A discovered publication can start a new CiteVerify audit. */
  const handleSendToAudit = (paper: ResearchPaper) => {
    setPendingAuditPaper(paper);
    goToView('upload');
  };

  const openDiscoverySeed = (paperId: string) => {
    setDiscoveryPaperId(null);
    setDiscoverySeedId(paperId);
    goToView('discover');
  };

  const openDiscoveryPaper = (paperId: string) => {
    setDiscoverySeedId(null);
    setDiscoveryPaperId(paperId);
    goToView('discover');
  };

  const refMap = new Map(references.map((r) => [r.id, r]));

  return (
    <div className="cv-app-shell min-h-screen bg-[#FAF9F5] flex flex-col font-sans">
      {connectionError && <div role="alert" className="fixed bottom-4 right-4 z-[70] max-w-lg rounded-xl border border-[#E8B9B6] bg-[#F9E3E1] px-4 py-3 text-xs text-[#7A2E2A] shadow-lg">Workspace connection failed: {connectionError}</div>}
      {routeIsLeaving && <div className="cv-transition-curtain" aria-hidden="true"><span>CITEVERIFY</span></div>}
      <div key={currentView} className={`cv-route-frame ${routeIsLeaving ? 'cv-route-frame--leaving' : ''}`}>
      {currentView === 'landing' ? (
        <LandingPage
          onStartAudit={handleStartAudit}
          onExploreDemo={handleExploreDemo}
          onNavigate={goToView}
        />
      ) : (
        <div className="flex-1 flex flex-row overflow-x-hidden">
          <Sidebar
            currentView={currentView}
            onNavigate={(v) => handleNavigate(v, activeAuditId || undefined)}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            activeAuditId={activeAuditId || undefined}
          />

          <main className="cv-app-main flex-1 min-w-0 overflow-y-auto pt-14 lg:pt-0">
            {currentView === 'dashboard' && (
              <DashboardView
                onNavigate={(v, id) => handleNavigate(v, id)}
                onSelectAudit={(id) => setActiveAuditId(id)}
              />
            )}

            {currentView === 'upload' && (
              <UploadView
                onUploadSuccess={handleUploadSuccess}
                onNavigate={goToView}
                pendingPaper={pendingAuditPaper}
                onClearPendingPaper={() => setPendingAuditPaper(null)}
              />
            )}

            {currentView === 'processing' && activeAuditId && (
              <ProcessingView
                auditId={activeAuditId}
                onComplete={handleProcessingComplete}
                onNavigate={goToView}
              />
            )}

            {currentView === 'results' && activeAuditId && (
              <AuditResultsView
                auditId={activeAuditId}
                onNavigate={(v, id, filter) => handleNavigate(v, id, filter)}
                onSelectClaim={(c) => setSelectedClaimForDetail(c)}
              />
            )}

            {currentView === 'claims' && (
              <ClaimExplorerView
                claims={claims}
                references={references}
                onSelectClaim={(c) => setSelectedClaimForDetail(c)}
                onOpenPdfViewer={handleOpenPdfWithClaim}
                initialFilter={claimFilterParam}
              />
            )}

            {currentView === 'pdf-viewer' && activeAudit && (
              <PdfViewerView
                audit={activeAudit}
                claims={claims}
                references={references}
                initialClaim={claimForPdfView}
                onNavigate={goToView}
              />
            )}

            {currentView === 'references' && (
              <ReferenceLibraryView
                references={references}
                auditTitle={activeAudit?.title}
                diagnostics={activeAudit?.diagnostics}
                onNavigate={goToView}
                onExploreResearch={handleExploreReference}
              />
            )}

            {currentView === 'reports' && activeAudit && (
              <ReportPreviewView
                audit={activeAudit}
                claims={claims}
                references={references}
                onNavigate={goToView}
              />
            )}

            {currentView === 'history' && (
              <AuditHistoryView
                onSelectAudit={(id) => setActiveAuditId(id)}
                onNavigate={(v, id) => handleNavigate(v, id)}
              />
            )}

            {currentView === 'settings' && <SettingsView />}

            {currentView === 'discover' && (
              <DiscoverResearchView
                initialSeedId={discoverySeedId}
                initialPaperId={discoveryPaperId}
                onSeedConsumed={() => setDiscoverySeedId(null)}
                onPaperConsumed={() => setDiscoveryPaperId(null)}
                onSendToAudit={handleSendToAudit}
                onOpenCollection={(id) => {
                  setActiveCollectionId(id);
                  goToView('collections');
                }}
              />
            )}

            {currentView === 'collections' && (
              <CollectionsView
                initialCollectionId={activeCollectionId}
                onUseSeed={openDiscoverySeed}
                onInspectPaper={openDiscoveryPaper}
                onExploreResearch={() => {
                  setDiscoverySeedId(null);
                  setDiscoveryPaperId(null);
                  goToView('discover');
                }}
              />
            )}

            {currentView === 'timeline' && (
              <ResearchTimelineView onInspectPaper={openDiscoveryPaper} onSeedPaper={openDiscoverySeed} />
            )}

            {currentView === 'authors' && (
              <AuthorExplorerView onInspectPaper={openDiscoveryPaper} onSeedPaper={openDiscoverySeed} />
            )}
          </main>
        </div>
      )}
      </div>

      {selectedClaimForDetail && (
        <ClaimDetailModal
          claim={selectedClaimForDetail}
          reference={
            selectedClaimForDetail.reference_id
              ? refMap.get(selectedClaimForDetail.reference_id)
              : undefined
          }
          onClose={() => setSelectedClaimForDetail(null)}
          onOpenInPdf={handleOpenPdfWithClaim}
          onExploreResearch={handleExploreReference}
          onFeedbackSaved={(verdict, explanation) => {
            const updated = { ...selectedClaimForDetail!, verdict, verdict_explanation: explanation };
            setSelectedClaimForDetail(updated);
            setClaims((current) => current.map((item) => item.id === updated.id ? updated : item));
          }}
        />
      )}
    </div>
  );
};
