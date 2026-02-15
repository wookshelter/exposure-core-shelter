import { NextResponse } from "next/server";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { graphSnapshotBlobPath } from "@/lib/blobPaths";
import { resolveRepoPathFromWebCwd } from "@/lib/repoPaths";
import { tryHeadBlobUrl } from "@/lib/vercelBlob";

export const runtime = "nodejs";

const normalizeNodeIdFromPathParam = (raw: string): string => {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  return decoded.trim().toLowerCase();
};

const decodedNodeIdFromPathParam = (raw: string): string => {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  return decoded.trim();
};

const protocolToFolder = (protocol: string | null): string | null => {
  const p = protocol?.trim().toLowerCase() ?? null;
  if (!p) return null;

  if (p === "morpho-v1" || p === "morpho-v2" || p === "morpho") return "morpho";
  return p;
};

const inferProtocolFolderFromNodeId = (normalizedId: string): string | null => {
  // Expected shape: <chain>:<protocol>:<asset>
  const parts = normalizedId.split(":");
  const protocol = parts.length >= 2 ? parts[1] : null;
  return protocolToFolder(protocol);
};

const listFixtureProtocolFolders = async (): Promise<string[]> => {
  const fixturesRoot = resolveRepoPathFromWebCwd("server", "fixtures", "output");
  try {
    const entries = await readdir(fixturesRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
};

const fixtureCandidatesForNode = async (normalizedId: string, request: Request): Promise<string[]> => {
  const url = new URL(request.url);
  const requestedProtocolFolder = protocolToFolder(url.searchParams.get("protocol"));
  const inferredProtocolFolder = inferProtocolFolderFromNodeId(normalizedId);

  const protocolFolders: string[] = [];
  if (requestedProtocolFolder) protocolFolders.push(requestedProtocolFolder);
  if (inferredProtocolFolder && inferredProtocolFolder !== requestedProtocolFolder) {
    protocolFolders.push(inferredProtocolFolder);
  }

  if (protocolFolders.length === 0) {
    protocolFolders.push(...(await listFixtureProtocolFolders()));
  }

  const fixturesRoot = resolveRepoPathFromWebCwd("server", "fixtures", "output");
  return protocolFolders.map((protocol) => resolve(fixturesRoot, protocol, `${normalizedId}.json`));
};

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const normalizedId = normalizeNodeIdFromPathParam(id);
  const decodedId = decodedNodeIdFromPathParam(id);

  if (!normalizedId) {
    return new Response(null, { status: 400 });
  }

  // Dev/local: confirm fixtures existence without reading full contents.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const tried = await fixtureCandidatesForNode(normalizedId, request);
    const fallback = decodedId && decodedId.toLowerCase() !== normalizedId
      ? await fixtureCandidatesForNode(decodedId.trim().toLowerCase(), request)
      : [];
    const candidates = [...tried, ...fallback];

    for (const filePath of candidates) {
      try {
        await access(filePath);
        return new Response(null, { status: 200 });
      } catch {
        // try next
      }
    }

    return new Response(null, {
      status: 404,
      headers: {
        "x-exposure-tried": candidates.join(";"),
      },
    });
  }

  const blobPath = graphSnapshotBlobPath(normalizedId);
  const url = await tryHeadBlobUrl(blobPath);

  if (url) {
    return new Response(null, {
      status: 200,
      headers: { "x-exposure-blob-url": url },
    });
  }

  return new Response(null, { status: 404 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  const normalizedId = normalizeNodeIdFromPathParam(id);
  const decodedId = decodedNodeIdFromPathParam(id);

  if (!normalizedId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Dev/local: read repo-level fixtures output by canonical nodeId.
  // Layout: server/fixtures/output/<protocol>/<nodeId>.json
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const tried = await fixtureCandidatesForNode(normalizedId, request);
    const fallback = decodedId && decodedId.toLowerCase() !== normalizedId
      ? await fixtureCandidatesForNode(decodedId.trim().toLowerCase(), request)
      : [];
    const candidates = [...tried, ...fallback];

    for (const filePath of candidates) {

      try {
        const raw = await readFile(filePath, "utf8");

        return new Response(raw, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch {
        // try next
      }
    }

    return NextResponse.json(
      { error: "Graph snapshot not found (fixtures)", id: normalizedId, tried: candidates },
      { status: 404 },
    );
  }

  const blobPath = graphSnapshotBlobPath(normalizedId);
  const url = await tryHeadBlobUrl(blobPath);

  if (url) {
    return NextResponse.redirect(url, { status: 307 });
  }

  return NextResponse.json(
    {
      error: "Graph snapshot not found",
      id: normalizedId,
      candidates: [blobPath],
    },
    { status: 404 },
  );
}
