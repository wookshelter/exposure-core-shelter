import { resolve } from "node:path";

import { adapterFactories } from "../../../src/adapters/registry";
import { buildDraftGraphsByAsset } from "../../../src/orchestrator";
import { putJsonToBlob } from "../../../api/exposure/blob";
import { graphSnapshotBlobPath } from "../../../api/exposure/paths";

import { writeJsonFile } from "../core/io";
import { createMockFetch, withMockFetch } from "../core/mock-fetch";
import {
  createDebankBundleHandler,
  createDebankHandler,
} from "../resolvers/debank/mock";

const INFINIFI_BUNDLE_ID = "220816";

export const run = async (argv: string[]): Promise<void> => {
  const root = process.cwd();
  const shouldUpload = argv.includes("--upload");

  const fetchImpl = createMockFetch({
    enabledProviders: ["infinifi", "debank"],
    allowRealFetch: true,
    handlers: [
      createDebankBundleHandler({
        root,
        protocol: "infinifi",
        bundleId: INFINIFI_BUNDLE_ID,
      }),
      createDebankHandler({ root, protocol: "infinifi" }),
    ],
  });

  await withMockFetch(fetchImpl, async () => {
    const draftGraphs = await buildDraftGraphsByAsset([
      adapterFactories.infinifi,
    ]);

    for (const [asset, store] of draftGraphs) {
      const snapshot = store.toSnapshot({ sources: ["infinifi"] });
      const rootNodeId = snapshot.nodes[0]?.id;
      if (!rootNodeId) {
        throw new Error(`Missing root node id for asset: ${asset}`);
      }

      const outPath = resolve(
        root,
        "fixtures",
        "output",
        "infinifi",
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
