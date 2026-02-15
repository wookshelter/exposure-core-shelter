import type { Edge, Node } from "../../types";
import type { Adapter } from "../types";
import { isAllocationUsdEligible } from "../../resolvers/debank/utils";
import {
  buildMorphoMarketId,
  buildMorphoVaultId,
  resolveAllocationUsd,
} from "./utils";
import type { MorphoVaultV2, VaultV2Adapter } from "./vaultV2Query";
import type { MorphoVaultV1 } from "./vaultV1Query";
import type { MorphoAllocation } from "./types";
import { fetchVaultV1s } from "./vaultV1Query";
import { fetchVaultV2s } from "./vaultV2Query";

// NOTE: We could model the catalog as `(MorphoVaultV1 | MorphoVaultV2)[]`, but wrapping each entry
// as `{ vaultV1 } | { vaultV2 }` gives us a reliable discriminant (`"vaultV1" in entry`) and
// keeps v1/v2 branching explicit and type-safe.
type MorphoCatalog = { vaultV1: MorphoVaultV1 } | { vaultV2: MorphoVaultV2 };

export interface MorphoAllocationEntryV1 {
  vaultV1: MorphoVaultV1;
  allocation: MorphoAllocation;
}

export interface MorphoAllocationEntryV2 {
  vaultV2: MorphoVaultV2;
  adapter: VaultV2Adapter;
}

export const createMorphoAdapter = (): Adapter<
  MorphoCatalog[],
  MorphoAllocationEntryV1 | MorphoAllocationEntryV2
