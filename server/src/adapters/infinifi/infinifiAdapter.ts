import type { Edge, Node } from "../../types";
import {
  processComplexAppItem,
  processComplexProtocolItem,
} from "../../resolvers/debank/debankResolver";
import { fetchBundleWallets } from "../../resolvers/debank/fetcher";
import { roundToTwoDecimals } from "../../utils";
import type { Adapter } from "../types";

const INFINIFI_BUNDLE_ID = "220816";
const INFINIFI_API_URL = "https://eth-api.infinifi.xyz/api/protocol/data";

const INFINIFI_CHAIN = "eth" as const;
const INFINIFI_PROTOCOL = "infinifi" as const;
const MIN_IDLE_THRESHOLD = 0.01;

const ASSET_IUSD = "iUSD" as const;
const ASSET_SIUSD = "siUSD" as const;

interface InfinifiLockedStats {
  name: string;
  address: string;
  decimals: number;
  bucketMaturity: number;
  totalSupplyNormalized: number;
  exchangeRateNormalized: number;
  totalLockedNormalized: number;
  average30dAPY: number;
}

interface InfinifiStats {
  asset: {
    totalTVLAssetNormalized: number;
  };
  receipt: {
    name: string;
    totalSupplyNormalized: number;
    totalStakedNormalized: number;
    totalLockedNormalized: number;
    totalUnwindingNormalized: number;
  };
  staked: {
    name: string;
    totalSupplyNormalized: number;
    exchangeRateNormalized: number;
    average30dAPY: number;
  };
  locked: Record<string, InfinifiLockedStats>;
}

interface InfinifiApiData {
  stats: InfinifiStats;
  farms: unknown[];
}

export interface InfinifiCatalog {
  apiData: InfinifiApiData;
  wallets: string[];
}

const buildInfinifiNodeId = (identifier: string): string =>
  `${INFINIFI_CHAIN}:${INFINIFI_PROTOCOL}:${identifier}`;

const normalizeiUSDLeaves = (
  root: Node,
  stats: InfinifiStats,
): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 1. siUSD node
  const totalStakedInUsd = roundToTwoDecimals(
    stats.staked.totalSupplyNormalized * stats.staked.exchangeRateNormalized,
  );

  const siUsdNode: Node = {
    id: buildInfinifiNodeId("siusd"),
    chain: INFINIFI_CHAIN,
    name: stats.staked.name,
    protocol: INFINIFI_PROTOCOL,
    details: { kind: "Staked" },
    apy: stats.staked.average30dAPY,
    tvlUsd: totalStakedInUsd,
  };

  nodes.push(siUsdNode);

  edges.push({
    from: root.id,
    to: siUsdNode.id,
    allocationUsd: totalStakedInUsd,
  });

  // 2. liUSD variants
  for (const [address, locked] of Object.entries(stats.locked)) {
    const totalLockedInUsd = roundToTwoDecimals(
      locked.totalSupplyNormalized * locked.exchangeRateNormalized,
    );

    const liUsdNode: Node = {
      id: buildInfinifiNodeId(address.toLowerCase()),
      chain: INFINIFI_CHAIN,
      name: locked.name,
      protocol: INFINIFI_PROTOCOL,
      details: { kind: "Locked" },
      apy: locked.average30dAPY,
      tvlUsd: totalLockedInUsd,
    };

    nodes.push(liUsdNode);

    edges.push({
      from: root.id,
      to: liUsdNode.id,
      allocationUsd: totalLockedInUsd,
    });
  }

  // 3. Unwinding
  if (stats.receipt.totalUnwindingNormalized > 0) {
    const unwindingNode: Node = {
      id: buildInfinifiNodeId("unwinding"),
      chain: INFINIFI_CHAIN,
      name: "Unwinding iUSD",
      protocol: INFINIFI_PROTOCOL,
      details: { kind: "Deposit" },
    };

    nodes.push(unwindingNode);

    edges.push({
      from: root.id,
      to: unwindingNode.id,
      allocationUsd: stats.receipt.totalUnwindingNormalized,
    });
  }

  // 4. Idle (neither staked nor locked)
  const idleAmount =
    stats.receipt.totalSupplyNormalized -
    stats.receipt.totalStakedNormalized -
    stats.receipt.totalLockedNormalized -
    stats.receipt.totalUnwindingNormalized;

  if (idleAmount > MIN_IDLE_THRESHOLD) {
    const idleNode: Node = {
      id: buildInfinifiNodeId("idle"),
      chain: INFINIFI_CHAIN,
      name: "Idle iUSD",
      protocol: INFINIFI_PROTOCOL,
      details: { kind: "Deposit" },
    };

    nodes.push(idleNode);

    edges.push({ from: root.id, to: idleNode.id, allocationUsd: idleAmount });
  }

  return { nodes, edges };
};

