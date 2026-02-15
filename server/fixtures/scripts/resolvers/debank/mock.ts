import { resolve, isAbsolute } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { jsonResponse, type MockFetchHandler } from "../../core/mock-fetch";

const tryReadJson = async (path: string): Promise<unknown | null> => {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const resolveWalletFixture = (
  root: string,
  walletsDir: string,
  protocol: string,
  asset: string | null,
  walletAddress: string,
  fileName: string,
): string => {
  const resolvedWalletsDir = walletsDir
    .replace("{protocol}", protocol)
    .replace("{asset}", asset ?? "");

  if (isAbsolute(resolvedWalletsDir)) {
    return resolve(resolvedWalletsDir, walletAddress, fileName);
  }

  return resolve(root, "fixtures", resolvedWalletsDir, walletAddress, fileName);
};

export const createDebankHandler = (config: {
  root: string;
  protocol: string;
  asset?: string;
  walletsDir?: string;
}): MockFetchHandler => {
  const { root, protocol } = config;
  const asset = config.asset ?? null;
  const walletsDir =
    config.walletsDir ??
    (asset
      ? "providers/debank/wallets/{protocol}/{asset}"
      : "providers/debank/wallets/{protocol}");

  return async (url) => {
    if (url.includes("/user/complex_protocol_list")) {
      const walletAddress = new URL(url).searchParams.get("id")?.toLowerCase();
      if (!walletAddress) return jsonResponse([]);

      const payload = await tryReadJson(
        resolveWalletFixture(
          root,
          walletsDir,
          protocol,
          asset,
          walletAddress,
          "complex-protocol-list.json",
        ),
      );

      if (!payload) return jsonResponse([]);
      if (!Array.isArray(payload)) {
        throw new Error("complex protocol list fixture must be an array");
      }

      return jsonResponse(payload);
    }

    if (url.includes("/user/complex_app_list")) {
      const walletAddress = new URL(url).searchParams.get("id")?.toLowerCase();
      if (!walletAddress) return jsonResponse([]);

      const payload = await tryReadJson(
        resolveWalletFixture(
          root,
          walletsDir,
          protocol,
          asset,
          walletAddress,
          "complex-app-list.json",
        ),
      );

      if (!payload) return jsonResponse([]);
      if (!Array.isArray(payload)) {
        throw new Error("complex app list fixture must be an array");
      }

      return jsonResponse(payload);
    }

    if (url.includes("/user/all_token_list")) {
      const walletAddress = new URL(url).searchParams.get("id")?.toLowerCase();
      if (!walletAddress) return jsonResponse([]);

      const payload = await tryReadJson(
        resolveWalletFixture(
          root,
          walletsDir,
          protocol,
          asset,
          walletAddress,
          "all-token-list.json",
        ),
      );

      if (!payload) return jsonResponse([]);
      if (!Array.isArray(payload)) {
        throw new Error("all token list fixture must be an array");
      }

      return jsonResponse(payload);
    }

    return null;
  };
};

export const createDebankBundleHandler = (config: {
  root: string;
  protocol: string;
  bundleId: string;
  asset?: string;
  walletsDir?: string;
}): MockFetchHandler => {
  const { root, protocol, bundleId } = config;
  const asset = config.asset ?? null;
  const walletsDir =
    config.walletsDir ??
    (asset
      ? "providers/debank/wallets/{protocol}/{asset}"
      : "providers/debank/wallets/{protocol}");

  return async (url) => {
    if (!url.includes(`api.debank.com/bundle?id=${bundleId}`)) return null;

    const resolvedWalletsDir = walletsDir
      .replace("{protocol}", protocol)
      .replace("{asset}", asset ?? "");
    const walletsPath = isAbsolute(resolvedWalletsDir)
      ? resolve(resolvedWalletsDir)
      : resolve(root, "fixtures", resolvedWalletsDir);

    const walletDirs = await readdir(walletsPath);
    const walletAddresses = walletDirs.filter((dir) => dir.startsWith("0x"));

    return jsonResponse(walletAddresses.map((addr) => ({ id: addr })));
  };
};
