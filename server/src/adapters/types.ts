import type { Edge, Node } from "../types";

export type AnyAdapter = Adapter<unknown, unknown>;

export interface GraphResult {
  nodes: Node[];
  edges: Edge[];
}

export interface Adapter<TCatalog, TAllocation> {
  id: string;
  fetchCatalog(): Promise<TCatalog>;
  getAssetByAllocations(catalog: TCatalog): Record<string, TAllocation[]>;
  buildRootNode(asset: string, allocations: TAllocation[]): Node | null;
  buildEdge(root: Node, allocationNode: Node, allocation: TAllocation): Edge;
  normalizeLeaves(node: Node, allocations: TAllocation[]): Promise<GraphResult>;
}
