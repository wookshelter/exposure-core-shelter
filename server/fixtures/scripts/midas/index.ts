import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { adapterFactories } from "../../../src/adapters/registry";
import type { GraphSnapshot } from "../../../types";
import { buildDraftGraphsByAsset } from "../../../src/orchestrator";
import { putJsonToBlob } from "../../../api/exposure/blob";
import { graphSnapshotBlobPath } from "../../../api/exposure/paths";

import { readJson, writeJsonFile } from "../core/io";
import { createMockFetch, withMockFetch } from "../core/mock-fetch";
import { createDebankHandler } from "../resolvers/debank/mock";
import { createMidasAllocationsHandler } from "./mock";

interface Scenario {
  name: string;
  assets: string[];
}

const getFlagValue = (argv: string[], flag: string): string | null => {
  const idx = argv.indexOf(flag);
  const value = idx >= 0 ? argv[idx + 1] : null;
  return value && !value.startsWith("--") ? value : null;
};

const loadScenarios = async (argv: string[]): Promise<Scenario[]> => {
  const root = process.cwd();
  const scenariosDir = resolve(root, "fixtures", "scenarios");

  const scenarioName = getFlagValue(argv, "--scenario");
  if (scenarioName) {
    const scenarioPath = resolve(scenariosDir, `${scenarioName}.json`);
    const scenario = await readJson<Scenario>(scenarioPath);
    return [scenario];
  }

  const shouldAll = argv.includes("--all") || argv.length === 0;
  if (!shouldAll) return [];

  const files = (await readdir(scenariosDir, { withFileTypes: true }))
    .filter((ent) => ent.isFile() && ent.name.endsWith(".json"))
    .map((ent) => resolve(scenariosDir, ent.name));

  const scenarios: Scenario[] = [];
  for (const file of files) {
    const scenario = await readJson<Scenario>(file);
    if (!scenario?.name || !Array.isArray(scenario.assets)) continue;
    if (!scenario.name.startsWith("m")) continue;
    scenarios.push(scenario);
  }

  return scenarios;
};

export const run = async (argv: string[]): Promise<void> => {
  const root = process.cwd();
  const shouldUpload = argv.includes("--upload");

  const scenarios = await loadScenarios(argv);
  const requestedAssets = new Set<string>();
  for (const scenario of scenarios) {
    for (const asset of scenario.assets) requestedAssets.add(asset);
  }

  const allocationsPath = resolve(
    root,
    "fixtures",
    "providers",
    "midas",
    "allocations.json",
  );
  const allocations = await readJson<unknown[]>(allocationsPath);

  if (!Array.isArray(allocations)) {
    throw new Error(
      "fixtures/providers/midas/allocations.json must be an array",
    );
  }

  const debankHandlers = Array.from(requestedAssets).map((asset) =>
    createDebankHandler({ root, protocol: "midas", asset }),
  );

  const fetchImpl = createMockFetch({
    enabledProviders: ["midas", "debank"],
    handlers: [
      createMidasAllocationsHandler({ allocations }),
      ...debankHandlers,
    ],
  });

  await withMockFetch(fetchImpl, async () => {
    const draftGraphs = await buildDraftGraphsByAsset([adapterFactories.midas]);

    for (const [asset, store] of draftGraphs) {
      if (requestedAssets.size > 0 && !requestedAssets.has(asset)) continue;

      const snapshot: GraphSnapshot = store.toSnapshot({ sources: ["midas"] });
      const rootNodeId = snapshot.nodes[0]?.id;
      if (!rootNodeId) {
        throw new Error(`Missing root node id for asset: ${asset}`);
      }

      const outPath = resolve(
        root,
        "fixtures",
        "output",
        "midas",
        `${rootNodeId}.json`,
      );

      await writeJsonFile(outPath, snapshot);

      if (shouldUpload) {
        await putJsonToBlob(graphSnapshotBlobPath(rootNodeId), snapshot);
      }
    }
  });
};

void run(process.argv.slice(2));