const normalizeSiUSDLeaves = async (
  root: Node,
  wallets: string[],
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const walletAddress of wallets) {
    const results = await Promise.all([
      processComplexProtocolItem(walletAddress, root.id),
      processComplexAppItem(walletAddress, root.id),
    ]);

    for (const result of results) {
      nodes.push(...result.nodes);
      edges.push(...result.edges);
    }
  }

  return { nodes, edges };
};

export type InfinifiAllocation =
  | { type: "infinifiApi"; data: InfinifiApiData }
  | { type: "debankWallets"; wallets: string[] };

export const createInfinifiAdapter = (): Adapter<
  InfinifiCatalog,
  InfinifiAllocation
> => {
  return {
    id: "infinifi",
    async fetchCatalog() {
      const [apiResponse, wallets] = await Promise.all([
        fetch(INFINIFI_API_URL),
        fetchBundleWallets(INFINIFI_BUNDLE_ID),
      ]);

      if (!apiResponse.ok) {
        throw new Error(
          `Infinifi API error: ${apiResponse.status} ${apiResponse.statusText}`,
        );
      }

      const json = await apiResponse.json();

      if (!json?.data?.stats) {
        throw new Error("Infinifi API returned invalid data");
      }

      return {
        apiData: json.data,
        wallets,
      };
    },
    getAssetByAllocations(catalog) {
      return {
        iUSD: [{ type: "infinifiApi" as const, data: catalog.apiData }],
        siUSD: [
          { type: "infinifiApi" as const, data: catalog.apiData },
          { type: "debankWallets" as const, wallets: catalog.wallets },
        ],
      };
    },
    buildRootNode(asset, allocations) {
      const alloc = allocations[0];

      if (!alloc || alloc.type !== "infinifiApi") return null;

      const stats = alloc.data.stats;

      if (asset === ASSET_IUSD) {
        return {
          id: buildInfinifiNodeId("iusd"),
          chain: INFINIFI_CHAIN,
          name: stats.receipt.name,
          protocol: INFINIFI_PROTOCOL,
          details: { kind: "Deposit" },
          tvlUsd: stats.receipt.totalSupplyNormalized,
        };
      }

      if (asset === ASSET_SIUSD) {
        return {
          id: buildInfinifiNodeId("siusd"),
          chain: INFINIFI_CHAIN,
          name: "siUSD",
          protocol: INFINIFI_PROTOCOL,
          details: { kind: "Yield", curator: INFINIFI_PROTOCOL },
          tvlUsd: roundToTwoDecimals(
            stats.staked.totalSupplyNormalized *
              stats.staked.exchangeRateNormalized,
          ),
          apy: stats.staked.average30dAPY,
        };
      }

      return null;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    buildEdge(root, allocationNode, allocation) {
      return {
        from: root.id,
        to: allocationNode.id,
        allocationUsd: 0,
      };
    },
    async normalizeLeaves(root, allocations) {
      if (root.id === buildInfinifiNodeId("iusd")) {
        const [apiAlloc] = allocations;

        if (!apiAlloc || apiAlloc.type !== "infinifiApi") {
          return { nodes: [], edges: [] };
        }

        return normalizeiUSDLeaves(root, apiAlloc.data.stats);
      }

      if (root.id === buildInfinifiNodeId("siusd")) {
        const [, walletAlloc] = allocations;

        if (!walletAlloc || walletAlloc.type !== "debankWallets") {
          return { nodes: [], edges: [] };
        }

        return normalizeSiUSDLeaves(root, walletAlloc.wallets);
      }

      return { nodes: [], edges: [] };
    },
  };
};
