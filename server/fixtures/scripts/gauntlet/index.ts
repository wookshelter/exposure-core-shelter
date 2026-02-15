import { resolve } from "node:path";

import { adapterFactories } from "../../../src/adapters/registry";
import { buildDraftGraphsByAsset } from "../../../src/orchestrator";
import { putJsonToBlob } from "../../../api/exposure/blob";
import { graphSnapshotBlobPath } from "../../../api/exposure/paths";

import { writeJsonFile } from "../core/io";

export const run = async (argv: string[]): Promise<void> => {
  const root = process.cwd();
  const shouldUpload = argv.includes("--upload");

  const draftGraphs = await buildDraftGraphsByAsset([adapterFactories.gauntlet]);

  for (const [, store] of draftGraphs) {
    const snapshot = store.toSnapshot({ sources: ["gauntlet"] });
    const rootNodeId = snapshot.nodes[0]?.id;

    if (!rootNodeId) {
      throw new Error("Missing root node id for gauntlet snapshot");
    }

    const outPath = resolve(
      root,
      "fixtures",
      "output",
      "gauntlet",
      `${rootNodeId}.json`,
    );

    await writeJsonFile(outPath, snapshot);

    if (shouldUpload) {
      await putJsonToBlob(graphSnapshotBlobPath(rootNodeId), snapshot);
    }
  }
};

void run(process.argv.slice(2));
