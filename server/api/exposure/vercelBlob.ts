import { head } from "@vercel/blob";

export const tryHeadBlobUrl = async (pathname: string): Promise<string | null> => {
  try {
    const result = await head(pathname);

    return result.url;
  } catch {
    return null;
  }
};
