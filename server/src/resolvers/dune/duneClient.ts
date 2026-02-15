export type DuneRow = Record<string, unknown>;

const API_BASE = "https://api.dune.com/api/v1";

interface DuneQueryResultsResponse {
  state: string;
  result?: {
    rows?: DuneRow[];
  };
  error?: unknown;
}

export const runDuneQuery = async (
  queryId: number,
  opts?: { limit?: number; offset?: number },
): Promise<DuneRow[]> => {
  const apiKey = process.env.DUNE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing DUNE_API_KEY environment variable. Required for Dune Analytics.",
    );
  }

  const limit = opts?.limit ?? 1000;
  const offset = opts?.offset ?? 0;

  const res = await fetch(
    `${API_BASE}/query/${queryId}/results?limit=${limit}&offset=${offset}`,
    {
      headers: {
        "X-Dune-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    const text = await res.text();

    throw new Error(
      `Dune API ${res.status} ${res.statusText}: ${text || "(no body)"}`,
    );
  }

  const response = (await res.json()) as DuneQueryResultsResponse;

  if (response.state === "QUERY_STATE_FAILED") {
    throw new Error(
      `Dune results state=FAILED: ${JSON.stringify(response.error ?? {}, null, 2)}`,
    );
  }

  return (response.result?.rows ?? []) as DuneRow[];
};

export const runDuneQueryRow = async (
  queryId: number,
  opts?: { offset?: number },
): Promise<DuneRow | null> => {
  const params: { limit: number; offset?: number } = { limit: 1 };

  if (opts?.offset != null) params.offset = opts.offset;

  const rows = await runDuneQuery(queryId, params);

  return rows[0] ?? null;
};

export const pickNumber = (
  row: DuneRow | null,
  opts: { columns?: string[]; patterns?: RegExp[] },
): number | null => {
  if (!row) return null;

  let value: unknown = null;

  if (opts.columns) {
    for (const col of opts.columns) {
      if (Object.prototype.hasOwnProperty.call(row, col)) {
        value = row[col];
        break;
      }
    }
  }

  if (value == null && opts.patterns) {
    const keys = Object.keys(row);
    for (const pattern of opts.patterns) {
      const key = keys.find((k) => pattern.test(k));
      if (key) {
        value = row[key];
        break;
      }
    }
  }

  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

export const pickPercentRatio = (
  row: DuneRow | null,
  opts: { columns?: string[]; patterns?: RegExp[] },
): number | null => {
  const num = pickNumber(row, opts);
  return num === null ? null : num / 100;
};
