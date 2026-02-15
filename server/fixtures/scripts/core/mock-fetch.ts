export type MockFetchHandler = (url: string) => Promise<Response | null>;

export const jsonResponse = (
  data: unknown,
  options?: { status?: number; headers?: Record<string, string> },
): Response =>
  new Response(JSON.stringify(data), {
    status: options?.status ?? 200,
    headers: { "content-type": "application/json", ...options?.headers },
  });

export const createMockFetch = (config: {
  handlers: MockFetchHandler[];
  enabledProviders: string[];
  allowRealFetch?: boolean;
}): typeof fetch => {
  const { handlers, enabledProviders, allowRealFetch = false } = config;
  const realFetch = globalThis.fetch;

  return async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    for (const handler of handlers) {
      const response = await handler(url);
      if (response) return response;
    }

    if (allowRealFetch) {
      return realFetch(input, init);
    }

    throw new Error(
      `No fixture for URL: ${url}\nEnabled providers: ${enabledProviders.join(", ") || "(none)"}`,
    );
  };
};

export const withMockFetch = async <T>(
  fetchImpl: typeof fetch,
  fn: () => Promise<T>,
): Promise<T> => {
  const realFetch = globalThis.fetch;

  globalThis.fetch = fetchImpl;

  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
};
