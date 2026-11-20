import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { Maximize2, RefreshCw, Search, SlidersHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { NetworkGraph } from '../types';

interface ResearchNetworkMapProps {
  graph: NetworkGraph;
  selectedId?: string | null;
  onSelect: (paperId: string) => void;
  height?: number;
}

const NODE_COLORS: Record<string, string> = {
  seed: '#3268BB',
  reference: '#F2A65A',
  citation: '#9C8CF5',
  related: '#5FA98C',
  saved: '#C7E15A',
};

const EDGE_COLORS: Record<string, string> = {
  cites: '#94A3B8',
  co_cited: '#CBD5E1',
  recommendation: '#EAE9FA',
};

type LayoutName = 'cose' | 'concentric' | 'breadthfirst' | 'circle';

export const ResearchNetworkMap: React.FC<ResearchNetworkMapProps> = ({
  graph,
  selectedId,
  onSelect,
  height = 560,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [layout, setLayout] = useState<LayoutName>('cose');
  const [edgeFilter, setEdgeFilter] = useState({ cites: true, co_cited: true, recommendation: true });
  const [search, setSearch] = useState('');
  const [showControls, setShowControls] = useState(true);

  const elements = useMemo<ElementDefinition[]>(() => {
    const nodes: ElementDefinition[] = graph.nodes.map((node) => ({
      data: {
        id: node.id,
        label: node.label,
        type: node.type,
        saved: node.saved ? 1 : 0,
        year: node.year,
        citations: node.citation_count,
        title: node.title,
        journal: node.journal,
        doi: node.doi,
      },
    }));
    const ids = new Set(graph.nodes.map((n) => n.id));
    const edges: ElementDefinition[] = graph.edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge, index) => ({
        data: {
          id: `edge-${index}`,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          label: edge.label,
          explanation: edge.explanation || '',
        },
      }));
    return [...nodes, ...edges];
  }, [graph]);

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: any) => {
              if (ele.data('saved')) return NODE_COLORS.saved;
              return NODE_COLORS[ele.data('type')] || NODE_COLORS.related;
            },
            label: 'data(label)',
            'font-size': 8,
            'font-family': 'Inter, system-ui, sans-serif',
            color: '#14233F',
            'text-wrap': 'wrap',
            'text-max-width': '120px',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            width: (ele: any) => 18 + Math.min(20, Math.log10(1 + (ele.data('citations') || 0)) * 8),
            height: (ele: any) => 18 + Math.min(20, Math.log10(1 + (ele.data('citations') || 0)) * 8),
            'border-width': 2,
            'border-color': '#FFFFFF',
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'node[type = "seed"]',
          style: { 'border-width': 4, 'border-color': '#14233F', 'font-weight': 700 },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 5, 'border-color': '#14233F' },
        },
        {
          selector: 'node[?saved]',
          style: { 'border-width': 3, 'border-color': '#14233F' },
        },
        {
          selector: 'edge',
          style: {
            width: 1.2,
            'line-color': (ele: any) => EDGE_COLORS[ele.data('type')] || '#CBD5E1',
            'target-arrow-color': (ele: any) => EDGE_COLORS[ele.data('type')] || '#CBD5E1',
            'target-arrow-shape': (ele: any) => (ele.data('type') === 'cites' ? 'triangle' : 'none'),
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            opacity: 0.9,
          },
        },
        {
          selector: 'edge[type = "recommendation"]',
          style: { 'line-style': 'dashed', width: 1.4 },
        },
        {
          selector: 'edge[type = "co_cited"]',
          style: { 'line-style': 'dotted', opacity: 0.55 },
        },
        { selector: '.dimmed', style: { opacity: 0.15 } },
        { selector: '.highlighted', style: { 'border-width': 5, 'border-color': '#C87672' } },
      ],
      maxZoom: 3,
      minZoom: 0.2,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (event) => {
      const id = event.target.id();
      onSelect(id);
      cy.elements().removeClass('dimmed');
      const neighbourhood = event.target.closedNeighborhood();
      cy.elements().not(neighbourhood).addClass('dimmed');
    });
    cy.on('tap', (event) => {
      if (event.target === cy) {
        cy.elements().removeClass('dimmed');
      }
    });

    cy.layout({ name: 'cose', animate: false, padding: 40, nodeRepulsion: () => 14000 } as any).run();
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges().forEach((edge) => {
      const type = edge.data('type');
      const visible = (edgeFilter as any)[type] !== false;
      edge.style('display', visible ? 'element' : 'none');
    });
  }, [edgeFilter, elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$('node').removeClass('highlighted');
    if (selectedId) {
      const node = cy.$id(selectedId);
      if (node.length) {
        node.addClass('highlighted');
        cy.animate({ center: { eles: node }, zoom: Math.max(1, cy.zoom()) }, { duration: 250 });
      }
    }
  }, [selectedId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$('node').removeClass('highlighted');
    const term = search.trim().toLowerCase();
    if (!term) return;
    cy.nodes().forEach((node) => {
      const haystack = `${node.data('label')} ${node.data('journal')} ${node.data('year')}`.toLowerCase();
      if (haystack.includes(term)) node.addClass('highlighted');
    });
  }, [search]);

  const runLayout = (name: LayoutName) => {
    setLayout(name);
    const cy = cyRef.current;
    if (!cy) return;
    cy.layout({
      name,
      animate: true,
      animationDuration: 400,
      padding: 40,
      ...(name === 'concentric'
        ? { concentric: (node: any) => node.degree(), levelWidth: () => 3 }
        : {}),
      ...(name === 'breadthfirst' ? { directed: true, spacingFactor: 1.1 } : {}),
    } as any).run();
  };

  if (!graph.nodes.length) {
    return (
      <div
        className="rounded-2xl border border-dashed border-[#E8E7E1] bg-[#FAF9F5] flex flex-col items-center justify-center text-center p-10"
        style={{ minHeight: height }}
      >
        <SlidersHorizontal className="w-7 h-7 text-[#687387] mb-2" />
        <p className="text-sm font-bold text-[#14233F]">No network yet</p>
        <p className="text-xs text-[#687387] mt-1 max-w-sm">
          Select one or more seed papers and build the network to explore citation
          relationships.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-[#687387] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Highlight a node by title, journal or year"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E8E7E1] bg-white outline-none focus:border-[#3268BB]"
          />
        </div>

        <button
          onClick={() => setShowControls((s) => !s)}
          className="px-2.5 py-1.5 rounded-lg border border-[#E8E7E1] bg-white text-[11px] font-semibold text-[#14233F] hover:bg-[#FAF9F5] flex items-center gap-1.5"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
        </button>

        <select
          value={layout}
          onChange={(e) => runLayout(e.target.value as LayoutName)}
          className="px-2 py-1.5 rounded-lg border border-[#E8E7E1] bg-white text-[11px] font-medium outline-none"
        >
          <option value="cose">Force layout</option>
          <option value="concentric">Concentric</option>
          <option value="breadthfirst">Hierarchical</option>
          <option value="circle">Circle</option>
        </select>

        <div className="flex items-center gap-1">
          <button
            onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)}
            className="p-1.5 rounded-lg border border-[#E8E7E1] bg-white hover:bg-[#FAF9F5]"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
            className="p-1.5 rounded-lg border border-[#E8E7E1] bg-white hover:bg-[#FAF9F5]"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => cyRef.current?.fit(undefined, 40)}
            className="p-1.5 rounded-lg border border-[#E8E7E1] bg-white hover:bg-[#FAF9F5]"
            title="Fit to screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => runLayout(layout)}
            className="p-1.5 rounded-lg border border-[#E8E7E1] bg-white hover:bg-[#FAF9F5]"
            title="Reset map"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showControls && (
        <div className="flex flex-wrap items-center gap-4 px-3 py-2 rounded-lg bg-white border border-[#E8E7E1] text-[11px]">
          <span className="font-mono uppercase tracking-wider text-[#687387]">Relationships</span>
          {(
            [
              ['cites', 'Citations', 'bg-slate-400'],
              ['co_cited', 'Co-citations', 'bg-slate-300'],
              ['recommendation', 'Similar (recommended)', 'bg-[#EAE9FA]'],
            ] as const
          ).map(([key, label, dot]) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={(edgeFilter as any)[key]}
                onChange={(e) => setEdgeFilter({ ...edgeFilter, [key]: e.target.checked })}
                className="accent-[#3268BB]"
              />
              <span className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="text-[#14233F]">{label}</span>
            </label>
          ))}
          <span className="ml-auto font-mono text-[#687387]">
            {graph.stats?.nodes ?? graph.nodes.length} nodes · {graph.stats?.edges ?? graph.edges.length} edges
          </span>
        </div>
      )}

      <div className="relative rounded-2xl border border-[#E8E7E1] bg-white overflow-hidden">
        <div ref={containerRef} style={{ height }} className="w-full" />
        <div className="absolute left-3 bottom-3 bg-white/95 border border-[#E8E7E1] rounded-lg p-2.5 space-y-1 shadow-subtle">
          <div className="text-[9px] font-mono uppercase tracking-wider text-[#687387] mb-1">Legend</div>
          {(
            [
              ['seed', 'Seed paper'],
              ['reference', 'Referenced (earlier)'],
              ['citation', 'Citing (newer)'],
              ['related', 'Related (recommended)'],
              ['saved', 'Saved paper'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: NODE_COLORS[key] }}
              />
              <span className="text-[10px] text-[#14233F]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
