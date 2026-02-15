// NOTE: Using https://info.sky.money/collateral UI backend API (info-sky.blockanalitica.com).
// These endpoints may change as Sky updates their infrastructure.
const SKY_STUSDS_URL = "https://info-sky.blockanalitica.com/stusds/?days_ago=1";
const SKY_SUSDS_URL = "https://info-sky.blockanalitica.com/save/?days_ago=1";
const SKY_USDS_URL =
  "https://info-sky.blockanalitica.com/tokens/0xdc035d45d973e3ec169d2276ddab16f1e407384f/?days_ago=1";

const SKY_ILK_GROUP_URLS = [
  "https://info-sky.blockanalitica.com/groups/stablecoins/ilks/?days_ago=1&order=-debt",
  "https://info-sky.blockanalitica.com/groups/spark/ilks/?days_ago=1&order=-debt",
  "https://info-sky.blockanalitica.com/groups/obex/ilks/?days_ago=1&order=-debt",
  "https://info-sky.blockanalitica.com/groups/grove/ilks/?days_ago=1&order=-debt",
  "https://info-sky.blockanalitica.com/groups/core/ilks/?days_ago=1&order=-debt&p=1&p_size=10",
  "https://info-sky.blockanalitica.com/groups/legacy-rwa/ilks/?days_ago=1&order=-debt&p=1&p_size=10",
];

export interface SkyIlk {
  ilk: string;
  name: string;
  collateral: string;
  collateral_symbol: string;
  collateral_name: string;
}

export interface SkyMetrics {
  tvlUsd: {
    stusds: number;
    susds: number;
    usds: number;
  };
  apy: {
    stusds: number;
    susds: number;
    usds: null;
  };
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Sky API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

export const fetchSkyAllocations = async (): Promise<SkyIlk[]> => {
  const ilkResponses = await Promise.all(
    SKY_ILK_GROUP_URLS.map((url) => fetchJson<{ results: SkyIlk[] }>(url)),
  );

  return ilkResponses.flatMap((r) => r.results);
};

export const fetchSkyMetrics = async (): Promise<SkyMetrics> => {
  const [stusds, susds, usds] = await Promise.all([
    fetchJson<{ rate: string | number; total_assets: string | number }>(
      SKY_STUSDS_URL,
    ),
    fetchJson<{ rate: string | number; total: string | number }>(SKY_SUSDS_URL),
    fetchJson<{ total_corrected: string | number }>(SKY_USDS_URL),
  ]);

  return {
    tvlUsd: {
      stusds: Number(stusds.total_assets),
      susds: Number(susds.total),
      usds: Number(usds.total_corrected),
    },
    apy: {
      stusds: Number(stusds.rate),
      susds: Number(susds.rate),
      usds: null,
    },
  };
};
