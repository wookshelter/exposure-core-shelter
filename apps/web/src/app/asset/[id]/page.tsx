'use client';

import { useEffect, useRef, useState } from 'react';
import AssetTreeMap from '@/components/AssetTreeMap';
import AssetDetailPanel from '@/components/AssetDetailPanel';
import { GraphSnapshot, GraphNode } from '@/types';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { resolveRootNode, calculateNodeContext } from '@/lib/graph';

export default function AssetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const chain = searchParams.get('chain') || undefined;
  const focus = searchParams.get('focus') || undefined;
  const protocol = searchParams.get('protocol') || undefined;

  const [graphData, setGraphData] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [tvl, setTvl] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [focusRootNodeId, setFocusRootNodeId] = useState<string | null>(null);
  const [focusStack, setFocusStack] = useState<string[]>([]);
  const [pageTitle, setPageTitle] = useState<string>(id);
  const [lastTileClick, setLastTileClick] = useState<{ nodeId: string; seq: number } | null>(null);
  const tileClickSeq = useRef(0);

  const applyLocalDrilldown = (node: GraphNode) => {
    const currentFocus = focusRootNodeId ?? getRootNode()?.id ?? null;
    if (!currentFocus || currentFocus === node.id) {
      setFocusRootNodeId(node.id);
      return;
    }

    setFocusStack((prev) => [...prev, currentFocus]);
    setFocusRootNodeId(node.id);
  };

  const formatChainLabel = (value: string | undefined): string => {
    if (!value) return 'Unknown';
    const slug = value.trim().toLowerCase();

    switch (slug) {
      case 'eth':
      case 'ethereum':
        return 'Ethereum';
      case 'arb':
      case 'arbitrum':
        return 'Arbitrum';
      case 'op':
      case 'optimism':
        return 'Optimism';
      case 'base':
        return 'Base';
      case 'polygon':
      case 'matic':
        return 'Polygon';
      case 'hyper':
        return 'Hyper';
      case 'hyperliquid':
        return 'Hyperliquid';
      case 'uni':
      case 'unichain':
        return 'Unichain';
      case 'global':
        return 'Global';
      default:
        return slug.length > 0 ? slug[0].toUpperCase() + slug.slice(1) : 'Unknown';
    }
  };

  useEffect(() => {
    if (!id) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (protocol) queryParams.set('protocol', protocol);
        if (chain) queryParams.set('chain', chain);

        const response = await fetch(
          `/api/graph/${encodeURIComponent(id.trim().toLowerCase())}${
            queryParams.size ? `?${queryParams.toString()}` : ''
          }`,
        );
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const json: GraphSnapshot = await response.json();
        setGraphData(json);

        // Calculate Root TVL & Set Default Selection (Prioritize chain if provided)
        const rootNode = resolveRootNode(json.nodes, id, chain);
        
        if (rootNode) {
            const normalizedFocus = focus?.toLowerCase();
            const focusNode = normalizedFocus
              ? json.nodes.find(n => n.id.toLowerCase() === normalizedFocus)
              : undefined;

            const initial = focusNode || rootNode;
            setSelectedNode(initial);
            setFocusRootNodeId(initial.id);
            setFocusStack([]);

             const chainLabel = formatChainLabel(rootNode.chain ?? chain);
             const titleNode = focusNode || rootNode;
             setPageTitle(`${chainLabel} ${titleNode.name}`);

            if (rootNode.tvlUsd) {
                setTvl(rootNode.tvlUsd);
            } else {
                // Fallback sum of edges
                const { totalOutgoingUsd } = calculateNodeContext(rootNode, json.edges);
                setTvl(totalOutgoingUsd);
            }
        }

      } catch (error) {
        console.error(error);
        setGraphData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, chain, focus, protocol]); // Re-run if ID/chain/focus/protocol changes

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    compactDisplay: 'short',
  });

  const getRootNode = () => {
      if (!graphData) return null;
      return resolveRootNode(graphData.nodes, id, chain);
  };

  const handleReset = () => {
      const root = getRootNode();
      if (root) {
        setSelectedNode(root);
        setFocusRootNodeId(root.id);
        setFocusStack([]);
      }
  };

  const isRootSelected = selectedNode?.id === getRootNode()?.id;
  const isAtAssetRoot = focusStack.length === 0;

  const handleDrilldownSelect = async (
    node: GraphNode,
    meta?: {
      lendingPosition?: 'collateral' | 'borrow';
    },
  ) => {
    if (!node?.id) return;

    tileClickSeq.current += 1;
    setLastTileClick({ nodeId: node.id, seq: tileClickSeq.current });
    setSelectedNode(node);

    const normalizedNodeId = node.id.trim().toLowerCase();
    const normalizedAssetId = id.trim().toLowerCase();
    const canNavigateToChildGraph = normalizedNodeId.length > 0 && normalizedNodeId !== normalizedAssetId;
    const isLendingEdge = Boolean(meta?.lendingPosition);
    const isLendingNode = (node.details?.kind ?? '').toLowerCase() === 'lending';
    const shouldAttemptRouteNavigation = canNavigateToChildGraph && !isLendingEdge && !isLendingNode;

    if (shouldAttemptRouteNavigation) {
      const queryParams = new URLSearchParams();
      const nextProtocol = (node.protocol ?? protocol)?.trim();
      const nextChain = (node.chain ?? chain)?.trim();
      if (nextProtocol) queryParams.set('protocol', nextProtocol);
      if (nextChain) queryParams.set('chain', nextChain);

      const headUrl = `/api/graph/${encodeURIComponent(normalizedNodeId)}${
        queryParams.size ? `?${queryParams.toString()}` : ''
      }`;

      try {
        const res = await fetch(headUrl, { method: 'HEAD' });

        if (res.ok) {
          // Let the click flash render before navigation.
          await new Promise((r) => setTimeout(r, 180));
          router.push(
            `/asset/${encodeURIComponent(normalizedNodeId)}${
              queryParams.size ? `?${queryParams.toString()}` : ''
            }`,
          );
          return;
        }
      } catch {
        // Fall back to local drilldown.
      }
    }

    applyLocalDrilldown(node);
  };

  const handleBackOneStep = () => {
    if (!graphData) return;

    const prevId = focusStack[focusStack.length - 1];
    if (!prevId) return;

    setFocusStack((prev) => prev.slice(0, -1));
    setFocusRootNodeId(prevId);

    const prevNode = graphData.nodes.find((n) => n.id === prevId);
    if (prevNode) setSelectedNode(prevNode);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="p-8 text-center text-gray-500 h-screen flex flex-col items-center justify-center">
        <h2 className="text-xl font-semibold mb-2">Data Not Found</h2>
        <p>Could not load exposure data for {id}.</p>
        <Link href="/" className="mt-4 text-indigo-600 hover:underline">Return to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {pageTitle}
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">Strategy</span>
                </h1>
            </div>
        </div>
        <div className="flex gap-6 text-sm">
             <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider">Total Value Locked</p>
                <p className="font-bold text-gray-900 text-lg">{tvl ? currencyFormatter.format(tvl) : '-'}</p>
             </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left: Allocation Map (TreeMap) */}
        <div
          className="flex-grow h-[60vh] lg:h-auto lg:w-2/3 bg-gray-100 relative border-r border-gray-200 overflow-hidden"
        >
              <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur px-3 py-1 rounded-md text-xs font-bold text-gray-600 border border-gray-200 shadow-sm uppercase tracking-wide">
                 Allocation Map
              </div>
            <AssetTreeMap 
                data={graphData} 
                rootNodeId={focusRootNodeId ?? getRootNode()?.id ?? undefined}
                onSelect={handleDrilldownSelect} 
                selectedNodeId={selectedNode?.id} 
                lastClick={lastTileClick}
            />
         </div>

        {/* Right: Detail & Risk Panel */}
        <div className="lg:w-1/3 h-[40vh] lg:h-auto bg-white flex flex-col z-20 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.1)]">
            <AssetDetailPanel 
                selectedNode={selectedNode} 
                edges={graphData.edges}
                rootNodeId={focusRootNodeId ?? getRootNode()?.id ?? undefined}
                onReset={!isAtAssetRoot ? handleBackOneStep : undefined}
            />
        </div>

      </div>
    </div>
  );
}
