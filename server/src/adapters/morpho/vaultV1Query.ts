import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { parse } from "graphql";
import { gql, graphqlRequest } from "../../resolvers/graphql/graphqlRequest";
import type { MorphoAllocation } from "./types";
import { MORPHO_API_URL } from "./utils";

interface MorphoVaultState {
  totalAssetsUsd: number;
  netApy: number;
  curators: {
    name: string;
  }[];
  allocation: MorphoAllocation[];
}

export interface MorphoVaultV1 {
  id: string;
  address: string;
  symbol: string;
  name: string;
  whitelisted: boolean;
  chain: {
    id: number;
    network: string;
  };
  state: MorphoVaultState | null;
}

interface MorphoVaultsV1Response {
  vaults?: {
    items?: MorphoVaultV1[];
  };
}

const VAULTS_QUERY: TypedDocumentNode<
  MorphoVaultsV1Response,
  { first: number; skip: number }
> = parse(gql`
  query Vaults($first: Int!, $skip: Int!) {
    vaults(first: $first, skip: $skip, where: { whitelisted: true }) {
      items {
        __typename
        id
        address
        symbol
        name
        whitelisted
        chain {
          id
          network
        }
        state {
          totalAssetsUsd
          netApy
          curators {
            name
          }
          allocation {
            supplyAssetsUsd
            supplyAssets
            market {
              uniqueKey
              loanAsset {
                symbol
                decimals
                priceUsd
              }
              collateralAsset {
                symbol
              }
              morphoBlue {
                chain {
                  id
                  network
                }
              }
            }
          }
        }
      }
    }
  }
`);

export const fetchVaultV1s = async (): Promise<MorphoVaultV1[]> => {
  const pageSize = 1000;
  // GraphQL pagination: `skip` is an offset (number of items to omit from the start).
  // We increase it by `pageSize` to fetch pages: 0..999, 1000..1999, 2000..2999, etc.
  let skip = 0;

  const vaultsV1: MorphoVaultV1[] = [];

  while (true) {
    const payload: MorphoVaultsV1Response = await graphqlRequest({
      url: MORPHO_API_URL,
      document: VAULTS_QUERY,
      variables: { first: pageSize, skip },
    });

    const items = payload.vaults?.items ?? [];

    if (items.length === 0) break;

    vaultsV1.push(...items);

    if (items.length < pageSize) break;

    skip += pageSize;
  }

  return vaultsV1;
};
