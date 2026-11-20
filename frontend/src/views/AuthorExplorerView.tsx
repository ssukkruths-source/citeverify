import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { fetchAuthor, searchAuthors } from '../api/client';
import { AuthorDetailResponse, AuthorSummary } from '../types';

interface AuthorExplorerViewProps {
  onInspectPaper?: (paperId: string) => void;
  onSeedPaper?: (paperId: string) => void;
}

export const AuthorExplorerView: React.FC<AuthorExplorerViewProps> = ({
  onInspectPaper,
  onSeedPaper,
}) => {
  const [query, setQuery] = useState('');
  const [authors, setAuthors] = useState<AuthorSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuthorDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const runSearch = useCallback(async (term: string) => {
    if (!term.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await searchAuthors(term);
      setAuthors(data.results || []);
      if (data.warnings?.length) setError(data.warnings.join(' '));
      if (!data.results?.length) setError('No researchers matched this name.');
    } catch (err: any) {
      setError(err.message || 'Author search failed.');
      setAuthors([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    // Show the author cache on first load (previously discovered authors).
    (async () => {
      try {
        const data = await searchAuthors('');
        setAuthors(data.results || []);
      } catch {
        /* empty state is fine */
      }
    })();
  }, []);

  const openAuthor = async (authorId: string) => {
    setSelectedId(authorId);
    setDetailLoading(true);
    try {
      const data = await fetchAuthor(authorId);
      setDetail(data);
      if (data.warnings?.length) setError(data.warnings.join(' '));
    } catch (err: any) {
      setError(err.message || 'Author record could not be loaded.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const affiliationList = (value?: string[] | string) => {
    if (!value) return [];
    return Array.isArray(value) ? value : value.split(',').map((v) => v.trim()).filter(Boolean);
  };

  return (
    <div className="p-5 sm:p-8 max-w-[1300px] mx-auto space-y-6 font-sans">
      <div className="pb-5 border-b border-[#E8E7E1]">
        <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
          Researcher graph
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
          Author Explorer
        </h1>
        <p className="text-sm text-[#687387] mt-1 max-w-2xl">
          Explore authors, their publications and co-authorship links. Only affiliations and
          topics reported by the scholarly record are shown.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="flex items-center gap-2 bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-3"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#687387] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a researcher by name (e.g. Ioannidis)"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#E8E7E1] bg-[#FAF9F5]/50 outline-none focus:bg-white focus:border-[#3268BB]"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="px-4 py-2 rounded-lg bg-[#3268BB] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
        >
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Search
        </button>
      </form>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E8E7E1] text-xs font-mono uppercase tracking-wider font-bold text-[#14233F] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#3268BB]" />
            Researchers ({authors.length})
          </div>
          {searching ? (
            <div className="p-8 text-center text-xs text-[#687387] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching…
            </div>
          ) : authors.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <Users className="w-6 h-6 text-[#687387] mx-auto opacity-50" />
              <p className="text-xs font-semibold text-[#14233F]">No researchers yet</p>
              <p className="text-[11px] text-[#687387]">
                Search by name to explore authors from the scholarly index.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E8E7E1] max-h-[560px] overflow-y-auto">
              {authors.map((author) => (
                <button
                  key={author.id}
                  onClick={() => openAuthor(author.id)}
                  className={`w-full text-left p-3 transition-colors ${
                    selectedId === author.id ? 'bg-indigo-50/70' : 'hover:bg-[#FAF9F5]/60'
                  }`}
                >
                  <div className="text-[12px] font-bold text-[#14233F]">{author.name}</div>
                  <div className="text-[9.5px] font-mono text-[#687387] mt-0.5">
                    {author.works_count || 0} works · {author.cited_by_count || 0} citations
                    {author.h_index ? ` · h-index ${author.h_index}` : ''}
                  </div>
                  {affiliationList(author.affiliations).length > 0 && (
                    <div className="text-[9.5px] text-[#687387] mt-0.5 line-clamp-1">
                      {affiliationList(author.affiliations)[0]}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-8 space-y-4">
          {!selectedId ? (
            <div className="p-12 rounded-2xl bg-white border border-[#E8E7E1] text-center space-y-2">
              <Users className="w-7 h-7 text-[#687387] mx-auto opacity-50" />
              <p className="text-sm font-bold text-[#14233F]">Select a researcher</p>
              <p className="text-[11px] text-[#687387] max-w-sm mx-auto">
                Choose an author to see their publications, topics, affiliations and
                co-authorship network.
              </p>
            </div>
          ) : detailLoading ? (
            <div className="p-12 rounded-2xl bg-white border border-[#E8E7E1] text-center text-xs text-[#687387] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading author record…
            </div>
          ) : detail ? (
            <>
              <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-5 space-y-3">
                <h2 className="text-lg font-extrabold text-[#14233F]">
                  {detail.author?.name || 'Author'}
                </h2>
                <div className="flex flex-wrap gap-3 text-[10px] font-mono text-[#687387]">
                  <span className="px-2 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1]">
                    {detail.author?.works_count || 0} works
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1]">
                    {detail.author?.cited_by_count || 0} citations
                  </span>
                  {detail.author?.h_index && (
                    <span className="px-2 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1]">
                      h-index {detail.author.h_index}
                    </span>
                  )}
                  {detail.author?.orcid && (
                    <a
                      href={detail.author.orcid}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1] text-[#3268BB] hover:underline flex items-center gap-1"
                    >
                      ORCID <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                {affiliationList(detail.author?.affiliations).length > 0 && (
                  <div className="flex items-start gap-1.5 text-[11px] text-[#4B5563]">
                    <Building2 className="w-3.5 h-3.5 mt-0.5 text-[#687387] shrink-0" />
                    {affiliationList(detail.author?.affiliations).join(' · ')}
                  </div>
                )}
                {detail.author?.topics && detail.author.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {detail.author.topics.map((t) => (
                      <span
                        key={t}
                        className="text-[9.5px] px-1.5 py-0.5 rounded bg-[#FAF9F5] border border-[#E8E7E1] text-[#687387]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {detail.coauthors.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-4">
                  <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-[#14233F] mb-2">
                    Co-authors
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.coauthors.map((co) => (
                      <button
                        key={co.id}
                        onClick={() => openAuthor(co.id)}
                        className="px-2 py-1 rounded-lg border border-[#E8E7E1] bg-[#FAF9F5]/60 text-[10.5px] text-[#14233F] hover:border-[#3268BB]"
                      >
                        {co.name}
                        <span className="ml-1 font-mono text-[9px] text-[#687387]">
                          ×{co.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle">
                <div className="px-4 py-3 border-b border-[#E8E7E1] text-xs font-mono uppercase tracking-wider font-bold text-[#14233F]">
                  Publications ({detail.publications.length})
                </div>
                {detail.publications.length === 0 ? (
                  <p className="p-6 text-[11px] text-[#687387] italic">
                    No publications are available for this author in the scholarly index.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E8E7E1] max-h-[520px] overflow-y-auto">
                    {detail.publications.map((paper) => (
                      <div key={paper.id} className="p-3.5 flex items-start justify-between gap-3">
                        <button className="text-left min-w-0" onClick={() => onInspectPaper?.(paper.id)}>
                          <div className="text-[11.5px] font-bold text-[#14233F] leading-snug">
                            {paper.title}
                          </div>
                          <div className="text-[9.5px] font-mono text-[#687387] mt-0.5">
                            {paper.year || 'year n/a'}
                            {paper.journal ? ` · ${paper.journal}` : ''}
                            {typeof paper.citation_count === 'number'
                              ? ` · ${paper.citation_count} citations`
                              : ''}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {onSeedPaper && (
                            <button
                              onClick={() => onSeedPaper(paper.id)}
                              title="Use as seed"
                              className="px-1.5 py-1 rounded text-[9.5px] font-bold text-[#3268BB] hover:bg-[#FAF9F5] flex items-center gap-0.5"
                            >
                              <Sparkles className="w-3 h-3" /> Seed
                            </button>
                          )}
                          <button
                            onClick={() => onInspectPaper?.(paper.id)}
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
            </>
          ) : (
            <div className="p-10 rounded-2xl bg-white border border-[#E8E7E1] text-center text-[11px] text-[#687387]">
              Author details are unavailable.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
