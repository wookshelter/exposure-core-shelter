import type { Edge, Node } from "../../types";
import {
  processComplexAppItem,
  processComplexProtocolItem,
} from "../../resolvers/debank/debankResolver";
import { toSlug } from "../../utils";
import { getCuratorForAsset } from "./curators";
import type { Adapter } from "../types";

export interface MidasAllocation {
  createdAt: string;
  updatedAt: string;
  id: number;
  product: string;
  firstLevelAllocation: string;
  secondLevelAllocation: string | null;
  thirdLevelAllocation: string | null;
  amount: string;
  linkTitle: string | null;
  link: string | null;
  asOfDate: string | null;
}

const MIDAS_API_URL = "https://api-prod.midas.app/api/midas-assets/allocations";

export const createMidasAdapter = (): Adapter<
  MidasAllocation[],
  MidasAllocation
> => {
  return {
    id: "midas",
    async fetchCatalog() {
      const response = await fetch(MIDAS_API_URL);

      if (!response.ok) {
        throw new Error(
          `Midas API error: ${response.status} ${response.statusText}`,
        );
      }

      const data: MidasAllocation[] = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Midas API returned non-array payload");
      }

      return data;
    },
    buildRootNode(asset, allocations) {
      const tvlUsd = allocations.reduce(
        (sum, allocation) => sum + Number(allocation.amount) * 1000,
        0,
      );

      const node: Node = {
        id: `global:midas:${toSlug(asset)}`,
        chain: "global",
        name: asset,
        protocol: "midas",
        details: {
          kind: "Yield",
          curator: getCuratorForAsset(asset),
        },
        apy: null,
        tvlUsd,
      };

      return node;
    },
    getAssetByAllocations(catalog) {
      const assetByAllocations: Record<string, MidasAllocation[]> = {};

      for (const allocation of catalog) {
        const product = allocation.product;
        if (!assetByAllocations[product]) {
          assetByAllocations[product] = [allocation];
        } else {
          assetByAllocations[product].push(allocation);
        }
      }

      return assetByAllocations;
    },
    buildEdge(root, allocationNode, allocation) {
      const edge = {
        from: root.id,
        to: allocationNode.id,
        allocationUsd: Number(allocation.amount) * 1000,
      };

      return edge;
    },
    async normalizeLeaves(root, allocations) {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      for (const allocation of allocations) {
        // allocs to perp dex or cex. this is terminal node
        if (allocation.firstLevelAllocation === "Exchanges") {
          const allocationNode: Node = {
            id: allocation.secondLevelAllocation ?? "",
            name: allocation.secondLevelAllocation ?? "",
            details: { kind: "Investment" },
          };

          nodes.push(allocationNode);

          edges.push(this.buildEdge(root, allocationNode, allocation));
          // asset curators have allocated amount.
        } else if (allocation.firstLevelAllocation === "Offchain Collateral") {
          const allocationNode: Node = {
            id: allocation.secondLevelAllocation ?? "",
            name: allocation.secondLevelAllocation ?? "",
            details: { kind: "Investment" },
          };

          nodes.push(allocationNode);

          edges.push(this.buildEdge(root, allocationNode, allocation));
          // most case. debank or chainscan link info
        } else if (
          allocation.link &&
          (allocation.linkTitle === "Debank" ||
            allocation.link.startsWith("https://debank.com/profile"))
        ) {
          const url = new URL(allocation.link);
          const segments = url.pathname.split("/");
          const walletAddress = segments[segments.length - 1];

          if (!walletAddress) continue;

          const results = await Promise.all([
            processComplexProtocolItem(walletAddress, root.id),
            processComplexAppItem(walletAddress, root.id),
          ]);

          for (const result of results) {
            nodes.push(...result.nodes);
            edges.push(...result.edges);
          }
        } else {
          continue;
        }
      }

      return { nodes, edges };
    },
  };
};
