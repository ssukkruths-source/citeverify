import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  Filter,
  GitBranch,
  Info,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import {
  addPaperToCollection,
  addSeed,
  buildNetwork,
  createCollection,
  fetchCollections,
  fetchDemoNetwork,
  fetchPaper,
  fetchSeeds,
  removeSeed,
  searchResearch,
} from '../api/client';
import {
  NetworkGraph,
  ResearchCollection,
  ResearchPaper,
  ResearchSeed,
  SearchResponse,
} from '../types';
import { ResearchNetworkMap } from '../components/ResearchNetworkMap';

interface DiscoverResearchViewProps {
  initialSeedId?: string | null;
  initialPaperId?: string | null;
  onSeedConsumed?: () => void;
  onPaperConsumed?: () => void;
  onSendToAudit?: (paper: ResearchPaper) => void;
  onOpenCollection?: (collectionId: string) => void;
}

type Tab = 'references' | 'citations' | 'similar';

const RELATION_LABEL: Record<Tab, string> = {
  references: 'References (earlier works cited)',
  citations: 'Cited by (newer works)',
  similar: 'Similar papers (recommendations)',
};

export const DiscoverResearchView: React.FC<DiscoverResearchViewProps> = ({
  initialSeedId,
  initialPaperId,
  onSeedConsumed,
  onPaperConsumed,
  onSendToAudit,
  onOpenCollection,
}) => {
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [isOa, setIsOa] = useState('any');
  const [workType, setWorkType] = useState('any');
  const [minCitations, setMinCitations] = useState('');
  const [author, setAuthor] = useState('');
  const [sort, setSort] = useState('relevance');

  const [results, setResults] = useState<ResearchPaper[]>([]);
  const [searchMeta, setSearchMeta] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [seeds, setSeeds] = useState<ResearchSeed[]>([]);
  const [graph, setGraph] = useState<NetworkGraph | null>(null);
  const [building, setBuilding] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [includeReferences, setIncludeReferences] = useState(true);
  const [includeCitations, setIncludeCitations] = useState(true);
  const [includeSimilar, setIncludeSimilar] = useState(true);
  const [maxNodes, setMaxNodes] = useState(40);

  const [selected, setSelected] = useState<ResearchPaper | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<Tab>('references');
  const [related, setRelated] = useState<Record<Tab, ResearchPaper[]>>({
    references: [],
    citations: [],
    similar: [],
  });
  const [warnings, setWarnings] = useState<string[]>([]);

  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [targetCollection, setTargetCollection] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [savingPaper, setSavingPaper] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tableView, setTableView] = useState(false);

  const seedIds = useMemo(() => seeds.map((s) => s.paper_id), [seeds]);

  const loadSeeds = useCallback(async () => {
    try {
      const data = await fetchSeeds();
      setSeeds(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadCollections = useCallback(async () => {
    try {
      const data = await fetchCollections();
      setCollections(data.collections);
      if (!targetCollection && data.collections.length) {
        setTargetCollection(data.collections[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }, [targetCollection]);

  useEffect(() => {
    loadSeeds();
    loadCollections();
  }, [loadSeeds, loadCollections]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const runSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const data = await searchResearch({
        q: query,
        per_page: 20,
        year_from: yearFrom,
        year_to: yearTo,
        is_oa: isOa,
        work_type: workType,
        min_citations: minCitations,
        author,
        sort,
      });
      setResults(data.results);
      setSearchMeta(data);
      if (!data.results.length) {
        setSearchError('No publications matched this search.');
      }
    } catch (err: any) {
      setSearchError(err.message || 'Search failed. Check the scholarly API connection.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const openPaper = async (paperId: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchPaper(paperId);
      setSelected(data.paper);
      setRelated({
        references: data.references || [],
        citations: data.citations || [],
        similar: data.similar || [],
      });
      setWarnings(data.warnings || []);
      setDetailTab('references');
    } catch (err: any) {
      setToast(err.message || 'Publication details could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (graph?.nodes.length && selected) return;
    if (graph?.nodes.length && !selected) {
      setSelected({
        id: graph.nodes[0].id,
        title: graph.nodes[0].title,
        authors: graph.nodes[0].authors,
        year: graph.nodes[0].year,
        journal: graph.nodes[0].journal,
        doi: graph.nodes[0].doi,
        citation_count: graph.nodes[0].citation_count,
        is_open_access: graph.nodes[0].is_open_access,
        oa_url: graph.nodes[0].oa_url,
        url: graph.nodes[0].url,
      });
    }
  }, [graph, selected]);

  const handleAddSeed = async (paper: ResearchPaper) => {
    try {
      await addSeed(paper.id);
      await loadSeeds();
      setToast('Added as a seed paper');
    } catch (err: any) {
      setToast(err.message || 'Could not add seed');
    }
  };

  const handleRemoveSeed = async (seed: ResearchSeed) => {
    try {
      await removeSeed(seed.id);
      await loadSeeds();
    } catch (err: any) {
      setToast(err.message || 'Could not remove seed');
    }
  };

  const handleBuild = async (ids?: string[]) => {
    const seedList = ids || seedIds;
    if (!seedList.length) {
      setNetworkError('Add at least one seed paper before building the network.');
      return;
    }
    setBuilding(true);
    setNetworkError(null);
    try {
      const data = await buildNetwork({
        seed_ids: seedList,
        include_references: includeReferences,
        include_citations: includeCitations,
        include_similar: includeSimilar,
        max_nodes: maxNodes,
      });
      setGraph(data);
      setWarnings(data.warnings || []);
      if (!data.nodes.length) {
        setNetworkError('The scholarly APIs returned no connected publications for this seed.');
      }
    } catch (err: any) {
      setNetworkError(err.message || 'Network construction failed.');
    } finally {
      setBuilding(false);
    }
  };

  const handleDemo = async () => {
    setBuilding(true);
    setNetworkError(null);
    try {
      const data = await fetchDemoNetwork();
      setGraph(data);
      setWarnings(data.warnings || []);
    } catch (err: any) {
      setNetworkError(err.message || 'Demo network unavailable.');
    } finally {
      setBuilding(false);
    }
  };

  // Inspection-only navigation (from collections, timeline, author explorer).
  useEffect(() => {
    if (!initialPaperId) return;
    let active = true;
    (async () => {
      try {
        await openPaper(initialPaperId);
      } finally {
        if (active) onPaperConsumed?.();
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPaperId]);

  // Coming from an audit reference: seed it and open its network.
  useEffect(() => {
    if (!initialSeedId) return;
    let active = true;
    (async () => {
      try {
        const paper = await fetchPaper(initialSeedId);
        if (!active) return;
        setSelected(paper.paper);
        setRelated({
          references: paper.references || [],
          citations: paper.citations || [],
          similar: paper.similar || [],
        });
        setWarnings(paper.warnings || []);
        await addSeed(initialSeedId);
        await loadSeeds();
        await handleBuild([initialSeedId]);
      } catch (err: any) {
        setNetworkError(err.message || 'Could not open research for this reference.');
      } finally {
        onSeedConsumed?.();
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeedId]);

  const handleSaveToCollection = async () => {
    if (!selected) return;
    setSavingPaper(true);
    try {
      let collectionId = targetCollection;
      if (!collectionId && newCollectionName.trim()) {
        const created = await createCollection(newCollectionName.trim());
        collectionId = created.id;
        setNewCollectionName('');
        await loadCollections();
        setTargetCollection(created.id);
      }
      if (!collectionId) {
        setToast('Choose or create a collection first.');
        return;
      }
      await addPaperToCollection(collectionId, selected.id);
      setToast('Saved to collection');
      await loadCollections();
    } catch (err: any) {
      setToast(err.message || 'Could not save publication');
    } finally {
      setSavingPaper(false);
    }
  };

  const seedPaperIds = new Set(seedIds);

  return (
    <div className="p-5 sm:p-8 max-w-[1500px] mx-auto space-y-6 font-sans">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#14233F] text-white text-xs font-semibold shadow-floating flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-[#FFF3D8]" />
          {toast}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#E8E7E1]">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
            Research Discovery
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
            Find, map and save the literature behind your citations
          </h1>
          <p className="text-sm text-[#687387] mt-1 max-w-2xl">
            Search Crossref, OpenAlex and Semantic Scholar, follow real citation edges and
            build a research library. Discovery never changes an audit verdict.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDemo}
            className="px-3.5 py-2 rounded-xl border border-[#E8E7E1] bg-white text-xs font-bold text-[#14233F] hover:bg-[#FAF9F5] flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#3268BB]" />
            Load demo network
          </button>
          <button
            onClick={() => handleBuild()}
            disabled={building}
            className="px-4 py-2 rounded-xl bg-[#14233F] hover:bg-[#3268BB] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5"
          >
            {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
            Build network
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left column: search + seeds */}
        <div className="xl:col-span-4 space-y-5">
          <form onSubmit={runSearch} className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#687387] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, DOI, keyword or topic"
                className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-[#E8E7E1] bg-[#FAF9F5]/60 outline-none focus:bg-white focus:border-[#3268BB]"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={searching}
                className="flex-1 px-3 py-2 rounded-lg bg-[#3268BB] hover:bg-[#3f4ed6] text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Search literature
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                  filtersOpen ? 'border-[#3268BB] text-[#3268BB] bg-indigo-50' : 'border-[#E8E7E1] text-[#687387]'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
              </button>
            </div>

            {filtersOpen && (
              <div className="space-y-2.5 pt-2 border-t border-[#E8E7E1]">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-mono uppercase text-[#687387]">
                    Year from
                    <input
                      value={yearFrom}
                      onChange={(e) => setYearFrom(e.target.value)}
                      placeholder="2015"
                      inputMode="numeric"
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-[#E8E7E1] outline-none"
                    />
                  </label>
                  <label className="text-[10px] font-mono uppercase text-[#687387]">
                    Year to
                    <input
                      value={yearTo}
                      onChange={(e) => setYearTo(e.target.value)}
                      placeholder="2026"
                      inputMode="numeric"
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-[#E8E7E1] outline-none"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-mono uppercase text-[#687387]">
                    Access
                    <select
                      value={isOa}
                      onChange={(e) => setIsOa(e.target.value)}
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-[#E8E7E1] outline-none bg-white"
                    >
                      <option value="any">Any</option>
                      <option value="true">Open access</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-mono uppercase text-[#687387]">
                    Type
                    <select
                      value={workType}
                      onChange={(e) => setWorkType(e.target.value)}
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-[#E8E7E1] outline-none bg-white"
                    >
                      <option value="any">Any</option>
                      <option value="article">Journal article</option>
                      <option value="review">Review</option>
                      <option value="preprint">Preprint</option>
                      <option value="book-chapter">Book chapter</option>
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-mono uppercase text-[#687387]">
                    Min citations
                    <input
                      value={minCitations}
                      onChange={(e) => setMinCitations(e.target.value)}
                      placeholder="0"
                      inputMode="numeric"
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-[#E8E7E1] outline-none"
                    />
                  </label>
                  <label className="text-[10px] font-mono uppercase text-[#687387]">
                    Sort by
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-[#E8E7E1] outline-none bg-white"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="cited">Most cited</option>
                      <option value="recent">Most recent</option>
                    </select>
                  </label>
                </div>
                <label className="text-[10px] font-mono uppercase text-[#687387] block">
                  Author
                  <input
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Surname"
                    className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-[#E8E7E1] outline-none"
                  />
                </label>
              </div>
            )}
          </form>

          {/* Seeds */}
          <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#14233F] font-bold flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-[#3268BB]" />
                Seed papers ({seeds.length})
              </h3>
              {seeds.length > 1 && (
                <button
                  onClick={() => handleBuild()}
                  className="text-[10px] font-bold text-[#3268BB] hover:underline"
                >
                  Expand all
                </button>
              )}
            </div>

            {seeds.length === 0 ? (
              <p className="text-xs text-[#687387] leading-relaxed">
                A seed paper is the starting point. Search for a publication and add it
                here to explore its references, citing works and related research.
              </p>
            ) : (
              <div className="space-y-2">
                {seeds.map((seed) => (
                  <div
                    key={seed.id}
                    className="p-2.5 rounded-xl border border-[#E8E7E1] bg-[#FAF9F5]/60 flex items-start justify-between gap-2"
                  >
                    <button className="text-left min-w-0" onClick={() => openPaper(seed.paper_id)}>
                      <div className="text-[11px] font-bold text-[#14233F] line-clamp-2">
                        {seed.paper?.title || seed.paper_id}
                      </div>
                      <div className="text-[10px] text-[#687387] font-mono mt-0.5">
                        {seed.paper?.year || '—'} · {seed.paper?.journal || 'source unknown'}
                      </div>
                    </button>
                    <button
                      onClick={() => handleRemoveSeed(seed)}
                      className="p-1 rounded text-[#687387] hover:text-rose-600 hover:bg-white"
                      title="Remove seed"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-[#E8E7E1] space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#687387]">
                Network scope
              </div>
              {[
                ['includeReferences', 'References cited by seed', includeReferences, setIncludeReferences],
                ['includeCitations', 'Works citing the seed', includeCitations, setIncludeCitations],
                ['includeSimilar', 'Recommended similar papers', includeSimilar, setIncludeSimilar],
              ].map(([key, label, value, setter]: any) => (
                <label key={key} className="flex items-center gap-2 text-[11px] text-[#14233F] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setter(e.target.checked)}
                    className="accent-[#3268BB]"
                  />
                  {label}
                </label>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] font-mono uppercase text-[#687387]">Max nodes</span>
                <input
                  type="range"
                  min={10}
                  max={80}
                  step={5}
                  value={maxNodes}
                  onChange={(e) => setMaxNodes(Number(e.target.value))}
                  className="flex-1 accent-[#3268BB]"
                />
                <span className="text-[10px] font-mono text-[#14233F] w-6 text-right">{maxNodes}</span>
              </div>
            </div>
          </div>

          {/* Search results */}
          <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle">
            <div className="px-4 py-3 border-b border-[#E8E7E1] flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#14233F] font-bold">
                Search results {searchMeta ? `(${results.length})` : ''}
              </h3>
              {searchMeta?.source && (
                <span className="text-[10px] font-mono text-[#687387]">{searchMeta.source}</span>
              )}
            </div>

            {searchError && (
              <div className="px-4 py-3 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {searchError}
              </div>
            )}

            <div className="max-h-[520px] overflow-y-auto divide-y divide-[#E8E7E1]">
              {results.length === 0 && !searching && (
                <div className="p-6 text-center space-y-1">
                  <BookOpen className="w-6 h-6 text-[#687387] mx-auto opacity-50" />
                  <p className="text-xs font-semibold text-[#14233F]">No results yet</p>
                  <p className="text-[11px] text-[#687387]">
                    Try a topic, a paper title, a DOI or an author name.
                  </p>
                </div>
              )}
              {results.map((paper) => (
                <div key={paper.id} className="p-3 hover:bg-[#FAF9F5]/60 transition-colors">
                  <button className="text-left w-full space-y-1" onClick={() => openPaper(paper.id)}>
                    <div className="text-[11.5px] font-bold text-[#14233F] leading-snug line-clamp-2">
                      {paper.title}
                    </div>
                    <div className="text-[10px] text-[#687387] line-clamp-1">{paper.authors}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] font-mono text-[#687387]">
                      <span className="px-1.5 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1]">
                        {paper.year || 'year n/a'}
                      </span>
                      {paper.journal && <span className="truncate max-w-[140px]">{paper.journal}</span>}
                      {typeof paper.citation_count === 'number' && (
                        <span>{paper.citation_count} citations</span>
                      )}
                      {paper.is_open_access && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          OA
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9.5px] font-mono text-[#687387] truncate max-w-[55%]">
                      {paper.doi ? `doi:${paper.doi}` : 'No DOI in record'}
                    </span>
                    <div className="flex items-center gap-1">
                      {seedPaperIds.has(paper.id) ? (
                        <span className="text-[9.5px] font-mono text-emerald-700 flex items-center gap-1">
                          <Check className="w-3 h-3" /> seed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddSeed(paper)}
                          className="text-[9.5px] font-bold text-[#3268BB] hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add seed
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: network + related lists */}
        <div className="xl:col-span-8 space-y-5">
          <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#14233F] flex items-center gap-2">
                  <Network className="w-4 h-4 text-[#3268BB]" />
                  Citation network
                </h3>
                <p className="text-[11px] text-[#687387]">
                  Solid arrows are real citation links. Dotted lines are co-citations.
                  Dashed lavender links are similarity recommendations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTableView((v) => !v)}
                  className="px-2.5 py-1.5 rounded-lg border border-[#E8E7E1] bg-white text-[10px] font-bold text-[#14233F] hover:bg-[#FAF9F5] flex items-center gap-1"
                >
                  {tableView ? <Network className="w-3 h-3" /> : <Table2 className="w-3 h-3" />}
                  {tableView ? 'Map view' : 'List view'}
                </button>
              </div>
            </div>

            {graph?.demo && (
              <div className="px-3 py-2 rounded-lg bg-[#FFF3D8]/30 border border-[#FFF3D8] text-[11px] text-[#14233F] flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <b>DEMO DATA.</b> This bundled network uses the documented reference list of
                  the benchmark BMJ review and the trials it discusses. It is not the result of
                  your own search.
                </span>
              </div>
            )}

            {networkError && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {networkError}
              </div>
            )}

            {graph && graph.warnings.length > 0 && (
              <details className="px-3 py-2 rounded-lg bg-[#FAF9F5] border border-[#E8E7E1] text-[10.5px] text-[#687387]">
                <summary className="cursor-pointer font-semibold text-[#14233F]">
                  Data source notices ({graph.warnings.length})
                </summary>
                <ul className="mt-1.5 space-y-1 list-disc pl-4">
                  {graph.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}

            {tableView ? (
              <div className="overflow-x-auto border border-[#E8E7E1] rounded-xl">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[#FAF9F5] text-[9.5px] uppercase tracking-wider font-mono text-[#687387]">
                    <tr>
                      <th className="px-3 py-2">Publication</th>
                      <th className="px-3 py-2">Year</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E7E1]">
                    {(graph?.nodes || []).map((node) => (
                      <tr key={node.id} className="hover:bg-[#FAF9F5]/60">
                        <td className="px-3 py-2">
                          <button
                            onClick={() => openPaper(node.id)}
                            className="text-left font-semibold text-[#14233F] hover:text-[#3268BB] line-clamp-2"
                          >
                            {node.title}
                          </button>
                          <div className="text-[10px] text-[#687387] line-clamp-1">{node.authors}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]">{node.year || '—'}</td>
                        <td className="px-3 py-2">
                          <span className="text-[9.5px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1]">
                            {node.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => openPaper(node.id)}
                            className="text-[10px] font-bold text-[#3268BB] hover:underline"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!graph?.nodes.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-[#687387]">
                          Build a network to populate this table.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : graph ? (
              <ResearchNetworkMap graph={graph} selectedId={selected?.id} onSelect={openPaper} />
            ) : (
              <div className="rounded-2xl border border-dashed border-[#E8E7E1] bg-[#FAF9F5] p-10 text-center">
                <GitBranch className="w-7 h-7 text-[#687387] mx-auto mb-2" />
                <p className="text-sm font-bold text-[#14233F]">No network loaded</p>
                <p className="text-[11px] text-[#687387] mt-1 max-w-sm mx-auto">
                  Add a seed paper and press <b>Build network</b>, or load the bundled demo
                  network to explore a documented citation graph.
                </p>
              </div>
            )}
          </div>

          {/* Selected paper details */}
          {selected && (
            <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle">
              <div className="p-5 border-b border-[#E8E7E1] space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="text-[9.5px] font-mono uppercase tracking-wider text-[#3268BB] font-bold">
                        Publication details
                      </span>
                      {seedPaperIds.has(selected.id) && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#FFF3D8]/50 border border-[#FFF3D8]">
                          seed paper
                        </span>
                      )}
                      {selected.is_open_access && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          open access
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[#14233F] leading-snug">{selected.title}</h3>
                    <p className="text-[11px] text-[#687387] mt-1">{selected.authors}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-[#687387] mt-1.5">
                      <span>{selected.year || 'year n/a'}</span>
                      <span>{selected.journal || 'journal not listed'}</span>
                      {selected.doi && <span>doi:{selected.doi}</span>}
                      {typeof selected.citation_count === 'number' && (
                        <span>{selected.citation_count} citations</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelected(null);
                      setRelated({ references: [], citations: [], similar: [] });
                    }}
                    className="p-1.5 rounded-lg text-[#687387] hover:bg-[#FAF9F5]"
                    title="Close details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    onClick={() => handleAddSeed(selected)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#FFF3D8] text-[#14233F] text-[10.5px] font-bold hover:bg-[#cbe665] flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add to seeds
                  </button>
                  <button
                    onClick={() => setDetailTab('references')}
                    className="px-2.5 py-1.5 rounded-lg border border-[#E8E7E1] text-[10.5px] font-semibold hover:bg-[#FAF9F5] flex items-center gap-1"
                  >
                    <BookOpen className="w-3 h-3" /> References
                  </button>
                  <button
                    onClick={() => setDetailTab('citations')}
                    className="px-2.5 py-1.5 rounded-lg border border-[#E8E7E1] text-[10.5px] font-semibold hover:bg-[#FAF9F5] flex items-center gap-1"
                  >
                    <GitBranch className="w-3 h-3" /> Cited by
                  </button>
                  <button
                    onClick={() => setDetailTab('similar')}
                    className="px-2.5 py-1.5 rounded-lg border border-[#E8E7E1] text-[10.5px] font-semibold hover:bg-[#FAF9F5] flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Similar
                  </button>
                  {selected.url && (
                    <a
                      href={selected.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-lg border border-[#E8E7E1] text-[10.5px] font-semibold hover:bg-[#FAF9F5] flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Open paper
                    </a>
                  )}
                  {onSendToAudit && (
                    <button
                      onClick={() => onSendToAudit(selected)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#14233F] text-white text-[10.5px] font-bold hover:bg-[#3268BB] flex items-center gap-1"
                    >
                      <FilePlus2 className="w-3 h-3" /> Send to CiteVerify audit
                    </button>
                  )}
                </div>

                {/* Save to collection */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E8E7E1]">
                  <BookmarkPlus className="w-3.5 h-3.5 text-[#687387]" />
                  <select
                    value={targetCollection}
                    onChange={(e) => setTargetCollection(e.target.value)}
                    className="px-2 py-1.5 text-[10.5px] rounded-lg border border-[#E8E7E1] bg-white outline-none"
                  >
                    <option value="">Select collection…</option>
                    {collections.map((coll) => (
                      <option key={coll.id} value={coll.id}>
                        {coll.name} ({coll.paper_count})
                      </option>
                    ))}
                  </select>
                  <input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="or new collection name"
                    className="px-2 py-1.5 text-[10.5px] rounded-lg border border-[#E8E7E1] outline-none w-44"
                  />
                  <button
                    onClick={handleSaveToCollection}
                    disabled={savingPaper}
                    className="px-2.5 py-1.5 rounded-lg bg-[#3268BB] text-white text-[10.5px] font-bold disabled:opacity-60"
                  >
                    Save paper
                  </button>
                  {targetCollection && onOpenCollection && (
                    <button
                      onClick={() => onOpenCollection(targetCollection)}
                      className="text-[10px] font-semibold text-[#3268BB] hover:underline"
                    >
                      Open collection
                    </button>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-3">
                {selected.abstract ? (
                  <p className="text-[11.5px] font-serif leading-relaxed text-[#2D3748]">
                    {selected.abstract.slice(0, 1400)}
                    {selected.abstract.length > 1400 ? '…' : ''}
                  </p>
                ) : (
                  <p className="text-[11px] text-[#687387] italic">
                    No abstract is available from the scholarly record for this publication.
                  </p>
                )}

                {selected.topics && selected.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.topics.map((topic) => (
                      <span
                        key={topic}
                        className="text-[9.5px] px-1.5 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1] text-[#687387]"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-[#E8E7E1]">
                  <div className="flex flex-wrap items-center gap-1 mb-2">
                    {(['references', 'citations', 'similar'] as Tab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setDetailTab(tab)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-semibold ${
                          detailTab === tab
                            ? 'bg-[#14233F] text-white'
                            : 'text-[#687387] hover:bg-[#FAF9F5]'
                        }`}
                      >
                        {RELATION_LABEL[tab]} ({related[tab].length})
                      </button>
                    ))}
                  </div>

                  {detailTab === 'similar' && (
                    <p className="text-[10px] text-[#687387] mb-2 flex items-start gap-1">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />
                      Recommendations come from OpenAlex related-work data. Similarity is not
                      evidence that two papers support the same claim.
                    </p>
                  )}

                  {detailLoading ? (
                    <div className="py-6 text-center text-[11px] text-[#687387] flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading records…
                    </div>
                  ) : related[detailTab].length === 0 ? (
                    <p className="py-4 text-[11px] text-[#687387] italic">
                      No {detailTab === 'citations' ? 'citing works' : detailTab} are available
                      for this record from the scholarly APIs.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E8E7E1] max-h-72 overflow-y-auto">
                      {related[detailTab].map((paper) => (
                        <div key={paper.id} className="py-2 flex items-start justify-between gap-2">
                          <button className="text-left min-w-0" onClick={() => openPaper(paper.id)}>
                            <div className="text-[11px] font-semibold text-[#14233F] line-clamp-2">
                              {paper.title}
                            </div>
                            <div className="text-[10px] text-[#687387]">
                              {paper.authors?.slice(0, 90)} · {paper.year}
                              {paper.journal ? ` · ${paper.journal}` : ''}
                            </div>
                            {paper.relationship_basis && (
                              <div className="text-[9.5px] text-[#687387] font-mono mt-0.5">
                                basis: {paper.relationship_basis}
                              </div>
                            )}
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleAddSeed(paper)}
                              title="Use as seed"
                              className="p-1 rounded text-[#687387] hover:text-[#3268BB] hover:bg-[#FAF9F5]"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openPaper(paper.id)}
                              title="Open details"
                              className="p-1 rounded text-[#687387] hover:text-[#14233F] hover:bg-[#FAF9F5]"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {warnings.length > 0 && (
                  <details className="text-[10px] text-[#687387]">
                    <summary className="cursor-pointer font-semibold text-[#14233F]">
                      Source notices
                    </summary>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                      {warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
