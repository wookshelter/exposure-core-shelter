import {
  normalizeChain,
  normalizeProtocol,
  roundToTwoDecimals,
  toSlug,
} from "../../utils";
import type { TokenObject } from "./fetcher";

export const buildProtocolListItemId = (
  chain: string,
  protocol: string,
  resourceId: string,
  positionIndex?: string,
): string => {
  const chainSlug = normalizeChain(chain);
  const protocolSlug = normalizeProtocol(protocol);
  const resourceSlug = toSlug(resourceId);
  const base = `${chainSlug}:${protocolSlug}:${resourceSlug}`;

  const indexSlug = positionIndex ? toSlug(positionIndex) : "";

  return indexSlug ? `${base}:${indexSlug}` : base;
};

export const buildAppListItemId = (
  protocol: string,
  description: string,
  resourceId1: string,
  resourceId2?: string,
): string => {
  const protocolSlug = normalizeProtocol(protocol);
  const descriptionSlug = toSlug(description);
  const resourceSlug1 = toSlug(resourceId1);
  const resourceSlug2 = resourceId2 ? toSlug(resourceId2) : "";

  return resourceSlug2
    ? `${protocolSlug}:${descriptionSlug}:${resourceSlug1}:${resourceSlug2}`
    : `${protocolSlug}:${descriptionSlug}:${resourceSlug1}`;
};

export const tokenToUsdValue = (token: TokenObject): number => {
  const amount = token.amount ?? 0;
  const price = token.price ?? 0;
  const value = amount * price;

  return roundToTwoDecimals(value);
};

const MIN_ALLOCATION_USD = 100;

export const isAllocationUsdEligible = (allocUsd: number): boolean => {
  if (allocUsd < MIN_ALLOCATION_USD) return false;

  return true;
};
