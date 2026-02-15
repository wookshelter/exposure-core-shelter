import type { Edge, Node } from "../../types";
import {
  processComplexAppItem,
  processComplexProtocolItem,
  processTokenBalance,
} from "../../resolvers/debank/debankResolver";
import { fetchBundleWallets } from "../../resolvers/debank/fetcher";
import type { Adapter } from "../types";
import { fetchYuzuMetrics, type YuzuMetrics } from "./metrics";

const YUZU_BUNDLE_ID = "220643";

const ASSET_YZUSD = "yzUSD" as const;
const ASSET_SYZUSD = "sYzuUSD" as const;
const ASSET_YZPP = "yzPP" as const;

export interface YuzuCatalog {
  wallets: string[];
  metrics: YuzuMetrics;
}

export type YuzuAllocation =
  | { type: "metrics"; data: YuzuMetrics }
  | { type: "debankWallets"; wallets: string[] };

export const createYuzuAdapter = (): Adapter<YuzuCatalog, YuzuAllocation> => {
  return {
    id: "yuzu",
    async fetchCatalog() {
      const [wallets, metrics] = await Promise.all([
        fetchBundleWallets(YUZU_BUNDLE_ID),
        fetchYuzuMetrics(),
      ]);

      return { wallets, metrics };
    },
    getAssetByAllocations(catalog) {
      const shared: YuzuAllocation[] = [
        { type: "metrics" as const, data: catalog.metrics },
        { type: "debankWallets" as const, wallets: catalog.wallets },
      ];

      return {
        [ASSET_YZUSD]: shared,
        [ASSET_SYZUSD]: shared,
        [ASSET_YZPP]: shared,
      };
    },
    buildRootNode(asset, allocations) {
      const metricsAlloc = allocations[0];

      if (!metricsAlloc || metricsAlloc.type !== "metrics") return null;

      const metrics = metricsAlloc.data;

      if (asset === ASSET_YZUSD) {
        return {
          id: "global:yuzu:yzusd",
          chain: "global",
          name: "yzUSD",
          protocol: "yuzu",
          details: { kind: "Deposit" },
          tvlUsd: metrics.tvl.yzusd,
        } satisfies Node;
      }

      if (asset === ASSET_SYZUSD) {
        return {
          id: "global:yuzu:syzusd",
          chain: "global",
          name: "syzUSD",
          protocol: "yuzu",
          details: { kind: "Yield", curator: "yuzu" },
          apy: metrics.apy.syzusd,
          tvlUsd: metrics.tvl.syzusd,
        } satisfies Node;
      }

      if (asset === ASSET_YZPP) {
        return {
          id: "global:yuzu:yzpp",
          chain: "global",
          name: "yzPP",
          protocol: "yuzu",
          details: { kind: "Protection", curator: "yuzu" },
          apy: metrics.apy.yzpp,
          tvlUsd: metrics.tvl.yzpp,
        } satisfies Node;
      }

      return null;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    buildEdge(root, allocationNode, allocation) {
      const edge: Edge = {
        from: root.id,
        to: allocationNode.id,
        allocationUsd: 0,
      };

      return edge;
    },
    async normalizeLeaves(root, allocations) {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      const walletsAlloc = allocations[1];
      if (!walletsAlloc || walletsAlloc.type !== "debankWallets") {
        return { nodes, edges };
      }

      for (const walletAddress of walletsAlloc.wallets) {
        const results = await Promise.all([
          processComplexProtocolItem(walletAddress, root.id),
          processComplexAppItem(walletAddress, root.id),
          processTokenBalance(walletAddress, root.id),
        ]);

        for (const result of results) {
          nodes.push(...result.nodes);
          edges.push(...result.edges);
        }
      }

      return { nodes, edges };
    },
  };
};
