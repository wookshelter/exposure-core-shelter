import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const parseEnvFile = (content: string): Record<string, string> => {
  const out: Record<string, string> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;

    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) out[key] = value;
  }

  return out;
};

const main = (): void => {
  const argv = process.argv.slice(2);

  let envFile: string | null = null;
  let upload = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--upload") {
      upload = true;
      continue;
    }

    if (arg === "--env") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--env requires a file path");
      }
      envFile = next;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const serverDir = resolve(here, "..", "..");
  const repoRoot = resolve(serverDir, "..");

  const inferredEnvFile =
    process.env.NODE_ENV === "production"
      ? "./env.production.sh"
      : "./env.local.sh";
  const resolvedEnvFile = resolve(repoRoot, envFile ?? inferredEnvFile);

  if (existsSync(resolvedEnvFile)) {
    const envVars = parseEnvFile(readFileSync(resolvedEnvFile, "utf8"));
    for (const [k, v] of Object.entries(envVars)) {
      if (process.env[k] == null) process.env[k] = v;
    }
  }

  if (!process.env.DUNE_API_KEY) {
    throw new Error(
      "Missing DUNE_API_KEY (set it in env.local.sh/env.production.sh or export it)",
    );
  }

  if (upload && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN (required for --upload)");
  }

  const tsxBin = resolve(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );
  if (!existsSync(tsxBin)) {
    throw new Error(`Missing tsx binary at: ${tsxBin}`);
  }

  const scripts = [
    "euler",
    "gauntlet",
    "morpho",
    "ethena",
    "sky",
    "infinifi",
    "resolv",
    "yuzu",
    "midas",
  ] as const;

  for (const name of scripts) {
    const scriptPath = resolve(
      serverDir,
      "fixtures",
      "scripts",
      name,
      "index.ts",
    );
    const args = upload ? [scriptPath, "--upload"] : [scriptPath];

    const result = spawnSync(tsxBin, args, {
      cwd: serverDir,
      stdio: "inherit",
      env: process.env,
    });

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  const searchIndexPath = resolve(
    serverDir,
    "fixtures",
    "scripts",
    "search-index",
    "index.ts",
  );
  const searchArgs = upload ? [searchIndexPath, "--upload"] : [searchIndexPath];

  const searchResult = spawnSync(tsxBin, searchArgs, {
    cwd: serverDir,
    stdio: "inherit",
    env: process.env,
  });

  if (searchResult.status !== 0) {
    process.exit(searchResult.status ?? 1);
  }
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message);
  process.exit(1);
}
