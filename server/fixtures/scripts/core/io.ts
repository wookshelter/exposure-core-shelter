import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export const writeJsonFile = async (
  path: string,
  payload: unknown,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });

  await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
};

export const readJson = async <T>(path: string): Promise<T> => {
  const raw = await readFile(path, "utf8");

  return JSON.parse(raw) as T;
};
