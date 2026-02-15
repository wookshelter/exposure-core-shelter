import type { Edge, Node } from "../../types";
import type { Adapter } from "../types";
import { isAllocationUsdEligible } from "../../resolvers/debank/utils";
import { buildProtocolListItemId } from "../../resolvers/debank/utils";
import { normalizeProtocol, roundToTwoDecimals, toSlug } from "../../utils";
import { fetchGauntletMetrics, type GauntletMetrics } from "./metrics";

const GAUNTLET_PROTOCOL = "gauntlet" as const;
const ASSET_GAUNLET_USD_ALPHA = "gtUSDa" as const;

// Gauntlet adapter overrides.
// Intentionally kept as a single exported object so it can be edited manually
// without touching normalization logic.
const GAUNTLET_ASSET_NAME_OVERRIDES: Record<string, string> = {
  // Asset symbol -> UI name
  gtusdcc: "Gauntlet USDC Balanced",
  resolvusdc: "Resolv USDC",
  midasusdc: "Gauntlet USDC RWA",
  exmusdc: "Extrafi XLend USDC",

  // Raw vault/product name -> UI name
  // always check morpho ui, gauntlet ui
  "gauntlet-usdc-core": "Gauntlet USDC Balanced",
};

// Gauntlet UI hides small allocations; match that behavior for snapshot parity.
const MIN_GAUNTLET_UI_ALLOCATION_USD = 100_000;

const isGauntletUiAllocationEligible = (allocationUsd: number): boolean => {
  return allocationUsd >= MIN_GAUNTLET_UI_ALLOCATION_USD;
};

const chainIdToChain = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return "eth";
    case 10:
      return "op";
    case 42161:
      return "arb";
    case 8453:
      return "base";
    default:
      return String(chainId);
  }
};

export interface GauntletAllocation {
  data: GauntletMetrics;
}

export const createGauntletAdapter = (): Adapter<
  GauntletMetrics,
  GauntletAllocation
> => {
  return {
    id: GAUNTLET_PROTOCOL,
    async fetchCatalog() {
      return fetchGauntletMetrics();
    },
    getAssetByAllocations(catalog) {
      return {
        [ASSET_GAUNLET_USD_ALPHA]: [
          {
            data: catalog,
          },
        ],
      };
    },
    buildRootNode(_asset, allocations) {
      const entry = allocations[0];

      if (!entry) return null;

      const node: Node = {
        id: `global:${GAUNTLET_PROTOCOL}:gtusda`,
        chain: "global",
        name: "Gauntlet USD Alpha",
        protocol: GAUNTLET_PROTOCOL,
        details: { kind: "Yield", curator: GAUNTLET_PROTOCOL },
        apy: entry.data.summary.share_price_apy_30d.value,
        tvlUsd: roundToTwoDecimals(entry.data.summary.balance_usd.value),
      };

      return node;
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

      const entry = allocations[0];

      if (!entry) return { nodes, edges };

      const groups = entry.data.groups ?? [];

      for (const group of groups) {
        const isSupply = group.group === "supply";
        const isPrimaryAssets =
          group.group === "assets" && group.protocol == null;

        if (!isSupply && !isPrimaryAssets) continue;

        for (const asset of group.assets ?? []) {
          const allocationUsd = asset.metrics.balance_usd.value ?? 0;

          if (!isAllocationUsdEligible(allocationUsd)) continue;

          if (!isGauntletUiAllocationEligible(allocationUsd)) continue;

          const chain = chainIdToChain(asset.chainId);

          const protocol = (() => {
            if (asset.protocol) return asset.protocol;

            if (/^PT-/.test(asset.asset)) return "pendle";

            if (asset.asset === "USDC") return "circle";

            return null;
          })();

          if (!protocol) continue;

          const nodeId = buildProtocolListItemId(
            chain,
            protocol,
            toSlug(asset.assetAddress),
          );

          const name =
            asset.displayName ??
            GAUNTLET_ASSET_NAME_OVERRIDES[toSlug(asset.asset)] ??
            toSlug(asset.asset);

          nodes.push({
            id: nodeId,
            chain,
            name: name,
            protocol: normalizeProtocol(protocol),
          });

          edges.push({ from: root.id, to: nodeId, allocationUsd });
        }
      }

      return { nodes, edges };
    },
  };
};
