'use client';

import { GraphNode, GraphEdge } from '@/types';
import { ShieldCheck, TrendingUp, AlertTriangle, Info, ExternalLink } from 'lucide-react';
import { getNodeLogoPath } from '@/lib/logos';

interface AssetDetailPanelProps {
  selectedNode: GraphNode | null;
  edges: GraphEdge[]; // To calculate connections if needed
  rootNodeId?: string;
  onReset?: () => void;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  compactDisplay: 'short',
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

export default function AssetDetailPanel({
  selectedNode,
  edges,
  rootNodeId,
  onReset,
}: AssetDetailPanelProps) {
  if (!selectedNode) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
        <Info className="w-12 h-12 mb-4 text-gray-300" />
        <p className="text-sm">Select a tile from the map to view details.</p>
      </div>
    );
  }

  // Calculate specific stats for this node relative to the graph
  // Assuming 'edges' passed are ALL edges, we filter for this node
  // If this node is a destination (allocations TO it)
  const incoming = edges.filter(e => e.to === selectedNode.id);
  const totalIncoming = incoming.reduce((acc, e) => acc + e.allocationUsd, 0);
  
  // If it has outgoing (further strategies)
  const outgoing = edges.filter(e => e.from === selectedNode.id);
  
  const rootOutgoingTotal = (() => {
    if (!rootNodeId) return 0;
    const outgoingFromRoot = edges.filter((e) => e.from === rootNodeId);
    return outgoingFromRoot.reduce(
      (sum, e) => sum + Math.abs(e.allocationUsd),
      0,
    );
  })();

  const shareOfAllocationMap = rootOutgoingTotal
    ? totalIncoming / rootOutgoingTotal
    : 0;

  const apyForDisplay =
    typeof selectedNode.apy === "number"
      ? selectedNode.apy > 1
        ? selectedNode.apy / 100
        : selectedNode.apy
      : null;

  const protocolLabel = (() => {
    switch (selectedNode.protocol) {
      case 'morpho-v1':
        return 'Morpho (v1)';
      case 'morpho-v2':
        return 'Morpho (v2)';
      default:
        return selectedNode.protocol || 'Unknown Protocol';
    }
  })();

  const morphoVaultVersion =
    selectedNode.details?.kind === 'Yield' &&
    (selectedNode.protocol === 'morpho-v1' || selectedNode.protocol === 'morpho-v2')
      ? selectedNode.protocol === 'morpho-v1'
        ? 'v1'
        : 'v2'
      : null;

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-xl overflow-y-auto">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        {/* Reset / Back Button */}
         {onReset && (
              <button 
                 onClick={onReset}
                 className="mb-4 flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-wide"
              >
                 <span className="text-lg">←</span> Back
              </button>
         )}
        
        <div className="flex items-start justify-between">
            <div>
                <div className="flex items-center gap-2">
                    {getNodeLogoPath(selectedNode) && (
                        <img 
                            src={getNodeLogoPath(selectedNode)!} 
                            alt="" 
                            className="w-6 h-6 object-contain" 
                        />
                    )}
                    <h2 className="text-xl font-bold text-gray-900 break-words">{selectedNode.name}</h2>
                </div>
                <div className="flex items-center gap-2 mt-1">
                     <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium uppercase tracking-wide">
                        {protocolLabel}
                     </span>
                    {selectedNode.chain && (
                         <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium uppercase tracking-wide">
                            {selectedNode.chain}
                        </span>
                    )}
                </div>
            </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-6">
             <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                 <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Allocation</p>
                 <p className="text-lg font-bold text-gray-900">{currencyFormatter.format(totalIncoming)}</p>
             </div>
             <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Allocation Share</p>
                  <p className="text-lg font-bold text-indigo-600">{percentFormatter.format(shareOfAllocationMap)}</p>
             </div>
        </div>
      </div>

      {/* Main Stats */}
      <div className="p-6 space-y-6">
        
        {/* Core Metrics */}
        <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-500" />
                Performance & Data
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">APY</span>
                    <span className="font-mono font-medium text-green-600">
                        {apyForDisplay !== null
                          ? percentFormatter.format(apyForDisplay)
                          : 'N/A'}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Curator</span>
                    <span className="font-medium text-gray-900 text-sm">
                        {selectedNode.details?.curator || 'N/A'}
                    </span>
                </div>
            </div>
        </div>

        {/* Risk Section */}
        <div>
             <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-gray-500" />
                Risk Analysis
            </h3>
             <div className="border border-yellow-100 bg-yellow-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-bold text-yellow-800">Risk Profile</h4>
                        <p className="text-xs text-yellow-700 mt-1 leading-relaxed">
                            This asset carries smart contract risk associated with {selectedNode.protocol}. 
                            Ensure you understand the underlying strategies.
                        </p>
                        
                        {selectedNode.details?.healthRate && (
                             <div className="mt-3 flex items-center gap-2">
                                <span className="text-xs font-bold text-yellow-800">Health Rate:</span>
                                <span className="text-xs font-mono bg-white px-2 py-1 rounded border border-yellow-200 text-yellow-900">
                                    {selectedNode.details.healthRate.toFixed(2)}
                                </span>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Details / Debug */}
        <div>
             <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-gray-500" />
                Node Details
            </h3>
            <div className="text-xs text-gray-500 font-mono bg-gray-50 p-3 rounded border border-gray-100 overflow-x-auto">
                 <p>ID: {selectedNode.id}</p>
                 <p>Type: {selectedNode.details?.kind || 'Asset'}</p>
                 {morphoVaultVersion && <p>Morpho Vault Version: {morphoVaultVersion}</p>}
                 {outgoing.length > 0 && (
                     <p className="mt-2 text-indigo-500">
                         + {outgoing.length} downstream allocations
                    </p>
                )}
            </div>
        </div>

      </div>
    </div>
  );
}
