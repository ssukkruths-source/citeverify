export type VerdictStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNVERIFIED';

export type AuthenticityStatus =
  | 'VERIFIED'
  | 'POSSIBLE_MATCH'
  | 'MISMATCH'
  | 'UNVERIFIED'
  | 'RETRIEVAL_FAILED';

export type RetrievalLevel = 'full_text' | 'abstract_only' | 'metadata_only' | 'unavailable';

export type MappingStatus = 'MAPPED' | 'AMBIGUOUS' | 'UNMAPPED' | 'mapped' | 'ambiguous' | 'unmapped';

export interface AuditDiagnostics {
  total_detected: number;
  successfully_parsed: number;
  manual_review_needed: number;
  section_detected?: boolean;
  section_heading?: string;
  style?: string;
  unparsed_candidates?: number;
  notes?: string[];
}

export interface AuditSummary {
  claims?: {
    total: number;
    supported: number;
    partial: number;
    contradicted: number;
    insufficient: number;
    unverified: number;
  };
  references?: {
    total: number;
    verified: number;
    possible_match: number;
    mismatch: number;
    unverified: number;
    retrieval_failed: number;
    needs_review?: number;
  };
  retrieval?: {
    full_text: number;
    abstract_only: number;
    metadata_only: number;
    unavailable: number;
  };
  mapping?: { mapped: number; ambiguous: number; unmapped: number };
  diagnostics?: AuditDiagnostics;
  document_consistency?: { total: number; by_type: Record<string, number> };
  reference_issues?: { missing_bibliography_entries: number[]; uncited_bibliography_entries: number[] };
  extraction_warnings?: string[];
}

export interface Audit {
  id: string;
  filename: string;
  title: string;
  authors: string;
  authors_list?: string[];
  affiliations?: string[];
  corresponding_author?: string;
  publication_date?: string;
  abstract: string;
  total_pages: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  current_step: number;
  total_steps: number;
  step_message: string;
  created_at: string;
  pdf_path: string;
  storage_path?: string;
  summary: AuditSummary;
  doi?: string;
  journal?: string;
  year?: string;
  extraction_engine?: string;
  is_demo?: number;
  diagnostics?: AuditDiagnostics;
  consistency_findings?: ConsistencyFinding[];
  diagnostic_log?: { stage: string; detail: string; at: string }[];
}

export interface ConsistencyFinding {
  id: string; finding_type: string; severity: string; title: string;
  explanation: string; evidence: string[]; calculation?: string;
}

export interface Claim {
  id: string;
  audit_id: string;
  claim_text: string;
  page_number: number;
  context: string;
  citation_marker: string;
  all_markers?: string[];
  reference_id: string | null;
  claim_type: 'scientific' | 'statistical' | 'factual' | 'quantitative' | 'finding';
  confidence: number;
  mapping_status: MappingStatus;
  mapping_method?: string;
  mapping_confidence?: number;
  mapping_note?: string;
  normalized_marker?: string;
  verdict: VerdictStatus;
  verdict_explanation: string;
  evidence_passage: string;
  evidence_source?: string;
  evidence_confidence?: number;
  source_grounded_wording?: string;
  correction_note?: string;
  retrieval_level: RetrievalLevel;
  uncertainty_note: string;
  learned_suggestion?: VerdictStatus | '';
  learned_confidence?: number;
  bounding_box?: { x?: number; y?: number; width?: number; height?: number };
}

export interface Reference {
  id: string;
  audit_id: string;
  raw_citation: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  authenticity_status: AuthenticityStatus;
  authenticity_reason: string;
  matched_title?: string;
  matched_authors?: string;
  matched_year?: string;
  matched_source?: string;
  matched_journal?: string;
  matched_doi?: string;
  url?: string;
  retrieval_level: RetrievalLevel;
  abstract?: string;
  full_text_snippet?: string;
  needs_review?: number;
  entry_type?: string;
  title_similarity?: number;
  author_match?: number;
  year_match?: number;
  citation_count?: number;
  is_open_access?: number;
  paper_id?: string;
}

export interface PlatformSettings {
  strict_verification: string;
  openalex_enabled: string;
  crossref_enabled: string;
  semantic_scholar_enabled: string;
  ai_model: string;
  auto_download_report: string;
  privacy_mode: string;
  data_retention_days: string;
  auto_cleanup?: string;
  external_ai_disclosure?: string;
}

/* ------------------------------------------------------------------ */
/* Research discovery                                                  */
/* ------------------------------------------------------------------ */

export interface PaperAuthor {
  name: string;
  id?: string;
  affiliation?: string;
  position?: string;
}

export interface ResearchPaper {
  id: string;
  source?: string;
  source_id?: string;
  doi?: string;
  title: string;
  authors: string;
  authors_list?: PaperAuthor[];
  year: string;
  publication_date?: string;
  journal?: string;
  abstract?: string;
  citation_count?: number;
  is_open_access?: boolean;
  oa_url?: string;
  url?: string;
  type?: string;
  topics?: string[];
  relationship_basis?: string;
  relationship_type?: string;
  note?: string;
}

export interface SearchResponse {
  query: string;
  page: number;
  per_page: number;
  source: string;
  results: ResearchPaper[];
  warnings: string[];
  total: number;
}

export interface NetworkNode {
  id: string;
  label: string;
  title: string;
  year: string;
  journal: string;
  authors: string;
  doi: string;
  citation_count: number;
  is_open_access: boolean;
  oa_url: string;
  url: string;
  type: 'seed' | 'reference' | 'citation' | 'related';
  saved?: boolean;
}

export interface NetworkEdge {
  source: string;
  target: string;
  type: 'cites' | 'co_cited' | 'recommendation';
  label: string;
  explanation?: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  warnings: string[];
  legend: Record<string, string>;
  demo: boolean;
  seed_ids: string[];
  network_id?: string;
  stats?: {
    nodes: number;
    edges: number;
    citation_edges: number;
    co_citation_edges: number;
    recommendation_edges: number;
  };
}

export interface ResearchSeed {
  id: string;
  paper_id: string;
  note?: string;
  paper?: ResearchPaper | null;
}

export interface ResearchCollection {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  paper_count: number;
}

export interface CollectionPaper {
  id: string;
  collection_id: string;
  paper_id: string;
  note?: string;
  added_at?: string;
  paper?: ResearchPaper | null;
}

export interface DiscoveryMetrics {
  saved_papers: number;
  collections: number;
  seeds: number;
  relationships: number;
  authors: number;
  recent_papers: ResearchPaper[];
  top_collections: { id: string; name: string; paper_count: number }[];
}

export interface DashboardData {
  audits: { total: number; completed: number; processing: number; documents: number };
  claims: {
    total: number;
    supported: number;
    partial: number;
    contradicted: number;
    insufficient: number;
    unverified: number;
  };
  references: {
    total: number;
    verified: number;
    possible_match: number;
    mismatch: number;
    unverified: number;
    retrieval_failed: number;
  };
  mapping?: { mapped: number; ambiguous: number; unmapped: number };
  manual_review: number;
  recent_audits: Audit[];
  flagged_claims: Claim[];
  discovery: DiscoveryMetrics;
  pipeline_stages: string[];
}

export interface AuthorSummary {
  id: string;
  name: string;
  works_count: number;
  cited_by_count: number;
  h_index?: number;
  affiliations?: string[] | string;
  topics?: string[];
  orcid?: string;
}

export interface AuthorDetailResponse {
  author: AuthorSummary;
  publications: ResearchPaper[];
  coauthors: { id: string; name: string; count: number }[];
  warnings: string[];
}
