import type { Edge, Node } from "../../types";
import { roundToTwoDecimals, toSlug } from "../../utils";
import type { Adapter } from "../types";
import {
  fetchSkyAllocations,
  fetchSkyMetrics,
  type SkyIlk,
  type SkyMetrics,
} from "./metrics";

const SKY_PROTOCOL = "sky";
const ASSET_STUSDS = "stUSDS";
const ASSET_SUSDS = "sUSDS";
const ASSET_USDS = "USDS";

export interface SkyCatalog {
  metrics: SkyMetrics;
  allocations: SkyIlk[];
}

export type SkyAllocation =
  | { type: "metrics"; data: SkyMetrics }
  | { type: "allocations"; data: SkyIlk[] };

export const createSkyAdapter = (): Adapter<SkyCatalog, SkyAllocation> => {
  return {
    id: SKY_PROTOCOL,
    async fetchCatalog() {
      const [metrics, allocations] = await Promise.all([
        fetchSkyMetrics(),
        fetchSkyAllocations(),
      ]);

      return { metrics, allocations };
    },
    getAssetByAllocations(catalog) {
      const shared: SkyAllocation[] = [
        { type: "metrics" as const, data: catalog.metrics },
        { type: "allocations" as const, data: catalog.allocations },
      ];

      return {
        [ASSET_STUSDS]: shared,
        [ASSET_SUSDS]: shared,
        [ASSET_USDS]: shared,
      };
    },
    buildRootNode(asset, allocations) {
      const metricsAlloc = allocations[0];

      if (!metricsAlloc || metricsAlloc.type !== "metrics") return null;

      const metrics = metricsAlloc.data;
      const slug = toSlug(asset);

      if (slug !== "stusds" && slug !== "susds" && slug !== "usds") {
        return null;
      }

      const details =
        asset === ASSET_USDS
          ? { kind: "Deposit" as const }
          : asset === ASSET_SUSDS
            ? { kind: "Staked" as const }
            : { kind: "Yield" as const, curator: SKY_PROTOCOL };

      return {
        id: `global:${SKY_PROTOCOL}:${slug}`,
        chain: "global",
        name: asset,
        protocol: SKY_PROTOCOL,
        details,
        tvlUsd: metrics.tvlUsd[slug],
        apy: metrics.apy[slug],
      };
    },
    buildEdge(root, allocationNode) {
      return {
        from: root.id,
        to: allocationNode.id,
        allocationUsd: 0,
      };
    },
    async normalizeLeaves(root, allocations) {
      const allocsData = allocations.find((a) => a.type === "allocations");

      if (!allocsData || allocsData.type !== "allocations") {
        return { nodes: [], edges: [] };
      }

      const ilks = allocsData.data;
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      for (const ilk of ilks) {
        const nodeId = `global:${SKY_PROTOCOL}:${toSlug(ilk.ilk)}`;

        nodes.push({
          id: nodeId,
          chain: "global",
          name: ilk.ilk,
          details: { kind: "Investment" },
        });

        edges.push({
          from: root.id,
          to: nodeId,
          allocationUsd: roundToTwoDecimals(Number(ilk.collateral)),
        });
      }

      return { nodes, edges };
    },
  };
};
