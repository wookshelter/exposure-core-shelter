export const toSlug = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

export const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

export const scaleByDecimals = (value: number, decimals: number): number => {
  return value / 10 ** decimals;
};

// Canonicalize chain identifiers so node IDs stay stable across data sources.
// Example: "ethereum", "mainnet", "eth" -> "eth".
export const normalizeChain = (value: string): string => {
  const slug = toSlug(value);

  switch (slug) {
    case "ethereum":
    case "ethereum-mainnet":
    case "mainnet":
    case "homestead":
    case "eth":
      return "eth";
    case "arbitrum":
    case "arbitrum-one":
    case "arb":
      return "arb";
    case "optimism":
    case "op":
      return "op";
    case "polygon":
    case "matic":
      return "polygon";
    case "base":
      return "base";
    case "hyperliquid":
      return "hyperliquid";
    case "hyper":
      return "hyper";
    case "unichain":
    case "uni":
      return "uni";
    case "katana":
      return "katana";
    case "monad":
      return "monad";
    case "plume":
      return "plume";
    case "plasma":
      return "plasma";
    case "stable":
      return "stable";
    case "lighter":
      return "lighter";
    case "global":
      return "global";
    default:
      return slug;
  }
};

// Canonicalize protocol identifiers so the same on-chain object (address) merges
// across adapters/resolvers (e.g. Debank "morphoblue" -> "morpho").
export const normalizeProtocol = (value: string): string => {
  const original = toSlug(value);

  // Debank often prefixes protocols with the chain (e.g. "hyper_pendle2").
  const parts = original.split("-");
  const firstPart = parts[0] ?? "";
  const knownChains = new Set([
    "eth",
    "arb",
    "op",
    "polygon",
    "base",
    "hyper",
    "hyperliquid",
    "uni",
    "katana",
    "monad",
    "plume",
    "plasma",
    "stable",
    "lighter",
    "global",
  ]);
  const withoutChainPrefix =
    parts.length > 1
      ? (() => {
          if (!firstPart) return original;

          const maybeChain = normalizeChain(firstPart);

          // If the first segment is a chain, strip it to get the canonical protocol.
          // Example: "plasma_maple" -> "maple", "arb_euler2" -> "euler2".
          if (!knownChains.has(maybeChain)) return original;

          const rest = parts.slice(1).join("-");

          return rest.length > 0 ? rest : original;
        })()
      : original;

  switch (withoutChainPrefix) {
    case "pendle2":
    case "pendle-v2":
    case "pendlev2":
      return "pendlev2";
    case "euler2":
    case "euler-v2":
    case "eulerv2":
      return "euler";
    case "aave3":
    case "aave-v3":
    case "aavev3":
      return "aavev3";
    case "morpho":
      return "morpho-v1";
    case "morphoblue":
    case "morpho-blue":
    case "morpho-blue-vault":
      return "morpho-v2";
    case "morpho-v1":
    case "morpho-v2":
      return withoutChainPrefix;
    default:
      return withoutChainPrefix;
  }
};
