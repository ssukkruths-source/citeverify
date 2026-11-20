"""Research Discovery orchestration.

Connects the scholarly APIs to CiteVerify's persistence layer and builds the
citation network used by the frontend map.

Relationship rules:
  * `cites`          — a real citation link reported by OpenAlex.
  * `co_cited`       — two works cited by the same seed publication.
  * `recommendation` — a similarity suggestion from OpenAlex related works,
                       always labelled as a recommendation, never as a citation.

No edge is ever invented: if the APIs return nothing, the graph says so.
"""

import time
from typing import Any, Dict, List, Optional

import academic_apis as api
import database as db

NODE_COLORS = {
    "seed": "#4F5FEA",
    "reference": "#F2A65A",
    "citation": "#9C8CF5",
    "related": "#5FA98C",
    "saved": "#C7E15A",
}


def _ensure_paper(paper_id: str) -> Dict[str, Any]:
    """Returns a paper from the database, fetching it from OpenAlex if needed."""
    paper = db.get_paper(paper_id)
    if paper:
        # Refresh sparse records that were stored from a search hit.
        if paper.get("abstract") and paper.get("citation_count"):
            return paper
    fetched, warnings = api.get_work(paper_id)
    if not fetched:
        return paper or {}
    stored_id = db.upsert_paper(fetched)
    stored = db.get_paper(stored_id)
    return stored or fetched


def search(
    query: str,
    page: int = 1,
    per_page: int = 20,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    is_oa: Optional[bool] = None,
    work_type: Optional[str] = None,
    min_citations: Optional[int] = None,
    author: Optional[str] = None,
    sort: str = "relevance",
) -> Dict[str, Any]:
    result = api.search_works(
        query=query,
        page=page,
        per_page=per_page,
        year_from=year_from,
        year_to=year_to,
        is_oa=is_oa,
        work_type=work_type,
        min_citations=min_citations,
        author=author,
        sort=sort,
    )
    for paper in result["results"]:
        paper_id = db.upsert_paper(paper)
        paper["id"] = paper_id
    return result


def paper_detail(paper_id: str) -> Dict[str, Any]:
    paper = _ensure_paper(paper_id)
    if not paper:
        return {"paper": None, "warnings": ["Publication could not be retrieved."]}
    warnings: List[str] = []
    refs = references(paper["id"], limit=25)
    cites = citations(paper["id"], limit=25)
    sim = similar(paper["id"], limit=12)
    authors = paper_authors(paper["id"])
    warnings.extend(refs.get("warnings", []))
    warnings.extend(sim.get("warnings", []))
    return {
        "paper": paper,
        "references": refs["results"],
        "citations": cites["results"],
        "similar": sim["results"],
        "authors": authors,
        "warnings": warnings,
        "relationship_sources": [
            "OpenAlex referenced_works (references)",
            "OpenAlex cites: filter (citing works)",
            "OpenAlex related_works (relevance suggestions)",
        ],
    }


def references(paper_id: str, limit: int = 50) -> Dict[str, Any]:
    paper = _ensure_paper(paper_id)
    if not paper:
        return {"results": [], "warnings": ["Publication not found."]}
    batch = api.get_references(paper, limit=limit)
    out = []
    for item in batch["results"]:
        stored_id = db.upsert_paper(item)
        item["id"] = stored_id
        db.add_relationship(
            paper["id"],
            stored_id,
            "cites",
            "OpenAlex referenced_works",
            "This seed publication cites the listed work.",
        )
        out.append(item)
    return {"results": out, "warnings": batch.get("warnings", [])}


def citations(paper_id: str, limit: int = 25) -> Dict[str, Any]:
    paper = _ensure_paper(paper_id)
    if not paper:
        return {"results": [], "warnings": ["Publication not found."]}
    batch = api.get_citations(paper, limit=limit)
    out = []
    for item in batch["results"]:
        stored_id = db.upsert_paper(item)
        item["id"] = stored_id
        db.add_relationship(
            stored_id,
            paper["id"],
            "cites",
            "OpenAlex citing works",
            "The listed work cites this seed publication.",
        )
        out.append(item)
    return {"results": out, "warnings": batch.get("warnings", [])}


