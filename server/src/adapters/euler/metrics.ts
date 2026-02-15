import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { parse } from "graphql";
import { gql, graphqlRequest } from "../../resolvers/graphql/graphqlRequest";
import type { Address } from "viem";

/**
 * Why these fetchers exist (graph model):
 * - Earn vaults (Euler Earn) are root nodes of kind "Yield".
 *   Their `strategies[].strategy` are EVK vault addresses which become allocation leaves.
 * - EVK vaults are root nodes of kind "Lending Market".
 *   Their collateral leaves + USD weights are defined by Euler's pre-aggregated open-interest mapping.
 *
 * Data sources:
 * - Subgraph (Goldsky): Earn + EVK vault state (balances, APY, strategy allocations).
 * - Indexer open-interest: EVK liability -> collateral relationships and USD weights (matches Euler UI)
 *   and avoids reconstructing the same metric from subgraph primitives.
 * - Labels (euler-xyz/euler-labels): human-readable vault names (Euler UI naming).
 * - Prices (Euler UI API): asset prices for USD-normalizing token-denominated balances because the
 *   subgraph does not expose USD fields.
 */

/**
 * Mainnet Euler V2 subgraph endpoint.
 * Note: the subgraph does not expose ERC-20 token metadata (eg decimals) for EulerEarnVault.asset.
 * We treat addresses as `Bytes` here and normalize them to lowercase `0x...` strings.
 */
const EULER_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn";

export interface EulerEarnVault {
  id: Address;
  name: string;
  symbol: string;
  asset: Address;
  curator: Address | null;
  totalAssets: string;
  strategies: {
    strategy: Address;
    allocatedAssets: string;
  }[];
}

/**
 * Earn vaults define the "Yield" root universe.
 * Each Earn vault has a list of EVK strategy vault addresses that we turn into allocation leaves.
 *
 * Note: we intentionally filter to the same governed perspective Euler UI uses.
 */
export const fetchEulerEarnVaults = async (): Promise<EulerEarnVault[]> => {
  const EULER_EARN_VAULTS_QUERY: TypedDocumentNode<{
    eulerEarnVaults: EulerEarnVault[];
  }> = parse(gql`
    {
      eulerEarnVaults(
        first: 100
        orderBy: totalAssets
        orderDirection: desc
        where: { perspectives_contains: ["eulerEarnGovernedPerspective"] }
      ) {
        id
        name
        symbol
        asset
        curator
        totalAssets
        strategies {
          strategy
          allocatedAssets
        }
      }
    }
  `);

  const { eulerEarnVaults } = await graphqlRequest({
    url: EULER_SUBGRAPH_URL,
    document: EULER_EARN_VAULTS_QUERY,
    variables: {},
  });

  return eulerEarnVaults;
};

export interface EulerEvkVault {
  id: Address;
  name: string;
  symbol: string;
  asset: Address;
  decimals: number;
  state: {
    totalBorrows: string;
    cash: string;
    supplyApy: string;
  } | null;
}

/**
 * EVK vault state (decimals + cash/borrows + supply APY).
 * We only fetch the subset of EVK vaults we actually need (from Earn strategies and/or open-interest).
 */
export const fetchEulerEvkVaults = async (
  addresses: Address[],
): Promise<EulerEvkVault[]> => {
  if (addresses.length === 0) return [];

  const ids = addresses.map((a) => a.toLowerCase());
  const pageSize = 1000;
  const result: EulerEvkVault[] = [];

  const EULER_VAULTS_BY_IDS_QUERY: TypedDocumentNode<
    { eulerVaults: EulerEvkVault[] },
    { ids: string[] }
  > = parse(gql`
    query ($ids: [Bytes!]!) {
      eulerVaults(where: { id_in: $ids }, first: 1000) {
        id
        name
        symbol
        asset
        decimals
        state {
          totalBorrows
          cash
          supplyApy
        }
      }
    }
  `);

  for (let i = 0; i < ids.length; i += pageSize) {
    const chunk = ids.slice(i, i + pageSize);
    const { eulerVaults } = await graphqlRequest({
      url: EULER_SUBGRAPH_URL,
      document: EULER_VAULTS_BY_IDS_QUERY,
      variables: { ids: chunk },
    });

    result.push(...eulerVaults);
  }

  return result;
};

