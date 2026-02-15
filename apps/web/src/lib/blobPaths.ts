export const graphSnapshotBlobPath = (nodeId: string): string => {
  return `exposure/graph/${nodeId}.json`;
};

export const searchIndexBlobPath = (): string => {
  return "exposure/search-index.json";
};
