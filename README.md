# CiteVerify — AI-Powered Academic Citation Auditing & Research Evidence Verification Platform

> *"Don't just trust the citation. Verify the evidence."*

CiteVerify is a full-stack research intelligence platform that audits academic manuscripts, detects hallucinated citations, maps citations to primary literature, and evaluates whether cited sources genuinely substantiate the empirical claims made in research papers.

---

## Architecture & Technology Stack

```
   ┌───────────────────────────────────────────────────────────────┐
   │                       CiteVerify UI                           │
   │  React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons   │
   │  (Interactive PDF Reader, Recharts Ledgers, Split Workspace)  │
   └───────────────────────────────┬───────────────────────────────┘
                                   │ HTTP / JSON API
   ┌───────────────────────────────▼───────────────────────────────┐
   │                   FastAPI Backend Engine                      │
   │        (Python 3.12, Uvicorn, SQLite3, ReportLab, PyPDF)      │
   └───────┬───────────────────────┬───────────────────────┬───────┘
           │                       │                       │
           ▼                       ▼                       ▼
   ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
   │   Document    │       │   Scholarly   │       │ Claim-Evidence│
   │  Extraction   │       │  API Registry │       │  NLI Engine   │
   │ (PyPDF/Regex) │       │(OpenAlex/XRef)│       │ (Polarity/Sim)│
   └───────────────┘       └───────────────┘       └───────────────┘
```

### Frontend (`/frontend`)
- **Framework**: React 18 with TypeScript and Vite
- **Styling & Design System**: Tailwind CSS tailored to an *"Editorial science journal meets premium research workspace"* aesthetic
  - Warm paper background: `#F7F6F1`
  - High-contrast ink: `#172522`
  - Scholarly cobalt: `#4F5FEA`
  - Editorial accents: Lime (`#D8EF78`), Coral (`#F17E6D`), Lavender (`#C9C1FF`), Soft Teal (`#A9DCD2`)
- **Visualizations**: Interactive SVG claim graphs, Recharts claim distribution & authenticity charts
- **Interactive PDF Workspace**: Synchronized split-screen reader with page claim highlighting and real-time evidence panel synchronization

### Backend (`/backend`)
- **API Framework**: FastAPI with Starlette and Uvicorn
- **Database**: SQLite3 (`citeverify.db`) with schema for audits, claims, references, and settings
- **Academic API Integrations**:
  - **OpenAlex REST API**: 250M+ works catalog with reconstructed abstracts and open-access links
  - **Crossref REST API**: Official scholarly DOI authority and bibliographic records
- **NLP & Verification Pipeline**:
  - Structural claim extraction (distinguishing scientific, statistical, and empirical claims from prose)
  - Citation tokenizer supporting numeric (`[1]`, `[1-3]`) and author-year (`(Smith et al., 2021)`) styles
  - Natural Language Inference & Polarity analysis: Evaluates whether retrieved evidence is **Supported**, **Partially Supported**, **Contradicted**, **Insufficient Evidence**, or **Unverified**
- **Report Generation**: Publication-grade PDF audit reports compiled with **ReportLab**

---

## 12 Implemented Pages & Workspaces

1. **Landing Page**: Editorial introduction with interactive 4-node animated evidence visual, 3-step methodology, and feature showcases.
2. **Application Dashboard**: Overview metrics (documents audited, claims evaluated, contradicted findings, unverified citations), recent audits ledger, and flagged findings requiring peer review.
3. **New Audit / Upload**: Drag-and-drop PDF upload zone, 50MB file size validation, and "Try Bundled Benchmark Sample" button.
4. **Document Processing**: Real 9-stage animated timeline synchronized with live backend status polling.
5. **Audit Results**: Interactive Recharts breakdown of verdicts, authenticity, and retrieval depth with clickable filter navigation.
6. **Claim Explorer**: Search, filter by verdict, filter by page, sort by confidence, and expandable context/evidence view.
7. **Claim Detail Modal**: In-depth inspection showing original claim, citation mapping, authenticity score, verdict reasoning, retrieved excerpt, and reviewer uncertainty notes.
8. **Interactive PDF Viewer**: Signature split-screen workspace with page navigation, zoom controls, color-coded claim highlights, and synchronized evidence panel.
9. **Reference Library**: Bibliography ledger comparing cited titles against OpenAlex/Crossref matched records, flagging metadata mismatches.
10. **Report Preview**: Executive on-screen preview and one-click ReportLab PDF download.
11. **Audit History**: Stored database audits, claim counts, download links, and deletion modals.
12. **Settings & Privacy**: Toggles for scholarly APIs, strict verification mode, local data retention policies, and NLI models.

---

## Running the Application

### 1. Launch Backend
```bash
cd backend
python main.py
```
*Backend runs on `http://127.0.0.1:8000` (FastAPI + Swagger docs at `/docs`).*

### 2. Launch Frontend
```bash
cd frontend
npm run dev
```
*Frontend runs on `http://localhost:5173` (proxies `/api` and `/uploads` to port 8000).*

### 3. Production Full-Stack Mode
The frontend is pre-built into `frontend/dist`. Running `python main.py` in `backend` serves both the API and the compiled frontend directly at:
```
http://127.0.0.1:8000
```

## Supabase Workspace Connection

CiteVerify is connected to the existing Supabase project `rpvecdgbkybjilrhtthd`.
The Vite frontend reads its project URL and **publishable** key from
`frontend/.env.local`; `frontend/.env.example` documents the variable names.
No service-role or database secret is used in the browser.

On startup, the app restores its Supabase session or attempts a guest session.
If anonymous sign-ins are disabled for the project, use the email sign-in or
account creation form instead. Supabase Auth access tokens accompany backend
requests, and the frontend writes account-owned audit metadata, claims,
references, document consistency findings, reviewer labels, settings, saved
research items, and networks through the Supabase Data API. Row-level security
limits these rows to their owner. Uploaded PDFs are copied to the private
`cv-documents` Storage bucket and opened through short-lived signed links.

The FastAPI processing pipeline and its existing SQLite database remain in
place. Local audit records are retained; they are copied to the signed-in
workspace when loaded. Supabase schema changes are versioned in
`supabase/migrations/`.