export interface EulerLabelsVault {
  name: string;
  description?: string;
  entity?: string | string[];
}

export interface EulerPriceRecord {
  price: number | string;
  timestamp?: number;
  source?: string;
  address?: string;
  symbol?: string;
}

/**
 * Vault labels (Euler-maintained registry) to make node names human readable.
 * Subgraph `name`/`symbol` are onchain metadata and frequently differ from what Euler UI shows.
 */
export const fetchEulerLabelsVaults = async (
  chainId: number,
): Promise<Map<string, EulerLabelsVault>> => {
  const url = `https://raw.githubusercontent.com/euler-xyz/euler-labels/master/${chainId}/vaults.json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Euler labels error: ${response.status} ${response.statusText}`,
    );
  }

  const json: Record<string, EulerLabelsVault> = await response.json();
  const map = new Map<string, EulerLabelsVault>();

  for (const [address, record] of Object.entries(json)) {
    map.set(address.toLowerCase(), record);
  }

  return map;
};

/**
 * EVK collateral open-interest mapping (Euler UI weight model).
 *
 * Why we use this endpoint:
 * - It defines which EVK vaults matter for the Lending Market graph (liability roots) and which
 *   collateral vaults they connect to (collateral leaves).
 * - It provides USD weights directly, which matches Euler UI and avoids expensive processing of the
 *   raw subgraph response.
 * - Because it gives us the EVK universe + edges up front, we don't need to fetch *every* EVK vault,
 *   only the ones referenced by Earn strategies and/or this mapping.
 *
 * Shape:
 * - outer key: liabilityVault (root EVK vault)
 * - inner key: collateralVault (leaf EVK vault)
 * - inner value: openInterestUsd (USD notional)
 */

type EulerOpenInterestResponse = Record<string, Record<string, number>>;

export const fetchEulerVaultOpenInterest = async (
  chainId: number,
): Promise<Map<Address, Map<Address, number>>> => {
  const url = `https://indexer-main.euler.finance/v1/vault/open-interest?chainId=${chainId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Euler open-interest error: ${response.status} ${response.statusText}`,
    );
  }

  const json: EulerOpenInterestResponse = await response.json();

  // Convert object-of-objects into nested Maps to simplify lookups and iteration in the adapter.
  // Addresses are normalized to lowercase so our keys are consistent across sources.
  const liabilityVaultsMap = new Map<Address, Map<Address, number>>();

  for (const [liabilityVault, collateralVaults] of Object.entries(json)) {
    // `liabilityVault` is the EVK root (borrowed/owed market).
    const collateralVaultMap = new Map<Address, number>();

    for (const [collateralVault, openInterestUsd] of Object.entries(
      collateralVaults,
    )) {
      // `collateralVault` is the EVK leaf (collateral market).
      collateralVaultMap.set(
        collateralVault.toLowerCase() as Address,
        openInterestUsd,
      );
    }

    liabilityVaultsMap.set(
      liabilityVault.toLowerCase() as Address,
      collateralVaultMap,
    );
  }

  return liabilityVaultsMap;
};

/**
 * Euler UI price registry (assetAddress -> USD price).
 * Used to turn token-denominated balances (from subgraph) into USD values.
 * We rely on this because the subgraph does not expose `*Usd` fields.
 */
export const fetchEulerPrices = async (
  chainId: number,
): Promise<Map<Address, number>> => {
  const url = `https://app.euler.finance/api/v1/price?chainId=${chainId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Euler price error: ${response.status} ${response.statusText}`,
    );
  }

  const json: Record<string, EulerPriceRecord> = await response.json();
  const prices = new Map<Address, number>();

  for (const [key, record] of Object.entries(json)) {
    const price = Number(record?.price);

    prices.set(key.toLowerCase() as Address, price);
  }

  return prices;
};
