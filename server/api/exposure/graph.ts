import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildDraftGraphsByAsset } from "../../src/orchestrator";

import { putJsonToBlob } from "./blob";
import { graphSnapshotBlobPath } from "./paths";

const handler = async (request: VercelRequest, response: VercelResponse) => {
  // Intended to be invoked by Vercel Cron via GET; reject other methods.
  if (request.method && request.method !== "GET") {
    response.status(405).json({ error: "Method Not Allowed" });

    return;
  }

  try {
    const draftGraphs = await buildDraftGraphsByAsset();
    const results: { asset: string; path: string; url: string }[] = [];

    // Upload each asset/vault graph snapshot to its own blob URL.
    for (const [asset, store] of draftGraphs) {
      const snapshot = store.toSnapshot({ sources: [] });
      const rootNodeId = snapshot.nodes[0]?.id;

      if (!rootNodeId) {
        throw new Error(`Missing root node id for asset: ${asset}`);
      }

      const path = graphSnapshotBlobPath(rootNodeId);
      const url = await putJsonToBlob(path, snapshot);

      results.push({ asset, path, url });
    }

    response.status(200).json({
      count: results.length,
      assets: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    response.status(500).json({ error: message });
  }
};

export default handler;
