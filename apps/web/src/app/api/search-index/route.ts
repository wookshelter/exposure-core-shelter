import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";

import { resolveRepoPathFromWebCwd } from "@/lib/repoPaths";
import { tryHeadBlobUrl } from "@/lib/vercelBlob";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Local/dev path: prefer the repo-level generated fixtures index so it stays
    // in sync with adapters without requiring manual updates under /public.
    try {
      const fixturesPath = resolveRepoPathFromWebCwd(
        "server",
        "fixtures",
        "output",
        "search-index.json",
      );

      const raw = await readFile(fixturesPath, "utf8");
      const json = JSON.parse(raw) as unknown;
      return NextResponse.json(json);
    } catch {
      return NextResponse.json(
        {
          error: "Search index not found (fixtures)",
           hint: "Generate fixtures under server/fixtures/output and retry",
        },
        { status: 404 },
      );
    }
  }

  const blobPath = "exposure/search-index.json";
  const url = await tryHeadBlobUrl(blobPath);

  if (url) {
    return NextResponse.redirect(url, { status: 307 });
  }

  return NextResponse.json(
    { error: "Search index not found", candidates: [blobPath] },
    { status: 404 },
  );
}
