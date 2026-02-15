import { scaleByDecimals } from "../../utils";

const YUZU_DASHBOARD_URL = "https://yuzu-accountable.yuzu.money/dashboard";

// NOTE:
// The Yuzu dashboard payload contains a large historical array at
// `data.reserves.timeline` (many points). We intentionally do NOT model it here
// because it makes the response type huge and doesn't help for our use case.
//
// For "latest" values, the API already provides summary fields:
// - APY: `data.apy.{syzusd_apy,yzpp_apy}`
// - TVL: `data.reserves.total_supply.{yzusd,yzpp}` and `data.syzusd.syzusd_staked`
interface YuzuDashboardResponse {
  res?: "ok" | string;
  data?: {
    ts?: number | string;
    reserves?: {
      total_supply?: {
        yzusd?: number | string;
        yzpp?: number | string;
      };
    };
    syzusd?: {
      syzusd_staked?: number | string;
    };
    apy?: {
      syzusd_apy?: number | string;
      yzpp_apy?: number | string;
    };
  };
}

export interface YuzuMetrics {
  tvl: {
    yzusd: number;
    syzusd: number;
    yzpp: number;
  };
  apy: {
    syzusd: number;
    yzpp: number;
  };
  asOf: string;
}

export const fetchYuzuMetrics = async (): Promise<YuzuMetrics> => {
  const res = await fetch(YUZU_DASHBOARD_URL, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();

    throw new Error(
      `Yuzu dashboard error: ${res.status} ${res.statusText}:${text}`,
    );
  }

  const json: YuzuDashboardResponse = await res.json();

  if (json.res !== "ok") {
    throw new Error(`Yuzu dashboard returned res=${String(json.res)}`);
  }

  const asOfTs = Number(json?.data?.ts) || Date.now();

  const yzusdTvl = Number(json?.data?.reserves?.total_supply?.yzusd) || 0;
  const syzusdTvl = Number(json?.data?.syzusd?.syzusd_staked) || 0;
  const yzppTvl = Number(json?.data?.reserves?.total_supply?.yzpp) || 0;

  const syzusdApyPercent = Number(json?.data?.apy?.syzusd_apy) || 0;
  const yzppApyPercent = Number(json?.data?.apy?.yzpp_apy) || 0;

  return {
    asOf: new Date(asOfTs).toISOString(),
    tvl: {
      yzusd: yzusdTvl,
      syzusd: syzusdTvl,
      yzpp: yzppTvl,
    },
    apy: {
      syzusd: scaleByDecimals(syzusdApyPercent, 2),
      yzpp: scaleByDecimals(yzppApyPercent, 2),
    },
  };
};
