import { GraphNode, GraphEdge } from '@/types';

/**
 * Finds the root node for a given asset ID, prioritizing the global chain.
 */
export function resolveRootNode(nodes: GraphNode[], assetId: string, chain?: string): GraphNode | undefined {
  if (!nodes.length) return undefined;

  const normalizedId = assetId.toLowerCase();
  
  // 1. If chain is specified, look for exact match on ID + Chain
  if (chain) {
    const normalizedChain = chain.toLowerCase();
    const chainMatch = nodes.find(n => 
      n.id.toLowerCase().includes(normalizedId) && 
      n.chain?.toLowerCase() === normalizedChain
    );
    if (chainMatch) return chainMatch;
  }
  
  // 2. Priority: Exact match on ID + Global chain (Default behavior)
  const globalRoot = nodes.find(n => 
    n.id.toLowerCase().includes(normalizedId) && n.chain === 'global'
  );
  
  if (globalRoot) return globalRoot;
  
  // 3. Fallback: First node matching ID
  return nodes.find(n => n.id.toLowerCase().includes(normalizedId)) || nodes[0];
}

/**
 * Structure representing a child in the graph hierarchy
 */
export interface GraphChild {
  node?: GraphNode;
  edge: GraphEdge;
  id: string;
  value: number; // Allocation USD (abs)
  percent: number; // Share of parent's total outgoing
}

/**
 * Resolves immediate children for a given parent node based on edges.
 * Adapts flat edge list into a hierarchical list for visualization.
 */
export function getDirectChildren(
  parentNode: GraphNode, 
  allNodes: GraphNode[], 
  allEdges: GraphEdge[]
): GraphChild[] {
  const outgoingEdges = allEdges.filter(e => e.from === parentNode.id);
  
  const totalValue = outgoingEdges.reduce((sum, e) => sum + Math.abs(e.allocationUsd), 0);
  const safeTotal = totalValue || 1; // Prevent division by zero

  return outgoingEdges.map(edge => {
    const targetNode = allNodes.find(n => n.id === edge.to);
    const value = Math.abs(edge.allocationUsd);
    
    return {
      node: targetNode, 
      edge: edge,
      id: edge.to,
      value: value,
      percent: value / safeTotal
    };
  }).sort((a, b) => b.value - a.value);
}

/**
 * Calculates aggregated statistics for a node context.
 */
export function calculateNodeContext(
  node: GraphNode, 
  allEdges: GraphEdge[],
  rootTvl?: number
) {
  const incoming = allEdges.filter(e => e.to === node.id);
  const outgoing = allEdges.filter(e => e.from === node.id);
  
  const totalIncomingUsd = incoming.reduce((acc, e) => acc + e.allocationUsd, 0);
  const totalOutgoingUsd = outgoing.reduce((acc, e) => acc + e.allocationUsd, 0);
  
  // If rootTvl is provided, calculate share. Otherwise 0.
  const shareOfPortfolio = rootTvl ? (totalIncomingUsd / rootTvl) : 0;
  
  return {
    incoming,
    outgoing,
    totalIncomingUsd,
    totalOutgoingUsd,
    shareOfPortfolio,
    isLeaf: outgoing.length === 0
  };
}
