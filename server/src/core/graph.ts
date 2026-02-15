import type { Edge, GraphSnapshot, Node } from "../types";

export class GraphStore {
  private nodes = new Map<string, Node>();
  private edges = new Map<string, Edge>();

  upsertNode(node: Node): void {
    const current = this.nodes.get(node.id);

    if (!current) {
      this.nodes.set(node.id, node);

      return;
    }

    // Only fill missing (null/undefined) fields with incoming data.
    const merged: Node = { ...current };

    if (merged.chain == null && node.chain != null) merged.chain = node.chain;

    if (merged.protocol == null && node.protocol != null) {
      merged.protocol = node.protocol;
    }

    if (merged.apy == null && node.apy != null) merged.apy = node.apy;

    if (merged.tvlUsd == null && node.tvlUsd != null) {
      merged.tvlUsd = node.tvlUsd;
    }

    if (merged.details == null && node.details != null) {
      merged.details = node.details;
    }

    this.nodes.set(node.id, merged);
  }

  upsertNodes(nodes: Node[]): void {
    for (const node of nodes) {
      this.upsertNode(node);
    }
  }

  addEdge(edge: Edge): void {
    const key = `${edge.from}|${edge.to}|${edge.lendingPosition ?? ""}`;
    const current = this.edges.get(key);

    if (!current) {
      this.edges.set(key, { ...edge });

      return;
    }

    current.allocationUsd += edge.allocationUsd;
  }

  addEdges(edges: Edge[]): void {
    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  toSnapshot(meta: { sources: string[] }): GraphSnapshot {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      sources: meta.sources.slice(),
    };
  }
}
