"use client";

import React, { useMemo, useState } from "react";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { GraphSnapshot, GraphNode, GraphEdge } from "@/types";
import { getDirectChildren } from "@/lib/graph";
import { getNodeLogoPath } from "@/lib/logos";

interface AssetTreeMapProps {
  data: GraphSnapshot | null;
  rootNodeId?: string;
  onSelect: (
    node: GraphNode,
    meta?: {
      lendingPosition?: "collateral" | "borrow";
    },
  ) => void | Promise<void>;
  selectedNodeId?: string | null;
  lastClick?: { nodeId: string; seq: number } | null;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  compactDisplay: "short",
});

const sanitizeSvgId = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
};

const ellipsizeToWidth = (value: string, maxWidthPx: number, fontSizePx: number): string => {
  // Heuristic: average character width ~ 0.6em for the fonts we use.
  const approxCharWidth = fontSizePx * 0.6;
  const maxChars = Math.max(3, Math.floor(maxWidthPx / approxCharWidth));

  if (value.length <= maxChars) return value;
  if (maxChars <= 3) return value.slice(0, 1) + "…";

  return value.slice(0, maxChars - 1) + "…";
};

// Custom Tile Content
const CustomContent = (props: any) => {
  const { root, depth, x, y, width, height, index, payload, colors, rank, name, value, percent, onSelect, selectedNodeId } = props;
  const {
    pressedNodeId,
    onPressStart,
    onPressEnd,
    lastClick,
  }: {
    pressedNodeId: string | null;
    onPressStart: (nodeId: string) => void;
    onPressEnd: () => void;
    lastClick: { nodeId: string; seq: number } | null;
  } = props;
  
  // Resolve data source: Check payload first, then fallback to props
  const dataItem = payload || props;
  const nodeId = dataItem?.nodeId;
  const fullNode = dataItem?.fullNode;

  // If we can't identify the node (e.g. root container), skip rendering
  if (!nodeId || !fullNode) return null;

  const isSelected = selectedNodeId === nodeId;
  const isPressed = pressedNodeId === nodeId;
  const originalValue = dataItem.originalValue ?? value;

  // Paradigm-ish palette (pastels + black stroke/text).
  // The site uses soft category colors; we mirror that by mapping our node kinds.
  const kind = String(fullNode?.details?.kind ?? "");
  const lendingPosition = dataItem?.lendingPosition as
    | "collateral"
    | "borrow"
    | undefined;

  const fill = (() => {
    if (lendingPosition === "collateral") return "#ABDFC5";
    if (lendingPosition === "borrow") return "#FF8888";

    if (kind === "Yield") return "#92A8F3";
    if (kind === "Deposit") return "#DCD8D3";
    if (kind === "Investment") return "#D7DADA";
    if (kind === "Lending") return "#838DE7";

    if (/stake/i.test(kind)) return "#ABDFC5";

    return "#FAFAFA";
  })();

  const stroke = "#000000";
  const fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const logoPath = getNodeLogoPath(fullNode);
  // Show logo if path exists and tile is large enough
  const showLogo = logoPath && width > 60 && height > 60;

  // Avoid doubled borders between adjacent tiles by drawing tiles slightly
  // inset, letting the container background act as the grid line.
  const gridPx = 1;
  const tileX = x + gridPx / 2;
  const tileY = y + gridPx / 2;
  const tileW = Math.max(0, width - gridPx);
  const tileH = Math.max(0, height - gridPx);

  const centerX = tileX + tileW / 2;
  const centerY = tileY + tileH / 2;

  const clipId = `clip_${sanitizeSvgId(String(nodeId))}`;

  const nameFontSize = 14;
  const usdFontSize = 12;
  const horizontalPadding = 12;
  const availableTextWidth = Math.max(0, width - horizontalPadding * 2);
  const safeName = ellipsizeToWidth(String(name), availableTextWidth, nameFontSize);
  const safeUsd = ellipsizeToWidth(
    currencyFormatter.format(originalValue),
    availableTextWidth,
    usdFontSize,
  );

  const clickFlashActive = lastClick?.nodeId === nodeId;

  const handleActivate = () => {
    void onSelect(fullNode, { lendingPosition });
  };

  const handleKeyDown: React.KeyboardEventHandler<SVGGElement> = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    handleActivate();
  };

  return (
    <g
      onPointerDown={() => onPressStart(String(nodeId))}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
      onPointerLeave={onPressEnd}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className="exposure-tile"
      role="button"
      tabIndex={0}
      aria-label={String(name)}
      data-node-id={String(nodeId)}
      data-fill={fill}
      style={{ cursor: "pointer" }}
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <rect x={tileX} y={tileY} width={tileW} height={tileH} rx={0} ry={0} />
        </clipPath>
      </defs>
      <rect
        x={tileX}
        y={tileY}
        width={tileW}
        height={tileH}
        style={{
          fill,
          opacity: 1,
        }}
        className={isPressed ? "exposure-tile-rect exposure-tile-rect--pressed" : "exposure-tile-rect"}
        rx={0}
        ry={0}
      />

      {isSelected && (
        <rect
          x={tileX}
          y={tileY}
          width={tileW}
          height={tileH}
          rx={0}
          ry={0}
          style={{
            fill: "none",
            stroke,
            strokeWidth: 2,
            strokeOpacity: 1,
          }}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {clickFlashActive && (
        <rect
          key={lastClick?.seq}
          x={tileX}
          y={tileY}
          width={tileW}
          height={tileH}
          rx={0}
          ry={0}
          className="exposure-tile-click"
          style={{
            fill: "none",
            stroke,
            strokeWidth: 2,
            strokeOpacity: 1,
          }}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <g clipPath={`url(#${clipId})`}>
        {showLogo && (
          <image
            href={logoPath!}
            x={tileX + 6}
            y={tileY + 6}
            height="16"
            width="16"
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        {width > 80 && height > 40 && (
          <>
            <text
              x={centerX}
              y={centerY - 4}
              textAnchor="middle"
              fill="#000000"
              fontSize={nameFontSize}
              fontWeight={500}
              style={{ fontFamily }}
            >
              {safeName}
            </text>
            <text
              x={centerX}
              y={centerY + 16}
              textAnchor="middle"
              fill="rgba(0, 0, 0, 0.78)"
              fontSize={usdFontSize}
              fontWeight={400}
              style={{ fontFamily }}
            >
              {safeUsd}
            </text>
            <text
              x={tileX + tileW - 8}
              y={tileY + tileH - 8}
              textAnchor="end"
              fill="rgba(0, 0, 0, 0.62)"
              fontSize={12}
              style={{ fontFamily }}
            >
              {(percent * 100).toFixed(1)}%
            </text>
          </>
        )}
      </g>
    </g>
  );
};

export default function AssetTreeMap({
  data,
  rootNodeId,
  onSelect,
  selectedNodeId,
  lastClick,
}: AssetTreeMapProps) {
  const [pressedNodeId, setPressedNodeId] = useState<string | null>(null);

  const chartData = useMemo(() => {
    if (!data || !rootNodeId) return [];

    const root = data.nodes.find((n) => n.id === rootNodeId);

    if (!root) return [];

    const children = getDirectChildren(root, data.nodes, data.edges);

    const nodesById = new Map(data.nodes.map((n) => [n.id, n] as const));
    const edgesByFrom = new Map<string, GraphEdge[]>();
    for (const edge of data.edges) {
      const list = edgesByFrom.get(edge.from);
      if (list) list.push(edge);
      else edgesByFrom.set(edge.from, [edge]);
    }

    const pickTopTokenName = (
      fromId: string,
      lendingPosition: "collateral" | "borrow",
    ): string | null => {
      const outgoing = edgesByFrom.get(fromId) ?? [];

      let best: GraphEdge | null = null;
      for (const e of outgoing) {
        if (e.lendingPosition !== lendingPosition) continue;
        if (!best || Math.abs(e.allocationUsd) > Math.abs(best.allocationUsd)) {
          best = e;
        }
      }

      const to = best?.to;
      if (!to) return null;
      return nodesById.get(to)?.name ?? null;
    };

    return children.map((c) => ({
        name: (() => {
          const node = c.node;
          if (!node) return c.id;

          if (node.details?.kind === "Lending") {
            const borrow = pickTopTokenName(node.id, "borrow");
            const collateral = pickTopTokenName(node.id, "collateral");

            if (collateral && borrow) return `${collateral}/${borrow}`;
            if (collateral) return collateral;
            if (borrow) return borrow;
          }

          return node.name;
        })(),
        value: c.value,
        originalValue: c.edge.allocationUsd,
        percent: c.percent,
        nodeId: c.id,
        fullNode: c.node,
        lendingPosition: c.edge.lendingPosition,
    }));
  }, [data, rootNodeId]);

  if (!data || chartData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        No allocation data available.
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black p-4">
      <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={chartData}
                  dataKey="value"
                  aspectRatio={4 / 3}
                  stroke="transparent"
                  fill="#8884d8"
                  content={(
                    <CustomContent
                      onSelect={onSelect}
                      selectedNodeId={selectedNodeId}
                      pressedNodeId={pressedNodeId}
                      onPressStart={(nodeId: string) => setPressedNodeId(nodeId)}
                      onPressEnd={() => setPressedNodeId(null)}
                      lastClick={lastClick ?? null}
                    />
                  )}
                  isAnimationActive={false}
                >
              <Tooltip 
                 formatter={(value: any, name: any, props: any) => {
                      const originalValue = props?.payload?.originalValue;
                      return currencyFormatter.format(Number(originalValue ?? value));
                  }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
         </Treemap>
       </ResponsiveContainer>
    </div>
  );
}
