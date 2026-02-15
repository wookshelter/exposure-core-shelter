import type { Edge, Node } from "../../types";
import { roundToTwoDecimals } from "../../utils";
import { formatUnits, type Address } from "viem";
import type { Adapter } from "../types";
import {
  fetchEulerEarnVaults,
  fetchEulerEvkVaults,
  fetchEulerLabelsVaults,
  fetchEulerPrices,
  fetchEulerVaultOpenInterest,
  type EulerEarnVault,
  type EulerLabelsVault,
  type EulerEvkVault,
} from "./metrics";

const EULER_PROTOCOL = "euler";
const EULER_CHAIN = "eth";

/**
 * EulerEarnVault (subgraph) does not expose the underlying ERC-20 `decimals` for `earnVault.asset`.
 *
 * We need those decimals to convert raw `totalAssets` / `allocatedAssets` (base units) into token units
 * before applying USD prices.
 *
 * Strategy vaults (EVK) do expose `decimals`. When we find an EVK strategy vault whose `asset` matches
 * the Earn underlying `asset`, we reuse that EVK vault's `decimals` as the best available proxy for the
 * underlying token's decimals.
 */
const getEarnAssetDecimals = (
  earnVault: EulerEarnVault,
  evkVaultMap: Map<Address, EulerEvkVault>,
): number => {
  const underlying = earnVault.asset;

  for (const { strategy } of earnVault.strategies) {
    const evk = evkVaultMap.get(strategy);

    if (evk?.asset === underlying) return evk.decimals;
  }

  return 18;
};

const parseRayApy = (raw: string | undefined | null): number | null =>
  raw ? Number(formatUnits(BigInt(raw), 27)) : null;

const getVaultLabelName = (
  labelsByVault: Map<string, EulerLabelsVault>,
  vaultId: Address,
): string | null => {
  const vault = labelsByVault.get(vaultId.toLowerCase());

  if (!vault) return null;

  return vault.name;
};

const eulerNodeId = (address: Address): string =>
  `${EULER_CHAIN}:${EULER_PROTOCOL}:${address.toLowerCase()}`;

export interface EulerCatalog {
  earnVaults: EulerEarnVault[];
  evkVaultMap: Map<Address, EulerEvkVault>;
  labelsByVault: Map<string, EulerLabelsVault>;
  pricesByAsset: Map<Address, number>;
  openInterestByLiability: Map<Address, Map<Address, number>>;
}

export type EulerAllocation =
  | {
      type: "earnVault";
      earnVault: EulerEarnVault;
      evkVaultMap: Map<Address, EulerEvkVault>;
      labelsByVault: Map<string, EulerLabelsVault>;
      pricesByAsset: Map<Address, number>;
    }
  | {
      type: "evkVault";
      evkVault: EulerEvkVault;
      collateralOpenInterestUsd: Map<Address, number>;
      evkVaultMap: Map<Address, EulerEvkVault>;
      labelsByVault: Map<string, EulerLabelsVault>;
      pricesByAsset: Map<Address, number>;
    };

export const createEulerAdapter = (): Adapter<
  EulerCatalog,
  EulerAllocation
