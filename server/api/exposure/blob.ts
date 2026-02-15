import { put } from "@vercel/blob";

const JSON_CONTENT_TYPE = "application/json";

type JsonPayload = unknown;

const serializeJsonPayload = (payload: JsonPayload | string): string => {
  if (typeof payload === "string") return payload;

  return JSON.stringify(payload);
};

export const putJsonToBlob = async (
  pathname: string,
  payload: JsonPayload | string,
): Promise<string> => {
  const { url } = await put(pathname, serializeJsonPayload(payload), {
    access: "public",
    contentType: JSON_CONTENT_TYPE,
    addRandomSuffix: false,
  });

  return url;
};