def similar(paper_id: str, limit: int = 15) -> Dict[str, Any]:
    paper = _ensure_paper(paper_id)
    if not paper:
        return {"results": [], "warnings": ["Publication not found."]}
    batch = api.get_related(paper, limit=limit)
    out = []
    for item in batch["results"]:
        stored_id = db.upsert_paper(item)
        item["id"] = stored_id
        item["relationship_basis"] = (
            item.get("relationship_basis")
            or "OpenAlex related-work recommendation"
        )
        item["relationship_type"] = "recommendation"
        db.add_relationship(
            paper["id"],
            stored_id,
            "recommendation",
            "OpenAlex related_works",
            "Suggested from citation-graph similarity. This is not evidence "
            "that the two papers support the same claim.",
        )
        out.append(item)
    return {
        "results": out,
        "warnings": batch.get("warnings", [])
        + [
            "Similarity is a discovery aid only. It never marks an audit claim as "
            "supported."
        ],
    }


def paper_authors(paper_id: str) -> List[Dict[str, Any]]:
    paper = db.get_paper(paper_id)
    if not paper:
        return []
    authors = paper.get("authors_list") or []
    out = []
    for rank, author in enumerate(authors):
        if not author.get("name"):
            continue
        author_id = author.get("id") or f"author-{_slug(author['name'])}"
        stored = db.upsert_author(
            {
                "id": author_id,
                "source_id": author.get("id", ""),
                "name": author.get("name"),
                "affiliations": author.get("affiliation", ""),
                "topics": paper.get("topics") or [],
            }
        )
        db.link_author_publication(stored, paper_id)
        out.append(
            {
                "id": stored,
                "name": author.get("name"),
                "affiliation": author.get("affiliation", ""),
                "source_id": author.get("id", ""),
                "position": "first" if rank == 0 else ("last" if rank == len(authors) - 1 else "middle"),
            }
        )
    return out


def _slug(text: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in text).strip("-")[:40]


def search_authors(query: str, limit: int = 20) -> Dict[str, Any]:
    import urllib.parse

    params = urllib.parse.urlencode({"search": query[:120], "per_page": min(limit, 50)})
    data, err = api._get_json(f"https://api.openalex.org/authors?{params}")
    warnings = [f"OpenAlex author search failed ({err})."] if err else []
    results: List[Dict[str, Any]] = []

    # Fallback 1: Semantic Scholar author search, which has no shared rate budget
    # with OpenAlex and covers most biomedical and CS researchers.
    if err:
        s2_url = urllib.parse.urlencode(
            {
                "query": query[:120],
                "limit": min(limit, 50),
                "fields": "name,affiliations,hIndex,paperCount,citationCount",
            }
        )
        s2_data, s2_err = api._get_json(
            f"https://api.semanticscholar.org/graph/v1/author/search?{s2_url}"
        )
        for item in (s2_data or {}).get("data", []) or []:
            if not item.get("name"):
                continue
            affiliations = [a for a in (item.get("affiliations") or []) if a][:3]
            results.append(
                {
                    "id": item.get("authorId") or f"s2-{_slug(item['name'])}",
                    "name": item["name"],
                    "works_count": item.get("paperCount") or 0,
                    "cited_by_count": item.get("citationCount") or 0,
                    "h_index": item.get("hIndex"),
                    "affiliations": affiliations,
                    "topics": [],
                    "orcid": None,
                }
            )
            db.upsert_author(
                {
                    "id": item.get("authorId") or f"s2-{_slug(item['name'])}",
                    "source_id": item.get("authorId") or "",
                    "name": item["name"],
                    "works_count": item.get("paperCount") or 0,
                    "cited_by_count": item.get("citationCount") or 0,
                    "affiliations": ", ".join(affiliations),
                    "topics": [],
                }
            )
        if results:
            warnings.append(
                "OpenAlex is rate limited, so these authors come from Semantic Scholar."
            )
            return {"results": results, "warnings": warnings}
        if s2_err:
            warnings.append(f"Semantic Scholar author search failed ({s2_err}).")

    # Fallback 2: authors already cached from saved publications and audits.
    if err or not data:
        needle = query.lower()
        cached = [
            a
            for a in db.list_authors(limit=500)
            if needle in (a.get("name") or "").lower()
        ][:limit]
        if cached:
            warnings.append(
                "Live author search is unavailable right now; showing authors already "
                "cached from publications you have opened."
            )
            return {"results": cached, "warnings": warnings}

    for item in (data or {}).get("results", []):
        summary = item.get("summary_stats") or {}
        topics = [
            t.get("display_name", "")
            for t in (item.get("topics") or [])[:5]
            if t.get("display_name")
        ]
        affiliations = [
            i.get("display_name", "")
            for i in (item.get("affiliations") or [])[:3]
            if i.get("display_name")
        ]
        author_id = db.upsert_author(
            {
                "id": (item.get("id") or "").replace("https://openalex.org/", ""),
                "source_id": (item.get("id") or "").replace("https://openalex.org/", ""),
                "name": item.get("display_name", ""),
                "works_count": item.get("works_count") or 0,
                "cited_by_count": item.get("cited_by_count") or 0,
                "affiliations": ", ".join(affiliations),
                "topics": topics,
            }
        )
        results.append(
            {
                "id": author_id,
                "name": item.get("display_name", ""),
                "works_count": item.get("works_count") or 0,
                "cited_by_count": item.get("cited_by_count") or 0,
                "h_index": summary.get("h_index"),
                "affiliations": affiliations,
                "topics": topics,
                "orcid": item.get("orcid"),
            }
        )
    return {"results": results, "warnings": warnings}


