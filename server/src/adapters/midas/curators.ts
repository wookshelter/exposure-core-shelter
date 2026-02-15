const CURATOR_BY_ASSET: Record<string, string> = {
  mEDGE: "EdgeCapital",
  mMEV: "MEVcapital",
  mRe7Yield: "Re7Capital",
  mRE7Yield: "Re7Capital",
  mRe7YIELD: "Re7Capital",
  mTBILL: "Superstate",
  mBASIS: "EdgeCapital",
  mRE7SOL: "Re7Capital",
  mRe7SOL: "Re7Capital",
  "mF-ONE": "FasanaraCapital",
  mHYPER: "Hyperithm",
  mAPOLLO: "ApolloCrypto",
  mFARM: "FarmCapital",
  mevBTC: "MEVcapital",
  mBTC: "LeadingPrimeBrokers",
  msyrupUSDp: "EdgeCapital",
  msyrupUSD: "M1Capital",
  mXRP: "Hyperithm",
  mRe7BTC: "Re7Capital",
  mHyperETH: "Hyperithm",
  mHyperBTC: "Hyperithm",
};

export const getCuratorForAsset = (asset: string): string | null => {
  return CURATOR_BY_ASSET[asset] ?? null;
};