> => {
  /**
   * Graph model construction order (mainnet / `eth`):
   * 1) Fetch governed EulerEarn vaults from the subgraph (root nodes of kind "Yield").
   * 2) Fetch Euler labels to override vault display names (matches Euler UI naming).
   * 3) Fetch Euler UI prices to convert token balances to USD.
   * 4) Fetch indexer open-interest to define the EVK root universe and collateral weights.
   * 5) Consolidate all EVK addresses we need:
   *    - Earn strategy EVKs (for Earn -> EVK edges)
   *    - Open-interest liability + collateral EVKs (for EVK -> collateral edges)
   * 6) Batch-fetch EVK vault state (decimals, cash/borrows, supplyApy) from the subgraph.
   *
   * Notes:
   * - Node IDs are address-based (`eth:euler:<address>`) to avoid name collisions.
   * - Earn vault asset decimals are not available on EulerEarnVault in the subgraph; we derive
   *   decimals by matching the Earn underlying `asset` address to an EVK strategy vault's `asset`.
   */
  return {
    id: EULER_PROTOCOL,
    async fetchCatalog() {
      const [
        earnVaults,
        labelsByVault,
        pricesByAsset,
        openInterestByLiability,
      ] = await Promise.all([
        fetchEulerEarnVaults(),
        fetchEulerLabelsVaults(1),
        fetchEulerPrices(1),
        fetchEulerVaultOpenInterest(1),
      ]);

      // We derive EVK addresses from open-interest (Euler UI weight model) to define the EVK root
      // universe + collateral edges, and we also include Earn strategy EVKs so Earn -> EVK leaves
      // have metadata (name/apy/decimals) and we can compute a strategy-weighted Earn APY proxy.
      const evkVaultAddresses: Address[] = [];

      for (const [
        liabilityVault,
        collateralVaults,
      ] of openInterestByLiability) {
        evkVaultAddresses.push(liabilityVault);

        for (const collateralVault of collateralVaults.keys())
          evkVaultAddresses.push(collateralVault);
      }

      for (const earnVault of earnVaults) {
        for (const { strategy } of earnVault.strategies)
          evkVaultAddresses.push(strategy);
      }

      const evkVaults = await fetchEulerEvkVaults([
        ...new Set([...evkVaultAddresses]),
      ]);

      //mapping evk vault addr with evk vault info (e.g name, supplyApy)
      const evkVaultMap = new Map(
        evkVaults.map((evkVault) => [evkVault.id, evkVault] as const),
      );

      return {
        earnVaults,
        evkVaultMap,
        labelsByVault,
        pricesByAsset,
        openInterestByLiability,
      };
    },
    getAssetByAllocations(catalog) {
      const result: Record<Address, EulerAllocation[]> = {};

      //process allocations about earn vaults
      for (const earnVault of catalog.earnVaults) {
        if (earnVault.strategies.length === 0) continue;

        result[earnVault.id] = [
          {
            type: "earnVault" as const,
            earnVault,
            evkVaultMap: catalog.evkVaultMap,
            labelsByVault: catalog.labelsByVault,
            pricesByAsset: catalog.pricesByAsset,
          },
        ];
      }

      //process allocations about evk vaults
      for (const [
        liabilityAddr,
        collateralOpenInterestUsd,
      ] of catalog.openInterestByLiability) {
        const evkVault = catalog.evkVaultMap.get(liabilityAddr);

        if (!evkVault) continue;

        result[evkVault.id] = [
          {
            type: "evkVault" as const,
            evkVault,
            collateralOpenInterestUsd,
            evkVaultMap: catalog.evkVaultMap,
            labelsByVault: catalog.labelsByVault,
            pricesByAsset: catalog.pricesByAsset,
          },
        ];
      }

      return result;
    },
    buildRootNode(_asset, allocations) {
      const alloc = allocations[0];

      if (!alloc) return null;

      if (alloc.type === "earnVault") {
        const vault = alloc.earnVault;
        const earnVaultDecimals = getEarnAssetDecimals(
          vault,
          alloc.evkVaultMap,
        );

        const totalAssets = Number(
          formatUnits(BigInt(vault.totalAssets), earnVaultDecimals),
        );

        const price = alloc.pricesByAsset.get(vault.asset);
        const tvlUsd = roundToTwoDecimals(
          price == null ? 0 : totalAssets * price,
        );

        return {
          id: eulerNodeId(vault.id),
          chain: EULER_CHAIN,
          name: getVaultLabelName(alloc.labelsByVault, vault.id) ?? vault.name,
          protocol: EULER_PROTOCOL,
          details: {
            kind: "Yield",
            curator: vault.curator,
          },
          tvlUsd,
          apy: 0,
        } satisfies Node;
      }

      //evk vault branch
      const vault = alloc.evkVault;

      // underlying assets currently lent out (outstanding borrows, includes accrual as interest compounds)
      const totalBorrows = BigInt(vault.state?.totalBorrows ?? "0");

      //underlying assets currently held by the vault (idle/liquid, not borrowed)
      const cash = BigInt(vault.state?.cash ?? "0");

      const price = alloc.pricesByAsset.get(vault.asset);
      const total = Number(formatUnits(totalBorrows + cash, vault.decimals));
      const tvlUsd = roundToTwoDecimals(price == null ? total : total * price);

      return {
        id: eulerNodeId(vault.id),
        chain: EULER_CHAIN,
        name: getVaultLabelName(alloc.labelsByVault, vault.id) ?? vault.name,
        protocol: EULER_PROTOCOL,
        details: { kind: "Lending Market" },
        tvlUsd,
        apy: parseRayApy(vault.state?.supplyApy),
      } satisfies Node;
    },
    buildEdge(root, allocationNode, allocation) {
      void allocation;
      return {
        from: root.id,
        to: allocationNode.id,
        allocationUsd: 0,
      };
    },
    async normalizeLeaves(root, allocations) {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      const allocation = allocations[0];

      if (!allocation) return { nodes, edges };

      if (allocation.type === "earnVault") {
        const vault = allocation.earnVault;

        const underlyingDecimals = getEarnAssetDecimals(
          vault,
          allocation.evkVaultMap,
        );

        const underlyingPrice = allocation.pricesByAsset.get(vault.asset);

        for (const strategy of vault.strategies) {
          const evkVault = allocation.evkVaultMap.get(strategy.strategy);

          if (!evkVault) continue;

          const evkVaultDisplayName = getVaultLabelName(
            allocation.labelsByVault,
            evkVault.id ?? strategy.strategy,
          );

          const nodeId = eulerNodeId(evkVault?.id ?? strategy.strategy);
          const allocated = Number(
            formatUnits(BigInt(strategy.allocatedAssets), underlyingDecimals),
          );

          const allocationUsd = roundToTwoDecimals(
            underlyingPrice == null ? allocated : allocated * underlyingPrice,
          );

          nodes.push({
            id: nodeId,
            chain: EULER_CHAIN,
            name: evkVaultDisplayName ?? evkVault.name,
            protocol: EULER_PROTOCOL,
            details: { kind: "Lending Market" },
            apy: parseRayApy(evkVault.state?.supplyApy),
          });

          edges.push({
            from: root.id,
            to: nodeId,
            allocationUsd,
          });
        }

        return { nodes, edges };
      }

      //evk vaults allocation process

      for (const [
        collateralVault,
        openInterestUsd,
      ] of allocation.collateralOpenInterestUsd) {
        const evkVault = allocation.evkVaultMap.get(collateralVault);

        if (!evkVault) continue;

        const collateralDisplayName = getVaultLabelName(
          allocation.labelsByVault,
          collateralVault,
        );

        const nodeId = eulerNodeId(collateralVault);

        nodes.push({
          id: nodeId,
          chain: EULER_CHAIN,
          name: collateralDisplayName ?? evkVault.name,
          protocol: EULER_PROTOCOL,
          details: { kind: "Lending Market" },
          apy: parseRayApy(evkVault.state?.supplyApy),
        });

        edges.push({
          from: root.id,
          to: nodeId,
          allocationUsd: roundToTwoDecimals(openInterestUsd),
        });
      }

      return { nodes, edges };
    },
  };
};
