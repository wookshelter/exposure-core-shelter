import { roundToTwoDecimals, scaleByDecimals } from "../../utils";
import {
  pickNumber,
  pickPercentRatio,
  runDuneQueryRow,
} from "../../resolvers/dune/duneClient";

const QUERY_IDS = {
  TVL: 4360119,
  STUSR_APR: 4399489,
  RLP_APR: 4300955,
  STUSR_SHARE: 4364326,
} as const;

const aprToApy = (aprRatio: number | null): number | null => {
  if (aprRatio === null) return null;

  return (1 + aprRatio / 365) ** 365 - 1;
};

export interface ResolvMetrics {
  tvl: {
    usr: number | null;
    wstusr: number | null;
    rlp: number | null;
  };
  apy: {
    usr: number | null;
    rlp: number | null;
  };
  asOf: string;
}

export const fetchResolvMetrics = async (): Promise<ResolvMetrics> => {
  const [tvl, stusrApr, rlpApr, stusrShare] = await Promise.all([
    runDuneQueryRow(QUERY_IDS.TVL),
    runDuneQueryRow(QUERY_IDS.STUSR_APR),
    runDuneQueryRow(QUERY_IDS.RLP_APR),
    runDuneQueryRow(QUERY_IDS.STUSR_SHARE),
  ]);

  const usrTVL = pickNumber(tvl, { columns: ["total_usr_tvl"] });
  const rlpTVL = pickNumber(tvl, { columns: ["usd_rlp_tvl"] });

  const stusrPercentage = pickPercentRatio(stusrShare, {
    columns: ["stusr_percentage"],
  });

  const wstusrTVL =
    usrTVL !== null && stusrPercentage !== null
      ? roundToTwoDecimals(usrTVL * stusrPercentage)
      : null;

  const usrAprRatio = pickPercentRatio(stusrApr, {
    columns: ["7-Day Avg APR (%)", "Daily APR (%)"],
    patterns: [/7.*apr/i, /daily.*apr/i, /avg.*apr/i],
  });

  const rlpApyPercent = pickNumber(rlpApr, { columns: ["rebase_7_apy"] });
  const rlpApy =
    rlpApyPercent === null ? null : scaleByDecimals(rlpApyPercent, 2);

  return {
    asOf: new Date().toISOString(),
    tvl: {
      usr: usrTVL,
      wstusr: wstusrTVL,
      rlp: rlpTVL,
    },
    apy: {
      usr: aprToApy(usrAprRatio),
      rlp: rlpApy,
    },
  };
};
