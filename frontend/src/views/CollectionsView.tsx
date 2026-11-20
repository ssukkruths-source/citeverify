import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  Check,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  createCollection,
  deleteCollection,
  fetchCollection,
  fetchCollections,
  removePaperFromCollection,
  savePaperNote,
  updateCollection,
} from '../api/client';
import { CollectionPaper, ResearchCollection } from '../types';

interface CollectionsViewProps {
  initialCollectionId?: string | null;
  onUseSeed?: (paperId: string) => void;
  onInspectPaper?: (paperId: string) => void;
  onExploreResearch?: () => void;
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  initialCollectionId,
  onUseSeed,
  onInspectPaper,
  onExploreResearch,
}) => {
  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialCollectionId || null);
  const [papers, setPapers] = useState<CollectionPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [papersLoading, setPapersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ResearchCollection | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ResearchCollection | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ paperId: string; note: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCollections();
      setCollections(data.collections);
      setError(null);
      if (!activeId && data.collections.length) {
        setActiveId(data.collections[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Collections could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  const loadPapers = useCallback(async (collectionId: string) => {
    setPapersLoading(true);
    try {
      const data = await fetchCollection(collectionId);
      setPapers(data.papers || []);
    } catch (err: any) {
      setError(err.message || 'Collection contents could not be loaded.');
      setPapers([]);
    } finally {
      setPapersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) loadPapers(activeId);
  }, [activeId, loadPapers]);

  useEffect(() => {
    if (initialCollectionId) setActiveId(initialCollectionId);
  }, [initialCollectionId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeCollection = collections.find((c) => c.id === activeId) || null;

  const filteredPapers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return papers;
    return papers.filter((item) => {
      const paper = item.paper;
      if (!paper) return false;
      return `${paper.title} ${paper.authors} ${paper.journal} ${paper.doi} ${item.note}`.toLowerCase().includes(term);
    });
  }, [papers, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await createCollection(newName.trim(), newDescription.trim());
      setNewName('');
      setNewDescription('');
      await loadCollections();
      setActiveId(created.id);
      setToast('Collection created');
    } catch (err: any) {
      setError(err.message || 'Could not create collection');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renaming || !renameValue.trim()) return;
    try {
      await updateCollection(renaming.id, { name: renameValue.trim() });
      setRenaming(null);
      setRenameValue('');
      await loadCollections();
      setToast('Collection renamed');
    } catch (err: any) {
      setError(err.message || 'Could not rename collection');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCollection(deleteTarget.id);
      setDeleteTarget(null);
      if (activeId === deleteTarget.id) setActiveId(null);
      await loadCollections();
      setToast('Collection deleted');
    } catch (err: any) {
      setError(err.message || 'Could not delete collection');
    }
  };

  const handleRemovePaper = async (paperId: string) => {
    if (!activeId) return;
    try {
      await removePaperFromCollection(activeId, paperId);
      await loadPapers(activeId);
      await loadCollections();
      setToast('Publication removed');
    } catch (err: any) {
      setError(err.message || 'Could not remove publication');
    }
  };

  const handleSaveNote = async () => {
    if (!activeId || !noteDraft) return;
    try {
      await savePaperNote(activeId, noteDraft.paperId, noteDraft.note);
      setNoteDraft(null);
      await loadPapers(activeId);
      setToast('Note saved');
    } catch (err: any) {
      setError(err.message || 'Could not save note');
    }
  };

  return (
    <div className="p-5 sm:p-8 max-w-[1400px] mx-auto space-y-6 font-sans">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#14233F] text-white text-xs font-semibold shadow-floating flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-[#FFF3D8]" />
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#E8E7E1]">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
            Persistent research library
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
            Collections
          </h1>
          <p className="text-sm text-[#687387] mt-1 max-w-2xl">
            Organise discovered publications into literature-review collections, add
            notes, and reuse any saved paper as a network seed.
          </p>
        </div>
        {onExploreResearch && (
          <button
            onClick={onExploreResearch}
            className="px-4 py-2 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Discover more research
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-amber-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 space-y-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle p-4 space-y-2.5">
            <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-[#14233F] flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-[#3268BB]" />
              New collection
            </h3>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Collection name"
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-[#E8E7E1] outline-none focus:border-[#3268BB]"
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Short description (optional)"
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-[#E8E7E1] outline-none focus:border-[#3268BB]"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="w-full px-3 py-2 rounded-lg bg-[#3268BB] text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create collection
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8E7E1] text-xs font-mono uppercase tracking-wider font-bold text-[#14233F]">
              Your collections ({collections.length})
            </div>
            {loading ? (
              <div className="p-6 text-center text-xs text-[#687387] flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : collections.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <BookMarked className="w-6 h-6 text-[#687387] mx-auto opacity-50" />
                <p className="text-xs font-semibold text-[#14233F]">No collections yet</p>
                <p className="text-[11px] text-[#687387]">
                  Create one above, then save publications from Research Discovery.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E8E7E1]">
                {collections.map((coll) => (
                  <div
                    key={coll.id}
                    className={`p-3 transition-colors ${
                      activeId === coll.id ? 'bg-indigo-50/60' : 'hover:bg-[#FAF9F5]/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button className="text-left min-w-0 flex-1" onClick={() => setActiveId(coll.id)}>
                        <div className="text-[12px] font-bold text-[#14233F] truncate">{coll.name}</div>
                        <div className="text-[10px] text-[#687387] font-mono mt-0.5">
                          {coll.paper_count} paper{coll.paper_count === 1 ? '' : 's'}
                          {coll.description ? ` · ${coll.description.slice(0, 42)}` : ''}
                        </div>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => {
                            setRenaming(coll);
                            setRenameValue(coll.name);
                          }}
                          className="p-1 rounded text-[#687387] hover:text-[#14233F] hover:bg-white"
                          title="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(coll)}
                          className="p-1 rounded text-[#687387] hover:text-rose-600 hover:bg-white"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8 bg-white rounded-2xl border border-[#E8E7E1] shadow-subtle">
          <div className="p-4 border-b border-[#E8E7E1] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#14233F]">
                  {activeCollection ? activeCollection.name : 'Select a collection'}
                </h3>
                <p className="text-[11px] text-[#687387]">
                  {activeCollection?.description ||
                    'Saved publications keep their real scholarly metadata and identifiers.'}
                </p>
              </div>
              {activeCollection && (
                <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-[#FAF9F5] border border-[#E8E7E1] text-[#687387]">
                  {papers.length} saved
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#687387] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search saved publications by title, author, DOI or note"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-[#E8E7E1] bg-[#FAF9F5]/50 outline-none focus:bg-white focus:border-[#3268BB]"
              />
            </div>
          </div>

          {!activeCollection ? (
            <div className="p-10 text-center space-y-2">
              <BookMarked className="w-7 h-7 text-[#687387] mx-auto opacity-50" />
              <p className="text-sm font-bold text-[#14233F]">Nothing selected</p>
              <p className="text-[11px] text-[#687387]">
                Choose a collection on the left to view its saved publications.
              </p>
            </div>
          ) : papersLoading ? (
            <div className="p-10 text-center text-xs text-[#687387] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading saved publications…
            </div>
          ) : filteredPapers.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <BookMarked className="w-7 h-7 text-[#687387] mx-auto opacity-50" />
              <p className="text-sm font-bold text-[#14233F]">
                {papers.length ? 'No publications match this search' : 'This collection is empty'}
              </p>
              <p className="text-[11px] text-[#687387]">
                {papers.length
                  ? 'Clear the search to see all saved publications.'
                  : 'Find a publication in Research Discovery and save it to this collection.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E8E7E1]">
              {filteredPapers.map((item) => {
                const paper = item.paper;
                if (!paper) return null;
                const isEditingNote = noteDraft?.paperId === item.paper_id;
                return (
                  <div key={item.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-bold text-[#14233F] leading-snug">
                          {paper.title}
                        </div>
                        <div className="text-[10.5px] text-[#687387] mt-0.5">{paper.authors}</div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9.5px] font-mono text-[#687387] mt-1">
                          <span>{paper.year || 'year n/a'}</span>
                          {paper.journal && <span>{paper.journal}</span>}
                          {paper.doi ? <span>doi:{paper.doi}</span> : <span>no DOI</span>}
                          {paper.is_open_access && (
                            <span className="px-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">
                              OA
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {paper.oa_url && (
                          <a
                            href={paper.oa_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-semibold text-[#3268BB] hover:underline"
                          >
                            Open access
                          </a>
                        )}
                        <button
                          onClick={() => onInspectPaper?.(paper.id)}
                          className="text-[10px] font-semibold text-[#14233F] hover:text-[#3268BB] flex items-center gap-0.5"
                        >
                          Details <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {paper.abstract && (
                      <p className="text-[11px] text-[#4B5563] font-serif leading-relaxed line-clamp-3">
                        {paper.abstract}
                      </p>
                    )}

                    {item.note && !isEditingNote && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#E8E7E1] text-[10.5px] text-[#4B5563]">
                        <span className="font-semibold text-[#14233F]">Note: </span>
                        {item.note}
                      </div>
                    )}

                    {isEditingNote ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={noteDraft.note}
                          onChange={(e) => setNoteDraft({ ...noteDraft, note: e.target.value })}
                          rows={2}
                          placeholder="Why does this paper matter for your review?"
                          className="w-full px-2.5 py-2 text-[11px] rounded-lg border border-[#E8E7E1] outline-none focus:border-[#3268BB]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSaveNote}
                            className="px-2.5 py-1 rounded-lg bg-[#14233F] text-white text-[10px] font-bold"
                          >
                            Save note
                          </button>
                          <button
                            onClick={() => setNoteDraft(null)}
                            className="text-[10px] font-semibold text-[#687387] hover:text-[#14233F]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={() =>
                            setNoteDraft({ paperId: item.paper_id, note: item.note || '' })
                          }
                          className="text-[10px] font-bold text-[#3268BB] hover:underline"
                        >
                          {item.note ? 'Edit note' : 'Add note'}
                        </button>
                        <span className="text-[#E8E7E1]">|</span>
                        <button
                          onClick={() => onUseSeed?.(item.paper_id)}
                          className="text-[10px] font-bold text-[#3268BB] hover:underline flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" /> Use as seed
                        </button>
                        <span className="text-[#E8E7E1]">|</span>
                        <button
                          onClick={() => handleRemovePaper(item.paper_id)}
                          className="text-[10px] font-semibold text-rose-600 hover:underline ml-auto"
                        >
                          Remove from collection
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rename modal */}
      {renaming && (
        <div className="fixed inset-0 z-50 bg-[#14233F]/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-floating p-5 w-full max-w-sm space-y-3">
            <h3 className="text-sm font-bold text-[#14233F]">Rename collection</h3>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-[#E8E7E1] outline-none focus:border-[#3268BB]"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenaming(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#687387] hover:bg-[#FAF9F5]"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                className="px-3 py-1.5 rounded-lg bg-[#14233F] text-white text-xs font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-[#14233F]/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E8E7E1] shadow-floating p-5 w-full max-w-sm space-y-3">
            <h3 className="text-sm font-bold text-[#14233F]">Delete "{deleteTarget.name}"?</h3>
            <p className="text-[11px] text-[#687387] leading-relaxed">
              This removes the collection and its membership list. The publications
              themselves stay in your library and can be re-added later.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#687387] hover:bg-[#FAF9F5]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
              >
                Delete collection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
