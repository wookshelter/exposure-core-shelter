interface LendingDetail {
  kind: "Lending";
  collateralUsd: number;
  debtUsd: number;
  netUsd: number;
  healthRate: number;
}

interface LendingMarketDetail {
  kind: "Lending Market";
}

interface YieldDetail {
  kind: "Yield";
  curator: string | null;
}

interface DepositDetail {
  kind: "Deposit";
}

interface StakedDetail {
  kind: "Staked";
}

interface LockedDetail {
  kind: "Locked";
}

interface LiquidityPoolDetail {
  kind: "Liquidity Pool";
}

interface ProtectionDetail {
  kind: "Protection";
  curator?: string | null;
}

interface PerpetualsDetail {
  kind: "Perpetuals";
}

interface InvestmentDetail {
  kind: "Investment";
}

export type NodeDetails =
  | LendingDetail
  | LendingMarketDetail
  | YieldDetail
  | DepositDetail
  | StakedDetail
  | LockedDetail
  | LiquidityPoolDetail
  | ProtectionDetail
  | PerpetualsDetail
  | InvestmentDetail;

export interface Node {
  id: string;
  chain?: "global" | string;
  name: string;
  protocol?: string;
  apy?: number | null;
  tvlUsd?: number | null;
  details?: NodeDetails | null;
}

export type LendingPosition = "collateral" | "borrow";

export interface Edge {
  from: string;
  to: string;
  allocationUsd: number;
  lendingPosition?: LendingPosition;
}

export interface GraphSnapshot {
  nodes: Node[];
  edges: Edge[];
  sources: string[];
}