def _s2_author_detail(author_id: str, ident: str, limit: int = 25) -> Dict[str, Any]:
    """Author record from Semantic Scholar (used when search fell back to S2)."""
    fields = (
        "name,affiliations,hIndex,paperCount,citationCount,"
        "papers.title,papers.year,papers.venue,papers.citationCount,"
        "papers.externalIds,papers.abstract,papers.authors"
    )
    data, err = api._get_json(
        f"https://api.semanticscholar.org/graph/v1/author/{ident}?fields={fields}"
    )
    warnings = [f"Author record unavailable ({err})."] if err else []
    if not data:
        return {"author": {}, "publications": [], "coauthors": [], "warnings": warnings}

    author = {
        "id": author_id,
        "name": data.get("name", ""),
        "works_count": data.get("paperCount") or 0,
        "cited_by_count": data.get("citationCount") or 0,
        "h_index": data.get("hIndex"),
        "affiliations": [a for a in (data.get("affiliations") or []) if a],
        "topics": [],
        "orcid": None,
    }

    works: List[Dict[str, Any]] = []
    coauthors: Dict[str, Dict[str, Any]] = {}
    for item in (data.get("papers") or [])[:limit]:
        if not item.get("title"):
            continue
        external = item.get("externalIds") or {}
        doi = (external.get("DOI") or "").lower()
        s2_id = item.get("paperId") or ""
        author_names = [
            a.get("name", "") for a in (item.get("authors") or []) if a.get("name")
        ]
        for co in item.get("authors") or []:
            co_id = co.get("authorId")
            if co_id and co_id != ident and co.get("name"):
                coauthors.setdefault(
                    str(co_id), {"id": str(co_id), "name": co["name"], "count": 0}
                )
                coauthors[str(co_id)]["count"] += 1
        paper = {
            "id": f"doi:{doi}" if doi else f"s2:{s2_id}",
            "source": "semanticscholar",
            "source_id": s2_id,
            "doi": doi,
            "title": item["title"],
            "authors": ", ".join(author_names),
            "authors_list": [
                {"name": a.get("name", ""), "id": str(a.get("authorId") or "")}
                for a in (item.get("authors") or [])
                if a.get("name")
            ],
            "year": str(item.get("year") or ""),
            "journal": item.get("venue") or "",
            "abstract": item.get("abstract") or "",
            "citation_count": item.get("citationCount") or 0,
            "is_open_access": False,
            "oa_url": "",
            "url": f"https://www.semanticscholar.org/paper/{s2_id}" if s2_id else "",
            "type": "article",
            "topics": [],
        }
        paper["id"] = db.upsert_paper(paper)
        works.append(paper)
        db.link_author_publication(author_id, paper["id"])

    return {
        "author": author,
        "publications": works,
        "coauthors": sorted(coauthors.values(), key=lambda c: -c["count"])[:20],
        "warnings": warnings,
    }


