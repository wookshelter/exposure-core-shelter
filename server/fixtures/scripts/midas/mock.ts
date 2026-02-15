import type { MockFetchHandler } from "../core/mock-fetch";
import { jsonResponse } from "../core/mock-fetch";

export interface MidasAllocationFixture {
  product?: string;
}

export const createMidasAllocationsHandler = (config: {
  allocations: MidasAllocationFixture[];
}): MockFetchHandler => {
  const { allocations } = config;

  return async (url) => {
    if (!url.includes("midas-assets/allocations")) return null;

    return jsonResponse(allocations);
  };
};
