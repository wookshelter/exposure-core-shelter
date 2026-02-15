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

const RESOLV_BUNDLE_ID = "220554";

export const run = async (argv: string[]): Promise<void> => {
  const root = process.cwd();
  const shouldUpload = argv.includes("--upload");

  const fetchImpl = createMockFetch({
    enabledProviders: ["debank"],
    allowRealFetch: true,
    handlers: [
      createDebankBundleHandler({
        root,
        protocol: "resolv",
        bundleId: RESOLV_BUNDLE_ID,
      }),
      createDebankHandler({ root, protocol: "resolv" }),
    ],
  });

  await withMockFetch(fetchImpl, async () => {
    const draftGraphs = await buildDraftGraphsByAsset([
      adapterFactories.resolv,
    ]);

    for (const [asset, store] of draftGraphs) {
      const snapshot = store.toSnapshot({ sources: ["resolv"] });
      const rootNodeId = snapshot.nodes[0]?.id;
      if (!rootNodeId) {
        throw new Error(`Missing root node id for asset: ${asset}`);
      }

      const outPath = resolve(
        root,
        "fixtures",
        "output",
        "resolv",
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
