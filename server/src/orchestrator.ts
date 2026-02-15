import { GraphStore } from "./core/graph";
import { adapterFactories } from "./adapters/registry";
import type { AdapterFactory } from "./adapters/registry";
import type { AnyAdapter } from "./adapters/types";

// Orchestrator does not depend on adapter-specific catalog/allocation shapes.
// We intentionally erase those generics here to avoid union inference issues
// when running heterogeneous adapters.

const runAdapter = async (
  adapter: AnyAdapter,
  storesByAsset: Map<string, GraphStore>,
): Promise<void> => {
  const catalog = await adapter.fetchCatalog();
  const grouped = adapter.getAssetByAllocations(catalog);

  for (const [asset, allocations] of Object.entries(grouped)) {
    if (allocations.length === 0) continue;

    const root = adapter.buildRootNode(asset, allocations);

    if (!root) continue;

    const store = storesByAsset.get(asset) ?? new GraphStore();

    storesByAsset.set(asset, store);

    const { nodes, edges } = await adapter.normalizeLeaves(root, allocations);

    store.upsertNode(root);
    store.upsertNodes(nodes);
    store.addEdges(edges);
  }
};

const runAdapterFactory = async (
  factory: AdapterFactory,
  storesByAsset: Map<string, GraphStore>,
): Promise<void> => {
  const adapter = factory();

  await runAdapter(adapter, storesByAsset);
};

export const buildDraftGraphsByAsset = async (
  factories: readonly AdapterFactory[] = Object.values(adapterFactories),
): Promise<Map<string, GraphStore>> => {
  const storesByAsset = new Map<string, GraphStore>();

  for (const factory of factories) {
    await runAdapterFactory(factory, storesByAsset);
  }

  if (storesByAsset.size === 0) {
    throw new Error("No adapters produced data");
  }

  return storesByAsset;
};
