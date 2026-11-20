import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { fetchTimeline, fetchSavedPapers } from '../api/client';
import { ResearchPaper } from '../types';

interface ResearchTimelineViewProps {
  onInspectPaper?: (paperId: string) => void;
  onSeedPaper?: (paperId: string) => void;
}

interface YearBucket {
  year: string;
  papers: ResearchPaper[];
}

export const ResearchTimelineView: React.FC<ResearchTimelineViewProps> = ({
  onInspectPaper,
  onSeedPaper,
}) => {
  const [timeline, setTimeline] = useState<YearBucket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromYear, setFromYear] = useState('');
  const [toYear, setToYear] = useState('');
  const [topic, setTopic] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const saved = await fetchSavedPapers();
      const ids = saved.papers.map((p) => p.id);
      const data = await fetchTimeline(ids);
      setTimeline(data.timeline || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Timeline could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allTopics = useMemo(() => {
    const set = new Set<string>();
    timeline.forEach((bucket) =>
      bucket.papers.forEach((paper) => {
        (paper.topics || []).forEach((t) => set.add(t));
      }),
    );
    return Array.from(set).sort().slice(0, 24);
  }, [timeline]);

  const filtered = useMemo(() => {
    const from = fromYear ? parseInt(fromYear, 10) : null;
    const to = toYear ? parseInt(toYear, 10) : null;
    return timeline
      .map((bucket) => {
        const yearNum = parseInt(bucket.year, 10);
        if (from && !Number.isNaN(yearNum) && yearNum < from) return { ...bucket, papers: [] };
        if (to && !Number.isNaN(yearNum) && yearNum > to) return { ...bucket, papers: [] };
        const papers = topic === 'all'
          ? bucket.papers
          : bucket.papers.filter((p) => (p.topics || []).includes(topic));
        return { ...bucket, papers };
      })
      .filter((bucket) => bucket.papers.length > 0);
  }, [timeline, fromYear, toYear, topic]);

  const maxCount = Math.max(1, ...filtered.map((b) => b.papers.length));
  const visibleTotal = filtered.reduce((acc, b) => acc + b.papers.length, 0);
  const oldest = filtered.length ? filtered[0].year : '';
  const newest = filtered.length ? filtered[filtered.length - 1].year : '';

  return (
    <div className="p-5 sm:p-8 max-w-[1300px] mx-auto space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#E8E7E1]">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
            Literature chronology
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
            Research Timeline
          </h1>
          <p className="text-sm text-[#687387] mt-1 max-w-2xl">
            A chronological view of the publications you have discovered, from
            foundational work to the most recent literature.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-xl border border-[#E8E7E1] bg-white text-xs font-bold text-[#14233F] hover:bg-[#FAF9F5] flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Publications', total],
          ['In view', visibleTotal],
          ['Oldest in view', oldest || '—'],
          ['Newest in view', newest || '—'],
        ].map(([label, value]) => (
          <div key={String(label)} className="p-4 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#687387]">{label}</div>
            <div className="text-xl font-extrabold text-[#14233F] mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-3">
        <CalendarRange className="w-3.5 h-3.5 text-[#687387]" />
        <label className="text-[10px] font-mono uppercase text-[#687387] flex items-center gap-1.5">
          From
          <input
            value={fromYear}
            onChange={(e) => setFromYear(e.target.value)}
            placeholder="1990"
            inputMode="numeric"
            className="w-16 px-2 py-1 text-[11px] rounded-md border border-[#E8E7E1] outline-none"
          />
        </label>
        <label className="text-[10px] font-mono uppercase text-[#687387] flex items-center gap-1.5">
          To
          <input
            value={toYear}
            onChange={(e) => setToYear(e.target.value)}
            placeholder="2026"
            inputMode="numeric"
            className="w-16 px-2 py-1 text-[11px] rounded-md border border-[#E8E7E1] outline-none"
          />
        </label>
        <label className="text-[10px] font-mono uppercase text-[#687387] flex items-center gap-1.5">
          Topic
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="px-2 py-1 text-[11px] rounded-md border border-[#E8E7E1] bg-white outline-none max-w-[180px]"
          >
            <option value="all">All topics</option>
            {allTopics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {(fromYear || toYear || topic !== 'all') && (
          <button
            onClick={() => {
              setFromYear('');
              setToYear('');
              setTopic('all');
            }}
            className="text-[10px] font-semibold text-[#3268BB] hover:underline ml-auto"
          >
            Reset filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-14 text-center text-xs text-[#687387] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Building the timeline…
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white border border-[#E8E7E1] text-center space-y-2">
          <CalendarRange className="w-7 h-7 text-[#687387] mx-auto opacity-50" />
          <p className="text-sm font-bold text-[#14233F]">No dated publications yet</p>
          <p className="text-[11px] text-[#687387] max-w-md mx-auto">
            Save publications to a collection in Research Discovery and they will appear
            here by publication year.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-5">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#14233F] font-bold mb-4">
              Research activity by year
            </h3>
            <div className="flex items-end gap-1.5 h-40 overflow-x-auto pb-2">
              {filtered.map((bucket) => (
                <div key={bucket.year} className="flex flex-col items-center gap-1 min-w-[26px]">
                  <span className="text-[9px] font-mono text-[#687387]">{bucket.papers.length}</span>
                  <div
                    className="w-full rounded-t bg-[#3268BB]/80 hover:bg-[#3268BB] transition-colors"
                    style={{ height: `${Math.max(6, (bucket.papers.length / maxCount) * 120)}px` }}
                    title={`${bucket.year}: ${bucket.papers.length} publication(s)`}
                  />
                  <span className="text-[8.5px] font-mono text-[#687387] rotate-0">{bucket.year}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filtered.map((bucket) => (
              <div key={bucket.year} className="relative pl-6">
                <div className="absolute left-0 top-2 bottom-2 w-px bg-[#E8E7E1]" />
                <div className="absolute left-[-4px] top-2 w-2.5 h-2.5 rounded-full bg-[#3268BB] border-2 border-white shadow-sm" />
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-extrabold text-[#14233F]">{bucket.year}</h3>
                  <span className="text-[10px] font-mono text-[#687387] bg-white px-1.5 py-0.5 rounded border border-[#E8E7E1]">
                    {bucket.papers.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {bucket.papers.map((paper) => (
                    <div
                      key={paper.id}
                      className="p-3.5 rounded-xl bg-white border border-[#E8E7E1] shadow-subtle hover:border-[#3268BB] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          className="text-left min-w-0"
                          onClick={() => onInspectPaper?.(paper.id)}
                        >
                          <div className="text-[12px] font-bold text-[#14233F] leading-snug">
                            {paper.title}
                          </div>
                          <div className="text-[10px] text-[#687387] mt-0.5 line-clamp-1">
                            {paper.authors}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] font-mono text-[#687387] mt-1">
                            {paper.journal && <span>{paper.journal}</span>}
                            {paper.doi && <span>doi:{paper.doi}</span>}
                            {typeof paper.citation_count === 'number' && paper.citation_count > 0 && (
                              <span>{paper.citation_count} citations</span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {onSeedPaper && (
                            <button
                              onClick={() => onSeedPaper(paper.id)}
                              title="Use as network seed"
                              className="px-1.5 py-1 rounded text-[9.5px] font-bold text-[#3268BB] hover:bg-[#FAF9F5] flex items-center gap-0.5"
                            >
                              <Sparkles className="w-3 h-3" /> Seed
                            </button>
                          )}
                          <button
                            onClick={() => onInspectPaper?.(paper.id)}
                            className="p-1 rounded text-[#687387] hover:text-[#14233F] hover:bg-[#FAF9F5]"
                            title="Open details"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1] text-[10.5px] text-[#687387]">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Dates come from the scholarly record. Records without a publication year are grouped
        under “Unknown” and are excluded from the year filters.
      </div>
    </div>
  );
};
