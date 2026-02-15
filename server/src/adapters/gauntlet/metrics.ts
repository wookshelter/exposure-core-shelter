// External API typing policy:
// - Defensive typing (many `?:` / `| null`) mirrors reality but spreads optional
//   handling throughout the codebase.
// - Positive typing keeps adapter logic concise and readable.
// We choose positive typing for the expected stable shape and localize robustness
// to the fetch/normalize boundary (runtime checks + normalization of used fields).

export interface GauntletMetrics {
  summary: {
    balance_usd: { value: number };
    share_price_apy_30d: { value: number };
  };
  groups: {
    group: string;
    groupDisplayName: string | null;
    protocol: string | null;
    summary: {
      balance_usd: { value: number };
    };
    assets: {
      asset: string;
      assetAddress: string;
      chainId: number;
      protocol: string | null;
      displayName: string | null;
      type: string | null;
      strategy_type: string | null;
      metrics: {
        balance_usd: { value?: number };
      };
    }[];
  }[];
}

const GAUNTLET_USD_ALPHA_METRICS_URL =
  "https://app.gauntlet.xyz/aera-api/latest_vault_asset_metrics?vault_address=0x000000000001CdB57E58Fa75Fe420a0f4D6640D5&chain_id=8453";

// NOTE:
// This endpoint can reflect multiple related Gauntlet vault products.
// In our graph pipeline, two of those vaults are already covered by the Morpho
// adapter, but "Gauntlet USD Alpha" (gtUSDa) is not registered/covered there.
//
// So this Gauntlet adapter intentionally focuses on fetching + normalizing the
// gtUSDa vault's metrics/allocations from this endpoint.
export const fetchGauntletMetrics = async (): Promise<GauntletMetrics> => {
  const response = await fetch(GAUNTLET_USD_ALPHA_METRICS_URL);

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Gauntlet API error: ${response.status} ${response.statusText}:${text}`,
    );
  }

  const json = (await response.json()) as unknown;

  if (!json || typeof json !== "object") {
    throw new Error("Gauntlet API returned invalid JSON");
  }

  const groups = (json as { groups?: unknown }).groups;

  if (!Array.isArray(groups)) {
    throw new Error("Gauntlet API returned invalid groups");
  }

  return json as GauntletMetrics;
};
