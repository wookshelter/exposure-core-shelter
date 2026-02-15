import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { putJsonToBlob } from "../../../api/exposure/blob";
import { searchIndexBlobPath } from "../../../api/exposure/paths";
import { readJson, writeJsonFile } from "../core/io";

interface SnapshotNode {
  id: string;
  name: string;
  protocol?: string;
}

interface Snapshot {
  nodes: SnapshotNode[];
}

interface SearchIndexEntry {
  id: string;
  chain: string;
  protocol: string;
  name: string;
  nodeId: string;
}

const collectSearchIndexEntries = async (
  outputDir: string,
): Promise<SearchIndexEntry[]> => {
  const protocolDirs = (await readdir(outputDir, { withFileTypes: true }))
    .filter((ent) => ent.isDirectory())
    .map((ent) => ent.name);

  const entries: SearchIndexEntry[] = [];

  for (const protocolDir of protocolDirs) {
    const dirPath = resolve(outputDir, protocolDir);

    const files = (await readdir(dirPath, { withFileTypes: true }))
      .filter((ent) => ent.isFile() && ent.name.endsWith(".json"))
      .map((ent) => resolve(dirPath, ent.name));

    for (const file of files) {
      const snapshot = await readJson<Snapshot>(file);
      if (!snapshot?.nodes) continue;

      // Root node is inserted first by the orchestrator for single-adapter snapshots.
      const root = snapshot.nodes[0];
      if (!root?.id || !root.name) continue;

      const idParts = root.id.split(":");
      const protocolFromId = idParts[1] ?? "unknown";
      let protocol = (root.protocol ?? protocolFromId).toLowerCase();

      if (protocol.startsWith("midas")) protocol = "midas";

      const chainFromId = (idParts[0] ?? "global").toLowerCase();
      const chain = chainFromId.toLowerCase();

      entries.push({
        // Canonical key: nodeId.
        // Frontend can choose to display a shorter/pretty ID separately if needed.
        id: root.id,
        chain,
        protocol,
        name: root.name,
        nodeId: root.id,
      });
    }
  }

  return entries;
};

const main = async (): Promise<void> => {
  const rootDir = process.cwd();

  const outputDir = resolve(rootDir, "fixtures", "output");
  const outPath = resolve(outputDir, "search-index.json");

  const entries = await collectSearchIndexEntries(outputDir);

  const seen = new Set<string>();
  const deduped: SearchIndexEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.protocol}|${entry.chain}|${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  deduped.sort((a, b) => a.name.localeCompare(b.name));

  await writeJsonFile(outPath, deduped);

  const shouldUpload = process.argv.slice(2).includes("--upload");

  if (shouldUpload) {
    await putJsonToBlob(searchIndexBlobPath(), deduped);
  }
};

void main();
