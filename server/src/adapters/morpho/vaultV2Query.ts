import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { parse } from "graphql";
import { gql, graphqlRequest } from "../../resolvers/graphql/graphqlRequest";
import { MORPHO_API_URL } from "./utils";

export type VaultV2Adapter =
  | {
      type: "MorphoMarketV1";
      assetsUsd: number | null;
      positions: {
        items: {
          state: { supplyAssetsUsd: number | null } | null;
          market: {
            uniqueKey: string;
            loanAsset: { symbol: string };
            collateralAsset: { symbol: string } | null;
            morphoBlue: { chain: { network: string } };
          };
        }[];
      };
    }
  | {
      type: "MetaMorpho";
      assetsUsd: number | null;
      metaMorpho: { address: string; name: string };
    };

export interface MorphoVaultV2 {
  address: string;
  name: string;
  whitelisted: boolean;
  chain: { network: string };
  totalAssetsUsd: number | null;
  netApy: number | null;
  curators: {
    items: { name: string; id: string }[];
  };
  adapters: {
    items: VaultV2Adapter[];
  };
}

const VAULT_V2S_QUERY: TypedDocumentNode<
  { vaultV2s?: { items?: MorphoVaultV2[] } },
  { first: number; skip: number; adaptersFirst: number; curatorsFirst: number }
> = parse(gql`
  query VaultV2s(
    $first: Int!
    $skip: Int!
    $adaptersFirst: Int = 20
    $curatorsFirst: Int = 1
  ) {
    vaultV2s(first: $first, skip: $skip, where: { whitelisted: true }) {
      items {
        address
        name
        whitelisted
        chain {
          network
        }
        totalAssetsUsd
        netApy
        curators(first: $curatorsFirst, skip: 0) {
          items {
            name
          }
        }
        adapters(first: $adaptersFirst, skip: 0) {
          items {
            assetsUsd
            type
            ... on MorphoMarketV1Adapter {
              positions(first: 10) {
                items {
                  state {
                    supplyAssetsUsd
                  }
                  market {
                    uniqueKey
                    loanAsset {
                      symbol
                    }
                    collateralAsset {
                      symbol
                    }
                    morphoBlue {
                      chain {
                        network
                      }
                    }
                  }
                }
              }
            }
            ... on MetaMorphoAdapter {
              metaMorpho {
                address
                name
              }
            }
          }
        }
      }
    }
  }
`);

export const fetchVaultV2s = async (): Promise<MorphoVaultV2[]> => {
  const vaultsV2: MorphoVaultV2[] = [];
  // Morpho's GraphQL endpoint enforces a max query complexity (1,000,000).
  // Complexity is based on the selected fields' cost + list fan-out (nested `first` multipliers).
  // If we don't cap fan-out, default limits can explode and quickly exceed the threshold.
  //
  // Fan-out caps chosen here:
  // - `vaultV2s(first: pageSize)` caps vaults per request.
  // - `adapters(first: adaptersFirst)` caps adapters per vault.
  // - `curators(first: curatorsFirst)` caps curator list per vault.
  // - `positions(first: 10)` caps market positions per MorphoMarketV1 adapter.
  //
  // With these caps, the query measures ~25,840 complexity for `vaultV2s(first: 1)`.
  // Roughly scaling with `pageSize`, that implies ~516,800 complexity per request at `pageSize = 20`.
  // Actual complexity varies by vault content, but this keeps us comfortably under 1,000,000 and avoids
  // `Query is too complex` errors (see GraphQL response `extensions.complexity`).
  const pageSize = 20;
  const adaptersFirst = 20;
  const curatorsFirst = 1;

  // GraphQL pagination: `skip` is an offset (number of items to omit from the start).
  // We increase it by `pageSize` to fetch pages: 0..19, 20..39, 40..59, etc.
  let skip = 0;

  while (true) {
    const payload = await graphqlRequest({
      url: MORPHO_API_URL,
      document: VAULT_V2S_QUERY,
      variables: { first: pageSize, skip, adaptersFirst, curatorsFirst },
    });

    const items = payload.vaultV2s?.items;

    if (!items || items.length === 0) break;

    vaultsV2.push(...items);

    if (items.length < pageSize) break;

    skip += pageSize;
  }

  return vaultsV2;
};