def author_detail(author_id: str, limit: int = 25) -> Dict[str, Any]:
    ident = author_id.replace("author-", "")
    if ident.isdigit():
        # Semantic Scholar author ids are numeric; OpenAlex ids start with A.
        return _s2_author_detail(author_id, ident, limit)
    params = f"https://api.openalex.org/authors/{ident}"
    data, err = api._get_json(params)
    warnings = [f"Author record unavailable ({err})."] if err else []
    author: Dict[str, Any] = {}
    if data:
        affiliations = [
            i.get("display_name", "")
            for i in (data.get("affiliations") or [])[:5]
            if i.get("display_name")
        ]
        topics = [
            t.get("display_name", "")
            for t in (data.get("topics") or [])[:8]
            if t.get("display_name")
        ]
        summary = data.get("summary_stats") or {}
        author = {
            "id": author_id,
            "name": data.get("display_name", ""),
            "works_count": data.get("works_count") or 0,
            "cited_by_count": data.get("cited_by_count") or 0,
            "h_index": summary.get("h_index"),
            "affiliations": affiliations,
            "topics": topics,
            "orcid": data.get("orcid"),
            "last_known_institutions": [
                i.get("display_name", "")
                for i in (data.get("last_known_institutions") or [])
            ],
        }

    # Co-authors are derived from the author's works.
    works: List[Dict[str, Any]] = []
    coauthors: Dict[str, Dict[str, Any]] = {}
    if ident:
        wdata, _werr = api._get_json(
            "https://api.openalex.org/works?"
            + f"filter=author.id:{ident}&per_page={min(limit, 25)}&sort=cited_by_count:desc"
        )
        for work in (wdata or {}).get("results", []):
            paper = api.normalise_openalex_paper(work)
            paper_id = db.upsert_paper(paper)
            paper["id"] = paper_id
            works.append(paper)
            for co in paper.get("authors_list", []):
                if co.get("id") and co["id"] != ident and co.get("name"):
                    coauthors.setdefault(
                        co["id"],
                        {"id": co["id"], "name": co["name"], "count": 0},
                    )
                    coauthors[co["id"]]["count"] += 1

    if not author:
        cached = next(
            (a for a in db.list_authors(limit=500) if a.get("id") == author_id), None
        )
        if cached:
            author = {
                "id": author_id,
                "name": cached.get("name", ""),
                "works_count": cached.get("works_count") or 0,
                "cited_by_count": cached.get("cited_by_count") or 0,
                "h_index": cached.get("h_index"),
                "affiliations": [
                    part.strip()
                    for part in (cached.get("affiliations") or "").split(",")
                    if part.strip()
                ],
                "topics": cached.get("topics") or [],
                "orcid": cached.get("orcid"),
            }
            warnings.append(
                "Live author record is unavailable; showing the locally cached profile and "
                "saved publications."
            )

    stored = db.get_author_publications(author_id)
    if not works and stored:
        works = stored

    return {
        "author": author,
        "publications": works,
        "coauthors": sorted(coauthors.values(), key=lambda c: -c["count"])[:20],
        "warnings": warnings,
    }


