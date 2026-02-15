import type { GraphResult } from "../../adapters/types";
import type { NodeDetails, Edge, Node } from "../../types";
import {
  fetchComplexAppList,
  fetchComplexProtocolList,
  fetchTokenList,
  type PortfolioItemObject,
} from "./fetcher";
import {
  buildProtocolListItemId,
  buildAppListItemId,
  isAllocationUsdEligible,
  tokenToUsdValue,
} from "./utils";
import { normalizeChain, normalizeProtocol } from "../../utils";

const processProtocolCommonItem = (params: {
  item: PortfolioItemObject;
  rootId: string;
  details: Extract<NodeDetails, { kind: "Yield" | "Deposit" | "Staked" }>;
}): GraphResult => {
  const { item, rootId, details } = params;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const supplyTokens = item.detail.supply_token_list;
  const description = item.detail.description ?? "";
  //most deposit case wouldnt be handled with description.
  const allocationUsd = item.stats.net_usd_value;

  if (!isAllocationUsdEligible(allocationUsd)) return { nodes, edges };

  if (!item.pool) return { nodes, edges };

  const { project_id, chain, id } = item.pool;
  const chainSlug = normalizeChain(chain);
  const protocolSlug = normalizeProtocol(project_id);
  const nodeId = buildProtocolListItemId(chain, project_id, id);
  const name = (description || supplyTokens[0]?.name) ?? "";

  nodes.push({
    id: nodeId,
    chain: chainSlug,
    name,
    protocol: protocolSlug,
    details,
  });

  edges.push({
    from: rootId,
    to: nodeId,
    allocationUsd,
  });

  return { nodes, edges };
};

const processLiquidityPoolItem = (params: {
  item: PortfolioItemObject;
  rootId: string;
}): GraphResult => {
  const { item, rootId } = params;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!item.pool) return { nodes, edges };

  const { project_id, chain, id } = item.pool;
  const chainSlug = normalizeChain(chain);
  const protocolSlug = normalizeProtocol(project_id);
  const allocationUsd = item.stats.net_usd_value;

  if (!isAllocationUsdEligible(allocationUsd)) return { nodes, edges };

  const supplyTokens = item.detail.supply_token_list ?? [];
  const tokenName0 = supplyTokens[0]?.name ?? "";
  const tokenName1 = supplyTokens[1]?.name ?? "";

  // consider pendle lp pool
  const poolName =
    tokenName0 && tokenName1 ? `${tokenName0}/${tokenName1}` : tokenName0;

  const nodeId = buildProtocolListItemId(chain, project_id, id);

  nodes.push({
    id: nodeId,
    chain: chainSlug,
    name: poolName,
    protocol: protocolSlug,
    details: { kind: "Liquidity Pool" },
  });

  edges.push({
    from: rootId,
    to: nodeId,
    allocationUsd: allocationUsd,
  });

  return { nodes, edges };
};

const processLendingItem = (params: {
  item: PortfolioItemObject;
  rootId: string;
  walletAddress: string;
}): GraphResult => {
  const { item, rootId, walletAddress } = params;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!item.pool) return { nodes, edges };

  const { project_id, chain } = item.pool;
  const chainSlug = normalizeChain(chain);
  const protocolSlug = normalizeProtocol(project_id);
  const allocationUsd = item.stats.net_usd_value;

  if (!isAllocationUsdEligible(allocationUsd)) return { nodes, edges };

  const positionId = buildProtocolListItemId(
    chain,
    project_id,
    walletAddress,
    item.position_index,
  );

  // create lending position node
  nodes.push({
    id: positionId,
    chain: chainSlug,
    name: "LendingPosition",
    protocol: protocolSlug,
    details: {
      kind: "Lending",
      collateralUsd: item.stats.asset_usd_value,
      debtUsd: item.stats.debt_usd_value,
      netUsd: item.stats.net_usd_value,
      healthRate: item.detail.health_rate ?? 0,
    },
  });

  //connect root node with the position node
  edges.push({
    from: rootId,
    to: positionId,
    allocationUsd: allocationUsd,
  });

  const supplyTokens = item.detail.supply_token_list ?? [];
  const borrowTokens = item.detail.borrow_token_list ?? [];

  for (const token of supplyTokens) {
    const tokenId = buildProtocolListItemId(
      chain,
      token.protocol_id,
      token.id ?? "",
    );

    // create placeholder for token node
    // it would be best to fill this node with the token related market info
    // but in this case it is hard to know detail market info.
    // fill the other field with another protocol adapters (e.g token deatails)
    nodes.push({
      id: tokenId,
      chain: chainSlug,
      name: token.name ?? "",
      protocol: normalizeProtocol(token.protocol_id),
    });

    // connect token with the position node
    edges.push({
      from: positionId,
      to: tokenId,
      allocationUsd: tokenToUsdValue(token),
      lendingPosition: "collateral",
    });
  }

  for (const token of borrowTokens) {
    const tokenId = buildProtocolListItemId(
      chain,
      token.protocol_id,
      token.id ?? "",
    );

    nodes.push({
      id: tokenId,
      chain: chainSlug,
      name: token.name ?? "",
      protocol: normalizeProtocol(token.protocol_id),
    });

    edges.push({
      from: positionId,
      to: tokenId,
      allocationUsd: tokenToUsdValue(token),
      lendingPosition: "borrow",
    });
  }

  return { nodes, edges };
};

