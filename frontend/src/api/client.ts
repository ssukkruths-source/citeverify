import {
  Audit,
  AuthorDetailResponse,
  AuthorSummary,
  Claim,
  CollectionPaper,
  DashboardData,
  DiscoveryMetrics,
  NetworkGraph,
  PlatformSettings,
  Reference,
  ResearchCollection,
  ResearchPaper,
  ResearchSeed,
  SearchResponse,
} from '../types';
import { deleteOwnedRows, deletePrivatePdf, getAccessToken, getOwnedAuditPayload, uploadPrivatePdf, upsertOwnedRows } from '../lib/supabase';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const auditSyncs = new Map<string, Promise<Audit>>();

export function backendUrl(path: string): string {
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function syncUserRecord(entityType: 'setting' | 'seed' | 'collection' | 'collection_paper' | 'network' | 'alert' | 'project', recordId: string, payload: unknown, parentId: string | null = null) {
  await upsertOwnedRows('cv_user_records', [{ entity_type: entityType, record_id: recordId, parent_id: parentId, payload, updated_at: new Date().toISOString() }], 'owner_id,entity_type,record_id');
}

async function removeUserRecord(entityType: string, recordId: string) {
  await deleteOwnedRows('cv_user_records', { entity_type: `eq.${entityType}`, record_id: `eq.${recordId}` });
}

async function syncAuditRecord(audit: Audit): Promise<Audit> {
  const existing = await getOwnedAuditPayload(audit.id);
  const storageKey = `citeverify.storage-path.${audit.id}`;
  let storagePath = (existing?.storage_path as string | undefined) || localStorage.getItem(storageKey) || undefined;
  if (!storagePath && audit.pdf_path && !audit.is_demo) {
    try {
      const pdfResponse = await fetch(backendUrl(`/${audit.pdf_path}`), { headers: { Authorization: `Bearer ${await getAccessToken()}` } });
      if (pdfResponse.ok) {
        const blob = await pdfResponse.blob();
        storagePath = await uploadPrivatePdf(new File([blob], `${audit.id}.pdf`, { type: 'application/pdf' }), audit.id);
        localStorage.setItem(storageKey, storagePath);
      }
    } catch (error) {
      console.warn(`Could not copy legacy PDF ${audit.id} to private cloud storage:`, error);
    }
  }
  const { pdf_path: _localPath, ...safeAudit } = audit;
  const payload = { ...safeAudit, ...(storagePath ? { storage_path: storagePath } : {}) };
  await upsertOwnedRows('cv_audits', [{ audit_id: audit.id, payload, updated_at: new Date().toISOString() }], 'owner_id,audit_id');
  return { ...audit, ...(storagePath ? { storage_path: storagePath } : {}) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(backendUrl(path), { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* keep status text */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/* ----------------------------- audits ----------------------------- */

export async function fetchAudits(): Promise<Audit[]> {
  const audits = await request<Audit[]>('/api/audits');
  return Promise.all(audits.map(syncAuditRecord));
}

export async function fetchAudit(auditId: string): Promise<Audit> {
  const existingSync = auditSyncs.get(auditId);
  if (existingSync) return existingSync;
  const sync = (async () => {
    const audit = await request<Audit>(`/api/audits/${auditId}`);
    const syncedAudit = await syncAuditRecord(audit);
    const findings = audit.consistency_findings || [];
    await deleteOwnedRows('cv_consistency_findings', { audit_id: `eq.${auditId}` });
    await upsertOwnedRows('cv_consistency_findings', findings.map((finding) => ({ audit_id: auditId, finding_id: finding.id, payload: { ...finding }, updated_at: new Date().toISOString() })), 'owner_id,audit_id,finding_id');
    return syncedAudit;
  })();
  auditSyncs.set(auditId, sync);
  try { return await sync; } finally { auditSyncs.delete(auditId); }
}

export async function fetchClaims(auditId: string): Promise<Claim[]> {
  await fetchAudit(auditId);
  const claims = await request<Claim[]>(`/api/audits/${auditId}/claims`);
  await deleteOwnedRows('cv_claims', { audit_id: `eq.${auditId}` });
  await upsertOwnedRows('cv_claims', claims.map((claim) => ({ audit_id: auditId, claim_id: claim.id, payload: claim, updated_at: new Date().toISOString() })), 'owner_id,audit_id,claim_id');
  const feedback = await request<{ claim_id: string; audit_id: string; [key: string]: unknown }[]>(`/api/audits/${auditId}/feedback`);
  await upsertOwnedRows('cv_claim_feedback', feedback.map((item) => ({ audit_id: auditId, claim_id: item.claim_id, payload: item, updated_at: String(item.updated_at || new Date().toISOString()) })), 'owner_id,audit_id,claim_id');
  return claims;
}

export async function submitClaimFeedback(auditId: string, claimId: string, correctedVerdict: Claim['verdict'], rationale = ''): Promise<{
  learning: { training_examples: number; verdict_counts: Record<string, number>; trained: boolean; message: string };
  suggestion: { verdict: Claim['verdict']; confidence: number; training_examples: number; method: string } | null;
  saved_verdict: Claim['verdict'];
}> {
  const result = await request<{ learning: { training_examples: number; verdict_counts: Record<string, number>; trained: boolean; message: string }; suggestion: { verdict: Claim['verdict']; confidence: number; training_examples: number; method: string } | null; saved_verdict: Claim['verdict'] }>(`/api/claims/${encodeURIComponent(claimId)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ corrected_verdict: correctedVerdict, rationale }),
  });
  await fetchClaims(auditId);
  await upsertOwnedRows('cv_claim_feedback', [{ audit_id: auditId, claim_id: claimId, payload: { corrected_verdict: correctedVerdict, rationale, saved_at: new Date().toISOString() }, updated_at: new Date().toISOString() }], 'owner_id,audit_id,claim_id');
  return result;
}

export async function fetchReferences(auditId: string): Promise<Reference[]> {
  await fetchAudit(auditId);
  const references = await request<Reference[]>(`/api/audits/${auditId}/references`);
  await deleteOwnedRows('cv_references', { audit_id: `eq.${auditId}` });
  await upsertOwnedRows('cv_references', references.map((reference) => ({ audit_id: auditId, reference_id: reference.id, payload: reference, updated_at: new Date().toISOString() })), 'owner_id,audit_id,reference_id');
  return references;
}

export async function fetchAuditPage(
  auditId: string,
  page: number,
): Promise<{ page_number: number; total_pages: number; text: string; claims: Claim[] }> {
  return request(`/api/audits/${auditId}/pages/${page}`);
}

export async function uploadPdf(file: File): Promise<{ audit_id: string; filename: string; message: string }> {
  const sessionToken = await getAccessToken();
  const formData = new FormData();
  formData.append('file', file);
  const result = await request<{ audit_id: string; filename: string; message: string }>('/api/upload', { method: 'POST', body: formData });
  try {
    const storagePath = await uploadPrivatePdf(file, result.audit_id);
    localStorage.setItem(`citeverify.storage-path.${result.audit_id}`, storagePath);
  } catch (error) {
    // The local API created the audit first. Remove it if its private cloud
    // copy cannot be secured, rather than reporting a successful upload.
    const headers = new Headers({ Authorization: `Bearer ${sessionToken}` });
    await fetch(backendUrl(`/api/audits/${result.audit_id}`), { method: 'DELETE', headers }).catch(() => undefined);
    throw error;
  }
  return result;
}

export async function loadSampleAudit(): Promise<{ audit_id: string; message: string; demo: boolean }> {
  return request('/api/sample-audit', { method: 'POST' });
}

export async function deleteAudit(auditId: string): Promise<void> {
  const payload = await getOwnedAuditPayload(auditId);
  if (payload?.storage_path) await deletePrivatePdf(payload.storage_path as string);
  await deleteOwnedRows('cv_audits', { audit_id: `eq.${auditId}` });
  localStorage.removeItem(`citeverify.storage-path.${auditId}`);
  await request(`/api/audits/${auditId}`, { method: 'DELETE' });
}

export async function reprocessAudit(auditId: string): Promise<void> {
  await request(`/api/audits/${auditId}/reprocess`, { method: 'POST' });
}

export async function fetchSettings(): Promise<PlatformSettings> {
  const settings = await request<PlatformSettings>('/api/settings');
  await upsertOwnedRows('cv_user_records', Object.entries(settings).map(([key, value]) => ({ entity_type: 'setting', record_id: key, payload: { key, value }, updated_at: new Date().toISOString() })), 'owner_id,entity_type,record_id');
  return settings;
}

export async function updateSettings(settings: Partial<PlatformSettings>): Promise<void> {
  await request('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  await upsertOwnedRows('cv_user_records', Object.entries(settings).map(([key, value]) => ({ entity_type: 'setting', record_id: key, payload: { key, value }, updated_at: new Date().toISOString() })), 'owner_id,entity_type,record_id');
}

export function getReportDownloadUrl(auditId: string): string {
  return backendUrl(`/api/audits/${auditId}/report`);
}

export async function runCleanup(): Promise<{ removed: string[]; count: number; retention_days: number }> {
  return request('/api/maintenance/cleanup', { method: 'POST' });
}

export async function fetchDashboard(): Promise<DashboardData> {
  return request<DashboardData>('/api/dashboard');
}

/* --------------------------- discovery ---------------------------- */

export async function searchResearch(params: {
  q: string;
  page?: number;
  per_page?: number;
  year_from?: string;
  year_to?: string;
  is_oa?: string;
  work_type?: string;
  min_citations?: string;
  author?: string;
  sort?: string;
}): Promise<SearchResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'any') {
      query.set(key, String(value));
    }
  });
  return request<SearchResponse>(`/api/discovery/search?${query.toString()}`);
}

export async function fetchPaper(paperId: string): Promise<{
  paper: ResearchPaper;
  references: ResearchPaper[];
  citations: ResearchPaper[];
  similar: ResearchPaper[];
  authors: { id: string; name: string; affiliation?: string; position?: string }[];
  warnings: string[];
}> {
  return request(`/api/discovery/papers/${encodeURIComponent(paperId)}`);
}

export async function fetchPaperReferences(paperId: string): Promise<{ results: ResearchPaper[]; warnings: string[] }> {
  return request(`/api/discovery/papers/${encodeURIComponent(paperId)}/references`);
}

export async function fetchPaperCitations(paperId: string): Promise<{ results: ResearchPaper[]; warnings: string[] }> {
  return request(`/api/discovery/papers/${encodeURIComponent(paperId)}/citations`);
}

export async function fetchPaperSimilar(paperId: string): Promise<{ results: ResearchPaper[]; warnings: string[] }> {
  return request(`/api/discovery/papers/${encodeURIComponent(paperId)}/similar`);
}

export async function fetchSeeds(): Promise<ResearchSeed[]> {
  const seeds = await request<ResearchSeed[]>('/api/discovery/seeds');
  await Promise.all(seeds.map((seed) => syncUserRecord('seed', seed.id, seed)));
  return seeds;
}

export async function addSeed(paperId: string, note = ''): Promise<ResearchSeed> {
  const seed = await request<ResearchSeed>('/api/discovery/seeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paper_id: paperId, note }),
  });
  await syncUserRecord('seed', seed.id, seed);
  return seed;
}

export async function removeSeed(seedId: string): Promise<void> {
  await request(`/api/discovery/seeds/${encodeURIComponent(seedId)}`, { method: 'DELETE' });
  await removeUserRecord('seed', seedId);
}

export async function buildNetwork(payload: {
  seed_ids: string[];
  include_references: boolean;
  include_citations: boolean;
  include_similar: boolean;
  max_nodes?: number;
}): Promise<NetworkGraph> {
  const network = await request<NetworkGraph>('/api/discovery/network', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (network.network_id) await syncUserRecord('network', network.network_id, network);
  return network;
}

export async function fetchDemoNetwork(): Promise<NetworkGraph> {
  return request('/api/discovery/demo-network');
}

export async function fetchNetwork(networkId: string): Promise<NetworkGraph> {
  const network = await request<NetworkGraph>(`/api/discovery/network/${networkId}`);
  if (network.network_id) await syncUserRecord('network', network.network_id, network);
  return network;
}

export async function fetchCollections(): Promise<{ collections: ResearchCollection[] }> {
  const result = await request<{ collections: ResearchCollection[] }>('/api/discovery/collections');
  await Promise.all(result.collections.map((collection) => syncUserRecord('collection', collection.id, collection)));
  return result;
}

export async function createCollection(name: string, description = ''): Promise<ResearchCollection> {
  const collection = await request<ResearchCollection>('/api/discovery/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  await syncUserRecord('collection', collection.id, collection);
  return collection;
}

export async function updateCollection(
  id: string,
  payload: { name?: string; description?: string },
): Promise<void> {
  await request(`/api/discovery/collections/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await request<{ collections: ResearchCollection[] }>('/api/discovery/collections');
  const collection = result.collections.find((item) => item.id === id);
  if (collection) await syncUserRecord('collection', id, collection);
}

export async function deleteCollection(id: string): Promise<void> {
  await request(`/api/discovery/collections/${id}`, { method: 'DELETE' });
  await deleteOwnedRows('cv_user_records', { entity_type: 'eq.collection_paper', parent_id: `eq.${id}` });
  await removeUserRecord('collection', id);
}

export async function fetchCollection(
  id: string,
): Promise<{ collection: ResearchCollection; papers: CollectionPaper[] }> {
  const result = await request<{ collection: ResearchCollection; papers: CollectionPaper[] }>(`/api/discovery/collections/${id}`);
  await syncUserRecord('collection', id, result.collection);
  await Promise.all(result.papers.map((paper) => syncUserRecord('collection_paper', `${id}:${paper.paper_id}`, paper, id)));
  return result;
}

export async function addPaperToCollection(
  collectionId: string,
  paperId: string,
  note = '',
): Promise<void> {
  await request(`/api/discovery/collections/${collectionId}/papers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paper_id: paperId, note }),
  });
  await fetchCollection(collectionId);
}

export async function removePaperFromCollection(collectionId: string, paperId: string): Promise<void> {
  await request(
    `/api/discovery/collections/${collectionId}/papers/${encodeURIComponent(paperId)}`,
    { method: 'DELETE' },
  );
  await removeUserRecord('collection_paper', `${collectionId}:${paperId}`);
}

export async function savePaperNote(collectionId: string, paperId: string, note: string): Promise<void> {
  await request(
    `/api/discovery/collections/${collectionId}/papers/${encodeURIComponent(paperId)}/note`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    },
  );
  await fetchCollection(collectionId);
}

export async function fetchTimeline(ids: string[]): Promise<{
  timeline: { year: string; papers: ResearchPaper[] }[];
  total: number;
}> {
  const query = ids.length ? `?ids=${encodeURIComponent(ids.join(','))}` : '';
  return request(`/api/discovery/timeline${query}`);
}

export async function searchAuthors(q: string): Promise<{ results: AuthorSummary[]; warnings: string[] }> {
  return request(`/api/discovery/authors?q=${encodeURIComponent(q)}`);
}

export async function fetchAuthor(authorId: string): Promise<AuthorDetailResponse> {
  return request(`/api/discovery/authors/${encodeURIComponent(authorId)}`);
}

export async function fetchSavedPapers(): Promise<{ papers: ResearchPaper[]; total: number }> {
  return request('/api/discovery/saved');
}

export async function fetchDiscoveryMetrics(): Promise<DiscoveryMetrics> {
  const dashboard = await fetchDashboard();
  return dashboard.discovery;
}