> => {
  return {
    id: "morpho",
    async fetchCatalog() {
      const [v1, v2] = await Promise.all([fetchVaultV1s(), fetchVaultV2s()]);

      return [
        ...v1.map((vaultV1) => ({ vaultV1 })),
        ...v2.map((vaultV2) => ({ vaultV2 })),
      ];
    },
    getAssetByAllocations(catalog) {
      const assetByAllocations: Record<
        string,
        (MorphoAllocationEntryV1 | MorphoAllocationEntryV2)[]
      > = {};

      for (const vault of catalog) {
        if (!vault) continue;

        if ("vaultV1" in vault) {
          const v1 = vault.vaultV1;

          if (!v1.state) continue;

          const totalAssetsUsd = v1.state.totalAssetsUsd;

          // Skip vaults with no assets (or missing TVL data).
          // This keeps empty/dust vaults from producing root-only snapshots.
          //
          // Also skip vaults with a blank display name (even if the address exists):
          // we've observed cases where onchain metadata and the Morpho subgraph provide
          // an empty/blank name. Those vaults are not useful in snapshots/search index.
          if (totalAssetsUsd == null) continue;

          if (!isAllocationUsdEligible(totalAssetsUsd)) continue;

          if (!v1.name.trim()) continue;

          const allocations = v1.state.allocation;

          if (allocations.length === 0) continue;

          const assetKey = v1.address;

          assetByAllocations[assetKey] ??= [];

          for (const allocation of allocations) {
            assetByAllocations[assetKey].push({
              vaultV1: v1,
              allocation,
            });
          }

          continue;
        }

        const v2 = vault.vaultV2;
        const adapters = v2.adapters.items ?? [];

        const totalAssetsUsd = v2.totalAssetsUsd;

        // Skip vaults with no assets (or missing TVL data).
        // This keeps empty/dust vaults from producing root-only snapshots.
        //
        // Also skip vaults with a blank display name (even if the address exists):
        // we've observed cases where onchain metadata and the Morpho subgraph provide
        // an empty/blank name. Those vaults are not useful in snapshots/search index.
        if (totalAssetsUsd == null) continue;

        if (!isAllocationUsdEligible(totalAssetsUsd)) continue;

        if (!v2.name.trim()) continue;

        if (adapters.length === 0) continue;

        const assetKey = v2.address;
        assetByAllocations[assetKey] ??= [];

        for (const adapter of adapters) {
          assetByAllocations[assetKey].push({
            vaultV2: v2,
            adapter,
          });
        }
      }

      return assetByAllocations;
    },
    buildRootNode(asset, allocations) {
      const vault = allocations[0];

      if (!vault) return null;

      const refinedVault = ((): {
        version: "v1" | "v2";
        chain: string;
        address: string;
        name: string;
        curator: string | null;
        apy: number | null;
        tvlUsd: number | null;
      } => {
        // Discriminate v1 vs v2 by allocation entry shape, not by vault fields.
        // v1 entries have `allocation` (VaultState.allocation), v2 entries have `adapter` (VaultV2.adapters).
        if ("allocation" in vault) {
          const v1 = vault.vaultV1;

          return {
            version: "v1",
            chain: v1.chain.network,
            address: v1.address,
            name: v1.name,
            curator: v1.state?.curators[0]?.name ?? null,
            apy: v1.state?.netApy ?? null,
            tvlUsd: v1.state?.totalAssetsUsd ?? null,
          };
        }

        const v2 = vault.vaultV2;

        return {
          version: "v2",
          chain: v2.chain.network,
          address: v2.address,
          name: v2.name,
          curator: v2.curators.items[0]?.name ?? null,
          apy: v2.netApy ?? null,
          tvlUsd: v2.totalAssetsUsd ?? null,
        };
      })();

      return {
        id: buildMorphoVaultId(
          refinedVault.chain,
          refinedVault.version,
          refinedVault.address,
        ),
        chain: refinedVault.chain,
        name: refinedVault.name.trim(),
        protocol: `morpho-${refinedVault.version}`,
        details: {
          kind: "Yield",
          curator: refinedVault.curator,
        },
        apy: refinedVault.apy,
        tvlUsd: refinedVault.tvlUsd,
      } satisfies Node;
    },
    buildEdge(root, allocationNode, allocation) {
      const allocationUsd =
        "allocation" in allocation
          ? resolveAllocationUsd(allocation.allocation)
          : (allocation.adapter.assetsUsd ?? 0);

      const edge: Edge = {
        from: root.id,
        to: allocationNode.id,
        allocationUsd,
      };

      return edge;
    },
    async normalizeLeaves(root, allocations) {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      for (const entry of allocations) {
        if ("allocation" in entry) {
          const allocationUsd = resolveAllocationUsd(entry.allocation);

          if (!isAllocationUsdEligible(allocationUsd)) continue;

          const market = entry.allocation.market;
          const chain = market.morphoBlue.chain.network;
          const nodeId = buildMorphoMarketId(chain, "v1", market.uniqueKey);

          const loanSymbol = market.loanAsset.symbol;
          const collateralSymbol = market.collateralAsset?.symbol ?? null;
          const name = collateralSymbol
            ? `${loanSymbol}/${collateralSymbol}`
            : loanSymbol;

          const allocationNode: Node = {
            id: nodeId,
            chain,
            name,
            protocol: "morpho-v1",
            details: { kind: "Lending Market" },
          };

          nodes.push(allocationNode);
          edges.push(this.buildEdge(root, allocationNode, entry));

          continue;
        }

        // Handle V2 Adapters
        const adapter = entry.adapter;

        // NOTE: Some V2 adapter entries only provide edges to other graph nodes.
        // For per-root snapshots to be usable by the UI, we emit minimal node definitions
        // for adapter targets so edges do not point to missing nodes.

        if (adapter.type === "MorphoMarketV1") {
          const positions = adapter.positions.items ?? [];
          const fallbackAllocationUsd = adapter.assetsUsd ?? 0;

          // Assumption: If Morpho returns a single market position but omits per-position USD values,
          // we treat the adapter's total `assetsUsd` as fully allocated to that one market.
          const canFallbackToAdapterTotal = positions.length === 1;

          for (const pos of positions) {
            const allocationUsd =
              pos.state?.supplyAssetsUsd ??
              (canFallbackToAdapterTotal ? fallbackAllocationUsd : 0);

            if (!isAllocationUsdEligible(allocationUsd)) continue;

            const market = pos.market;
            const chain = market.morphoBlue.chain.network;
            const nodeId = buildMorphoMarketId(chain, "v1", market.uniqueKey);

            const loanSymbol = market.loanAsset.symbol;
            const collateralSymbol = market.collateralAsset?.symbol ?? null;
            const name = collateralSymbol
              ? `${loanSymbol}/${collateralSymbol}`
              : loanSymbol;

            const allocationNode: Node = {
              id: nodeId,
              chain,
              name,
              protocol: "morpho-v1",
              details: { kind: "Lending Market" },
            };

            nodes.push(allocationNode);

            edges.push({
              from: root.id,
              to: nodeId,
              allocationUsd,
            });
          }
          continue;
        }

        if (adapter.type === "MetaMorpho") {
          const allocationUsd = adapter.assetsUsd ?? 0;

          if (!isAllocationUsdEligible(allocationUsd)) continue;

          const target = adapter.metaMorpho;
          const chain = entry.vaultV2.chain.network;
          const nodeId = buildMorphoVaultId(chain, "v1", target.address);

          const allocationNode: Node = {
            id: nodeId,
            chain,
            name: target.name.trim(),
            protocol: "morpho-v1",
            details: { kind: "Yield", curator: null },
          };

          nodes.push(allocationNode);

          edges.push({
            from: root.id,
            to: nodeId,
            allocationUsd,
          });

          continue;
        }
      }

      return { nodes, edges };
    },
  };
};
