import { resolve } from "node:path";
import type { MockFetchHandler } from "../core/mock-fetch";
import { jsonResponse } from "../core/mock-fetch";
import { readJson } from "../core/io";

export const createInfinifiApiHandler = (): MockFetchHandler => {
  return async (url) => {
    if (!url.includes("eth-api.infinifi.xyz/api/protocol/data")) return null;

    const root = process.cwd();
    const dataPath = resolve(
      root,
      "fixtures",
      "providers",
      "infinifi",
      "protocol-data.json",
    );

    const data = await readJson(dataPath);
    return jsonResponse(data);
  };
};
