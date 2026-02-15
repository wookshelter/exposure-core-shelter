import type { Edge, Node } from "../../types";
import {
  processComplexAppItem,
  processComplexProtocolItem,
  processTokenBalance,
} from "../../resolvers/debank/debankResolver";
import { fetchBundleWallets } from "../../resolvers/debank/fetcher";
import type { Adapter } from "../types";
import { fetchResolvMetrics, type ResolvMetrics } from "./metrics";

const RESOLV_BUNDLE_ID = "220554";

const ASSET_USR = "USR" as const;
const ASSET_WSTUSR = "wstUSR" as const;
const ASSET_RLP = "RLP" as const;

export interface ResolvCatalog {
  wallets: string[];
  metrics: ResolvMetrics;
}

export type ResolvAllocation =
  | { type: "metrics"; data: ResolvMetrics }
  | { type: "debankWallets"; wallets: string[] };

export const createResolvAdapter = (): Adapter<
  ResolvCatalog,
  ResolvAllocation
> => {
  return {
    id: "resolv",
    async fetchCatalog() {
      const [wallets, metrics] = await Promise.all([
        fetchBundleWallets(RESOLV_BUNDLE_ID),
        fetchResolvMetrics(),
      ]);

      return { wallets, metrics };
    },
    getAssetByAllocations(catalog) {
      const shared: ResolvAllocation[] = [
        { type: "metrics" as const, data: catalog.metrics },
        { type: "debankWallets" as const, wallets: catalog.wallets },
      ];

      return {
        [ASSET_USR]: shared,
        [ASSET_WSTUSR]: shared,
        [ASSET_RLP]: shared,
      };
    },
    buildRootNode(asset, allocations) {
      const metricsAlloc = allocations[0];

      if (!metricsAlloc || metricsAlloc.type !== "metrics") return null;

      const metrics = metricsAlloc.data;

      if (asset === ASSET_USR) {
        return {
          id: `global:resolv:usr`,
          chain: "global",
          name: "USR",
          protocol: "resolv",
          details: {
            kind: "Deposit",
          },
          tvlUsd: metrics.tvl.usr,
        };
      }

      if (asset === ASSET_WSTUSR) {
        return {
          id: `global:resolv:wstusr`,
          chain: "global",
          name: "wstUSR",
          protocol: "resolv",
          details: {
            kind: "Staked",
          },
          apy: metrics.apy.usr,
          tvlUsd: metrics.tvl.wstusr,
        };
      }

      if (asset === ASSET_RLP) {
        return {
          id: `global:resolv:rlp`,
          chain: "global",
          name: "RLP",
          protocol: "resolv",
          details: { kind: "Protection", curator: "resolv" },
          apy: metrics.apy.rlp,
          tvlUsd: metrics.tvl.rlp,
        };
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
