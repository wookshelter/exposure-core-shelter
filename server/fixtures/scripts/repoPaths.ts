import { resolve } from "node:path";

// Next route handlers run with process.cwd() = apps/web.
export const resolveRepoPathFromWebCwd = (...segments: string[]): string => {
  return resolve(process.cwd(), "..", "..", ...segments);
};
