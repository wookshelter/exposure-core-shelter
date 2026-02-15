export interface MorphoMarket {
  uniqueKey: string;
  loanAsset: {
    symbol: string;
    decimals: number;
    priceUsd: number | null;
  };
  collateralAsset: {
    symbol: string;
  } | null;
  morphoBlue: {
    chain: {
      id: number;
      network: string;
    };
  };
}

export interface MorphoAllocation {
  supplyAssetsUsd: number | null;
  supplyAssets: string;
  market: MorphoMarket;
}