def build_network(
    seed_ids: List[str],
    include_references: bool = True,
    include_citations: bool = True,
    include_similar: bool = True,
    max_nodes: int = 40,
) -> Dict[str, Any]:
    """Builds the citation network around one or more seed publications."""
    nodes: Dict[str, Dict[str, Any]] = {}
    edges: List[Dict[str, Any]] = []
    warnings: List[str] = []
    seeds: List[Dict[str, Any]] = []

    if not seed_ids:
        return {
            "nodes": [],
            "edges": [],
            "warnings": ["Select at least one seed paper to build a network."],
            "legend": NODE_COLORS,
            "demo": False,
        }

    def add_node(paper: Dict[str, Any], node_type: str) -> Optional[str]:
        pid = paper.get("id")
        if not pid:
            return None
        if pid not in nodes:
            if len(nodes) >= max_nodes:
                return None
            nodes[pid] = {
                "id": pid,
                "label": (paper.get("title") or "Untitled")[:110],
                "title": paper.get("title") or "",
                "year": paper.get("year") or "",
                "journal": paper.get("journal") or "",
                "authors": paper.get("authors") or "",
                "doi": paper.get("doi") or "",
                "citation_count": paper.get("citation_count") or 0,
                "is_open_access": bool(paper.get("is_open_access")),
                "oa_url": paper.get("oa_url") or "",
                "url": paper.get("url") or "",
                "type": node_type,
            }
        elif node_type == "seed":
            nodes[pid]["type"] = "seed"
        return pid

    for seed_id in seed_ids[:8]:
        seed = _ensure_paper(seed_id)
        if not seed:
            warnings.append(f"Seed {seed_id} could not be retrieved.")
            continue
        add_node(seed, "seed")
        seeds.append(seed)

    for seed in seeds:
        if include_references and len(nodes) < max_nodes:
            batch = api.get_references(seed, limit=18)
            warnings.extend(batch.get("warnings", []))
            cited_ids = []
            for item in batch["results"]:
                pid = db.upsert_paper(item)
                item["id"] = pid
                if add_node(item, "reference"):
                    cited_ids.append(pid)
                    edges.append(
                        {
                            "source": seed["id"],
                            "target": pid,
                            "type": "cites",
                            "label": "cites",
                            "explanation": "OpenAlex reference list of the seed paper.",
                        }
                    )
            # Co-citation: works cited by the same paper are related to each other.
            for i in range(len(cited_ids)):
                for j in range(i + 1, min(len(cited_ids), i + 6)):
                    edges.append(
                        {
                            "source": cited_ids[i],
                            "target": cited_ids[j],
                            "type": "co_cited",
                            "label": "co-cited",
                            "explanation": "Both works are cited by the same seed paper.",
                        }
                    )

        if include_citations and len(nodes) < max_nodes:
            batch = api.get_citations(seed, limit=15)
            warnings.extend(batch.get("warnings", []))
            for item in batch["results"]:
                pid = db.upsert_paper(item)
                item["id"] = pid
                if add_node(item, "citation"):
                    edges.append(
                        {
                            "source": pid,
                            "target": seed["id"],
                            "type": "cites",
                            "label": "cites seed",
                            "explanation": "OpenAlex lists this work as citing the seed.",
                        }
                    )

        if include_similar and len(nodes) < max_nodes:
            batch = api.get_related(seed, limit=10)
            warnings.extend(batch.get("warnings", []))
            for item in batch["results"]:
                pid = db.upsert_paper(item)
                item["id"] = pid
                if add_node(item, "related"):
                    edges.append(
                        {
                            "source": seed["id"],
                            "target": pid,
                            "type": "recommendation",
                            "label": "similar (recommended)",
                            "explanation": item.get(
                                "relationship_basis",
                                "OpenAlex related-work recommendation",
                            ),
                        }
                    )

    # Persist the real relationships for later exploration.
    for edge in edges:
        if edge["type"] in ("cites", "co_cited"):
            db.add_relationship(
                edge["source"],
                edge["target"],
                edge["type"],
                "OpenAlex",
                edge.get("explanation", ""),
            )

    # Mark papers already saved in a collection.
    saved_ids = set()
    for coll in db.list_collections():
        for item in db.get_collection_papers(coll["id"]):
            if item.get("paper_id"):
                saved_ids.add(item["paper_id"])
    for pid, node in nodes.items():
        node["saved"] = pid in saved_ids

    # De-duplicate edges
    seen = set()
    unique_edges = []
    for edge in edges:
        key = (edge["source"], edge["target"], edge["type"])
        if key in seen:
            continue
        seen.add(key)
        unique_edges.append(edge)

    graph = {
        "nodes": list(nodes.values()),
        "edges": unique_edges,
        "warnings": list(dict.fromkeys(warnings)),
        "legend": NODE_COLORS,
        "demo": False,
        "seed_ids": [s["id"] for s in seeds],
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stats": {
            "nodes": len(nodes),
            "edges": len(unique_edges),
            "citation_edges": sum(1 for e in unique_edges if e["type"] == "cites"),
            "co_citation_edges": sum(1 for e in unique_edges if e["type"] == "co_cited"),
            "recommendation_edges": sum(
                1 for e in unique_edges if e["type"] == "recommendation"
            ),
        },
    }
    return graph


# ---------------------------------------------------------------------------
# Bundled demo network (documented, real publications)
# ---------------------------------------------------------------------------

DEMO_SEED_DOI = "10.1136/bmj.m689"