export const processComplexProtocolItem = async (
  walletAddress: string,
  rootId: string,
): Promise<GraphResult> => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const protocolList = await fetchComplexProtocolList(walletAddress);

  for (const protocol of protocolList) {
    const items = protocol.portfolio_item_list;

    if (!items) continue;

    for (const item of items) {
      if (
        item.name === "Yield" ||
        item.name === "Staked" ||
        item.name === "Deposit"
      ) {
        const details: Extract<
          NodeDetails,
          { kind: "Yield" | "Deposit" | "Staked" }
        > =
          item.name === "Yield"
            ? { kind: "Yield", curator: null }
            : item.name === "Deposit"
              ? { kind: "Deposit" }
              : { kind: "Staked" };

        const result = processProtocolCommonItem({
          item,
          rootId,
          details,
        });

        nodes.push(...result.nodes);
        edges.push(...result.edges);
      }

      if (item.name === "Lending") {
        const result = processLendingItem({
          item,
          rootId,
          walletAddress,
        });

        nodes.push(...result.nodes);
        edges.push(...result.edges);
      }

      if (item.name === "Liquidity Pool") {
        const result = processLiquidityPoolItem({
          item,
          rootId,
        });
        nodes.push(...result.nodes);
        edges.push(...result.edges);
      }

      continue;
    }
  }

  return { nodes, edges };
};

const processAppChainCommonItem = (params: {
  item: PortfolioItemObject;
  rootId: string;
  details: NodeDetails;
}): GraphResult => {
  const { item, rootId, details } = params;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (item.pool || !item.base) return { nodes, edges };

  const supplyTokens = item.detail.supply_token_list;
  const description = item.detail.description ?? "";
  const allocationUsd = item.stats.net_usd_value;

  if (!supplyTokens[0] || !isAllocationUsdEligible(allocationUsd)) {
    return { nodes, edges };
  }

  const appId = item.base.app_id;
  const nodeId = buildAppListItemId(appId, description, supplyTokens[0].id);

  nodes.push({
    id: nodeId,
    chain: appId,
    name: `${description}:${supplyTokens[0].name ?? ""}`,
    protocol: appId,
    details,
  });

  edges.push({
    from: rootId,
    to: nodeId,
    allocationUsd,
  });

  return { nodes, edges };
};

const processPerpetualItem = (params: {
  item: PortfolioItemObject;
  rootId: string;
}): GraphResult => {
  const { item, rootId } = params;
  const { position_token, margin_token, description } = item.detail;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!item.base || !position_token || !margin_token || !description) {
    return { nodes, edges };
  }

  const allocationUsd = item.stats.net_usd_value;

  if (!isAllocationUsdEligible(allocationUsd)) return { nodes, edges };

  const { app_id } = item.base;

  // since there is no pool object in app chain response.
  // can not use pool.id to build nodeid.
  const nodeId = buildAppListItemId(
    app_id,
    description,
    position_token.id,
    margin_token.id,
  );

  nodes.push({
    id: nodeId,
    chain: app_id,
    name: `${position_token.name}/${margin_token.name}`,
    protocol: app_id,
    details: {
      kind: "Perpetuals",
    },
  });

  edges.push({
    from: rootId,
    to: nodeId,
    allocationUsd,
  });

  return { nodes, edges };
};

export const processComplexAppItem = async (
  walletAddress: string,
  rootId: string,
): Promise<GraphResult> => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const protocolList = await fetchComplexAppList(walletAddress);

  for (const protocol of protocolList) {
    const items = protocol.portfolio_item_list;

    if (!items) continue;

    for (const item of items) {
      if (item.name === "Deposit") {
        const result = processAppChainCommonItem({
          item,
          rootId,
          details: {
            kind: "Deposit",
          },
        });

        nodes.push(...result.nodes);
        edges.push(...result.edges);
      }

      if (item.name === "Perpetuals") {
        const result = processPerpetualItem({
          item,
          rootId,
        });
        nodes.push(...result.nodes);
        edges.push(...result.edges);
      }

      continue;
    }
  }

  return { nodes, edges };
};

export const processTokenBalance = async (
  walletAddress: string,
  rootId: string,
): Promise<GraphResult> => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const tokens = await fetchTokenList(walletAddress);

  for (const token of tokens) {
    if (!token.symbol || !token.id) continue;

    const allocationUsd = tokenToUsdValue(token);
    if (!isAllocationUsdEligible(allocationUsd)) continue;

    const chainSlug = normalizeChain(token.chain);
    const protocolSlug = normalizeProtocol(token.protocol_id ?? "");
    const tokenId = buildProtocolListItemId(
      token.chain,
      token.protocol_id ?? "",
      token.id,
    );

    nodes.push({
      id: tokenId,
      chain: chainSlug,
      name: token.name ?? token.symbol,
      protocol: protocolSlug,
    });

    edges.push({
      from: rootId,
      to: tokenId,
      allocationUsd,
    });
  }

  return { nodes, edges };
};
