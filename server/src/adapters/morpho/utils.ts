import { normalizeChain, roundToTwoDecimals, toSlug } from "../../utils";
import type { MorphoAllocation } from "./types";

export const MORPHO_API_URL = "https://api.morpho.org/graphql";

export const buildMorphoVaultId = (
  chain: string,
  version: "v1" | "v2",
  address: string,
): string => `${normalizeChain(chain)}:morpho-${version}:${toSlug(address)}`;

export const buildMorphoMarketId = (
  chain: string,
  version: "v1" | "v2",
  uniqueKey: string,
): string => {
  return `${normalizeChain(chain)}:morpho-${version}:${toSlug(uniqueKey)}`;
};

export const resolveAllocationUsd = (allocation: MorphoAllocation): number => {
  if (allocation.supplyAssetsUsd != null) return allocation.supplyAssetsUsd;

  const loanAsset = allocation.market.loanAsset;

  if (!loanAsset) return 0;

  const assets = Number(allocation.supplyAssets ?? 0);
  const decimals = loanAsset.decimals ?? 0;
  const price = loanAsset.priceUsd ?? 0;
  const normalized = assets / Math.pow(10, decimals);
  const value = normalized * price;

  return roundToTwoDecimals(value);
};