DEMO_PAPERS = [
    {
        "doi": "10.1136/bmj.m689",
        "title": "Artificial intelligence versus clinicians: systematic review of design, reporting standards, and claims of deep learning studies",
        "authors": "Nagendran M, Chen Y, Lovejoy CA, Gordon AC, Komorowski M, Harvey H, Topol EJ, Ioannidis JPA, Collins GS, Maruthappu M",
        "year": "2020",
        "journal": "BMJ",
        "type": "seed",
    },
    {
        "doi": "10.1038/nature14539",
        "title": "Deep learning",
        "authors": "LeCun Y, Bengio Y, Hinton G",
        "year": "2015",
        "journal": "Nature",
        "type": "reference",
    },
    {
        "doi": "10.1038/s41591-018-0316-z",
        "title": "A guide to deep learning in healthcare",
        "authors": "Esteva A, Robicquet A, Ramsundar B, et al",
        "year": "2019",
        "journal": "Nature Medicine",
        "type": "reference",
    },
    {
        "doi": "10.1038/s41591-018-0300-7",
        "title": "High-performance medicine: the convergence of human and artificial intelligence",
        "authors": "Topol EJ",
        "year": "2019",
        "journal": "Nature Medicine",
        "type": "reference",
    },
    {
        "doi": "10.1136/bmj.b2535",
        "title": "Preferred reporting items for systematic reviews and meta-analyses: the PRISMA statement",
        "authors": "Moher D, Liberati A, Tetzlaff J, Altman DG",
        "year": "2009",
        "journal": "BMJ",
        "type": "reference",
    },
    {
        "doi": "10.1136/bmj.g7594",
        "title": "Transparent reporting of a multivariable prediction model for individual prognosis or diagnosis (TRIPOD): the TRIPOD statement",
        "authors": "Collins GS, Reitsma JB, Altman DG, Moons KG",
        "year": "2015",
        "journal": "BMJ",
        "type": "reference",
    },
    {
        "doi": "10.7326/M18-1376",
        "title": "PROBAST: a tool to assess the risk of bias and applicability of prediction model studies",
        "authors": "Wolff RF, Moons KGM, Riley RD, et al",
        "year": "2019",
        "journal": "Annals of Internal Medicine",
        "type": "reference",
    },
    {
        "doi": "10.1136/bmj.d5928",
        "title": "The Cochrane Collaboration's tool for assessing risk of bias in randomised trials",
        "authors": "Higgins JP, Altman DG, Gotzsche PC, et al",
        "year": "2011",
        "journal": "BMJ",
        "type": "reference",
    },
    {
        "doi": "10.1016/j.eclinm.2019.03.001",
        "title": "Diagnostic efficacy and therapeutic decision-making capacity of an artificial intelligence platform for childhood cataracts in eye clinics: a multicentre randomized controlled trial",
        "authors": "Lin H, Li R, Liu Z, et al",
        "year": "2019",
        "journal": "EClinicalMedicine",
        "type": "citation",
    },
    {
        "doi": "10.1136/gutjnl-2018-317500",
        "title": "Real-time automatic detection system increases colonoscopic polyp and adenoma detection rates: a prospective randomised controlled study",
        "authors": "Wang P, Berzin TM, Glissen Brown JR, et al",
        "year": "2019",
        "journal": "Gut",
        "type": "citation",
    },
    {
        "doi": "10.1371/journal.pone.0191493",
        "title": "Deep neural networks show an equivalent and often superior performance to dermatologists in onychomycosis diagnosis",
        "authors": "Han SS, Park GH, Lim W, et al",
        "year": "2018",
        "journal": "PLOS ONE",
        "type": "citation",
    },
    {
        "doi": "10.1126/science.aap9559",
        "title": "The spread of true and false news online",
        "authors": "Vosoughi S, Roy D, Aral S",
        "year": "2018",
        "journal": "Science",
        "type": "related",
    },
]


def demo_network() -> Dict[str, Any]:
    """Returns the bundled, documented demo citation network.

    All publications are real and their identifiers resolve. Edges are derived
    from the reference list of the BMJ systematic review that CiteVerify ships as
    its benchmark document, plus explicit citation edges that the same review
    reports for the included trials. This dataset is labelled DEMO DATA in the UI.
    """
    nodes = []
    id_by_doi: Dict[str, str] = {}
    for item in DEMO_PAPERS:
        paper = {
            "id": f"doi:{item['doi']}",
            "source": "demo",
            "source_id": "",
            "doi": item["doi"],
            "title": item["title"],
            "authors": item["authors"],
            "authors_list": [
                {"name": name.strip(), "id": "", "affiliation": ""}
                for name in item["authors"].split(",")
                if name.strip()
            ],
            "year": item["year"],
            "journal": item["journal"],
            "abstract": "",
            "citation_count": 0,
            "is_open_access": False,
            "oa_url": "",
            "url": f"https://doi.org/{item['doi']}",
            "type": "article",
            "topics": [],
        }
        paper_id = db.upsert_paper(paper)
        paper["id"] = paper_id
        id_by_doi[item["doi"]] = paper_id
        nodes.append(
            {
                "id": paper_id,
                "label": item["title"][:110],
                "title": item["title"],
                "year": item["year"],
                "journal": item["journal"],
                "authors": item["authors"],
                "doi": item["doi"],
                "citation_count": 0,
                "is_open_access": False,
                "oa_url": "",
                "url": paper["url"],
                "type": item["type"],
                "saved": False,
                "demo": True,
            }
        )

    edges: List[Dict[str, Any]] = []
    seed_id = id_by_doi[DEMO_SEED_DOI]
    reference_dois = [
        "10.1038/nature14539",
        "10.1038/s41591-018-0316-z",
        "10.1038/s41591-018-0300-7",
        "10.1136/bmj.b2535",
        "10.1136/bmj.g7594",
        "10.7326/M18-1376",
        "10.1136/bmj.d5928",
    ]
    for doi in reference_dois:
        edges.append(
            {
                "source": seed_id,
                "target": id_by_doi[doi],
                "type": "cites",
                "label": "cites",
                "explanation": "Listed in the seed paper's reference list (demo dataset).",
            }
        )
    # Co-citation among the seed's references (documented in the demo dataset).
    for i in range(len(reference_dois)):
        for j in range(i + 1, min(len(reference_dois), i + 4)):
            edges.append(
                {
                    "source": id_by_doi[reference_dois[i]],
                    "target": id_by_doi[reference_dois[j]],
                    "type": "co_cited",
                    "label": "co-cited",
                    "explanation": "Both works are cited by the same seed publication.",
                }
            )
    # Trials included by the review are described in its results section.
    for doi in (
        "10.1016/j.eclinm.2019.03.001",
        "10.1136/gutjnl-2018-317500",
        "10.1371/journal.pone.0191493",
    ):
        edges.append(
            {
                "source": id_by_doi[doi],
                "target": seed_id,
                "type": "cites",
                "label": "cites seed",
                "explanation": "Included study discussed in the seed publication (demo dataset).",
            }
        )
    edges.append(
        {
            "source": seed_id,
            "target": id_by_doi["10.1126/science.aap9559"],
            "type": "recommendation",
            "label": "similar (recommended)",
            "explanation": "Demo relevance suggestion on science communication; not a citation.",
        }
    )

    for edge in edges:
        if edge["type"] in ("cites", "co_cited"):
            db.add_relationship(
                edge["source"], edge["target"], edge["type"], "Bundled demo dataset", edge["explanation"]
            )

    return {
        "nodes": nodes,
        "edges": edges,
        "warnings": [
            "DEMO DATA — this bundled network is built from the documented reference "
            "list of the benchmark BMJ review and the trials it discusses. It is not "
            "the result of your own search."
        ],
        "legend": NODE_COLORS,
        "demo": True,
        "seed_ids": [seed_id],
        "stats": {
            "nodes": len(nodes),
            "edges": len(edges),
            "citation_edges": sum(1 for e in edges if e["type"] == "cites"),
            "co_citation_edges": sum(1 for e in edges if e["type"] == "co_cited"),
            "recommendation_edges": sum(1 for e in edges if e["type"] == "recommendation"),
        },
    }


def timeline(paper_ids: List[str]) -> Dict[str, Any]:
    papers = db.get_papers_by_ids(paper_ids)
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for paper in papers.values():
        year = paper.get("year") or "Unknown"
        buckets.setdefault(year, []).append(
            {
                "id": paper["id"],
                "title": paper.get("title"),
                "authors": paper.get("authors"),
                "journal": paper.get("journal"),
                "doi": paper.get("doi"),
                "citation_count": paper.get("citation_count") or 0,
                "year": year,
            }
        )
    years = sorted(
        [y for y in buckets if y != "Unknown"], key=lambda y: int(y) if y.isdigit() else 0
    )
    ordered = [{"year": y, "papers": buckets[y]} for y in years]
    if "Unknown" in buckets:
        ordered.append({"year": "Unknown", "papers": buckets["Unknown"]})
    return {"timeline": ordered, "total": len(papers)}
