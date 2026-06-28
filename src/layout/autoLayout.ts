import type { DiagramData, DiagramTable } from '../model/types';

/**
 * Deterministic, documented ER auto-layout.
 *
 * Rules (see README "Auto Layout"):
 * 1. Cluster tables by TableGroup. Ungrouped tables share one "(ungrouped)" cluster.
 * 2. Order groups by connectivity: build a weighted group graph from inter-group
 *    FK counts, then seriate groups into a chain greedily (start from the most
 *    connected group, repeatedly append the group most connected to those already
 *    placed). This keeps strongly-related groups spatially adjacent.
 * 3. Place group clusters left-to-right, top-to-bottom on a grid of
 *    ceil(sqrt(groupCount)) columns, using boustrophedon (snake) row direction so
 *    consecutive groups in the chain stay neighbours across row breaks.
 * 4. Within a group, arrange member tables in a grid of ceil(sqrt(n)) columns,
 *    ordered by FK degree (hub tables first) so highly-connected tables sit
 *    top-left of their cluster.
 * 5. Cluster/table sizes are derived from column counts; fixed gaps and padding.
 */

const CARD_WIDTH = 260;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 36;
const CARD_PADDING = 8;

const TABLE_GAP_X = 60;
const TABLE_GAP_Y = 48;
const GROUP_PADDING = 48;
const GROUP_GAP_X = 120;
const GROUP_GAP_Y = 120;

const UNGROUPED = '(ungrouped)';

export type Point = { x: number; y: number };

function cardHeight(table: DiagramTable): number {
  return HEADER_HEIGHT + table.columns.length * ROW_HEIGHT + CARD_PADDING;
}

type Cluster = {
  name: string;
  tables: DiagramTable[];
  width: number;
  height: number;
  // local table offsets relative to cluster top-left
  offsets: Map<string, Point>;
};

function fkDegree(data: DiagramData): Map<string, number> {
  const degree = new Map<string, number>();
  for (const ref of data.refs) {
    degree.set(ref.fromTable, (degree.get(ref.fromTable) ?? 0) + 1);
    degree.set(ref.toTable, (degree.get(ref.toTable) ?? 0) + 1);
  }
  return degree;
}

function groupOfTable(data: DiagramData): Map<string, string> {
  const map = new Map<string, string>();
  for (const table of data.tables) {
    map.set(table.id, table.group ?? UNGROUPED);
  }
  return map;
}

/** Inter-group FK weights as a symmetric adjacency map. */
function groupWeights(
  data: DiagramData,
  groupOf: Map<string, string>,
): Map<string, Map<string, number>> {
  const weights = new Map<string, Map<string, number>>();
  const add = (a: string, b: string) => {
    const row = weights.get(a) ?? new Map<string, number>();
    row.set(b, (row.get(b) ?? 0) + 1);
    weights.set(a, row);
  };
  for (const ref of data.refs) {
    const a = groupOf.get(ref.fromTable);
    const b = groupOf.get(ref.toTable);
    if (!a || !b || a === b) {
      continue;
    }
    add(a, b);
    add(b, a);
  }
  return weights;
}

/** Greedy connectivity seriation: returns group names in placement order. */
function orderGroups(
  groupNames: string[],
  sizes: Map<string, number>,
  weights: Map<string, Map<string, number>>,
): string[] {
  const totalWeight = (g: string): number => {
    let sum = 0;
    for (const w of weights.get(g)?.values() ?? []) {
      sum += w;
    }
    return sum;
  };

  const remaining = new Set(groupNames);
  const ordered: string[] = [];

  // Seed: most connected group; tie-break by size then name for determinism.
  const seed = [...remaining].sort((a, b) => {
    const d = totalWeight(b) - totalWeight(a);
    if (d !== 0) return d;
    const s = (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0);
    if (s !== 0) return s;
    return a.localeCompare(b);
  })[0];

  if (seed === undefined) {
    return ordered;
  }
  ordered.push(seed);
  remaining.delete(seed);

  while (remaining.size > 0) {
    let best: string | undefined;
    let bestScore = -1;
    let bestTotal = -1;
    for (const candidate of remaining) {
      let score = 0;
      for (const placed of ordered) {
        score += weights.get(candidate)?.get(placed) ?? 0;
      }
      const total = totalWeight(candidate);
      if (
        score > bestScore ||
        (score === bestScore && total > bestTotal) ||
        (score === bestScore &&
          total === bestTotal &&
          best !== undefined &&
          candidate.localeCompare(best) < 0)
      ) {
        best = candidate;
        bestScore = score;
        bestTotal = total;
      }
    }
    if (best === undefined) {
      break;
    }
    ordered.push(best);
    remaining.delete(best);
  }

  return ordered;
}

/** Build a cluster: tables in a grid sorted by FK degree (hub first). */
function buildCluster(
  name: string,
  tables: DiagramTable[],
  degree: Map<string, number>,
): Cluster {
  const sorted = [...tables].sort((a, b) => {
    const d = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
    if (d !== 0) return d;
    const c = b.columns.length - a.columns.length;
    if (c !== 0) return c;
    return a.name.localeCompare(b.name);
  });

  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  const rows = Math.ceil(sorted.length / cols);

  // Per-row height = tallest card in that row.
  const rowHeights: number[] = new Array(rows).fill(0);
  sorted.forEach((table, index) => {
    const row = Math.floor(index / cols);
    rowHeights[row] = Math.max(rowHeights[row], cardHeight(table));
  });
  const rowTops: number[] = [];
  let acc = GROUP_PADDING;
  for (let r = 0; r < rows; r += 1) {
    rowTops.push(acc);
    acc += rowHeights[r] + TABLE_GAP_Y;
  }

  const offsets = new Map<string, Point>();
  sorted.forEach((table, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    offsets.set(table.id, {
      x: GROUP_PADDING + col * (CARD_WIDTH + TABLE_GAP_X),
      y: rowTops[row],
    });
  });

  const usedCols = Math.min(cols, sorted.length);
  const width = GROUP_PADDING * 2 + usedCols * CARD_WIDTH + (usedCols - 1) * TABLE_GAP_X;
  const height = acc - TABLE_GAP_Y + GROUP_PADDING;

  return { name, tables: sorted, width, height, offsets };
}

/**
 * Compute absolute positions for every table. Pure & deterministic.
 * Returns a map of tableId -> {x, y}.
 */
export function computeAutoLayout(data: DiagramData): Map<string, Point> {
  const result = new Map<string, Point>();
  if (data.tables.length === 0) {
    return result;
  }

  const degree = fkDegree(data);
  const groupOf = groupOfTable(data);

  // Group tables.
  const membersByGroup = new Map<string, DiagramTable[]>();
  for (const table of data.tables) {
    const g = table.group ?? UNGROUPED;
    const list = membersByGroup.get(g) ?? [];
    list.push(table);
    membersByGroup.set(g, list);
  }

  const groupNames = [...membersByGroup.keys()];
  const sizes = new Map(groupNames.map((g) => [g, membersByGroup.get(g)?.length ?? 0]));
  const weights = groupWeights(data, groupOf);
  const order = orderGroups(groupNames, sizes, weights);

  // Build clusters in placement order.
  const clusters = order.map((name) =>
    buildCluster(name, membersByGroup.get(name) ?? [], degree),
  );

  // Place clusters on a grid with snake row direction.
  const gridCols = Math.max(1, Math.ceil(Math.sqrt(clusters.length)));
  const gridRows = Math.ceil(clusters.length / gridCols);

  // Column widths and row heights of the cluster grid.
  const colWidths: number[] = new Array(gridCols).fill(0);
  const rowHeights: number[] = new Array(gridRows).fill(0);
  clusters.forEach((cluster, index) => {
    const row = Math.floor(index / gridCols);
    let col = index % gridCols;
    if (row % 2 === 1) {
      col = gridCols - 1 - col; // snake
    }
    colWidths[col] = Math.max(colWidths[col], cluster.width);
    rowHeights[row] = Math.max(rowHeights[row], cluster.height);
  });

  const colX: number[] = [];
  let ax = 0;
  for (let c = 0; c < gridCols; c += 1) {
    colX.push(ax);
    ax += colWidths[c] + GROUP_GAP_X;
  }
  const rowY: number[] = [];
  let ay = 0;
  for (let r = 0; r < gridRows; r += 1) {
    rowY.push(ay);
    ay += rowHeights[r] + GROUP_GAP_Y;
  }

  clusters.forEach((cluster, index) => {
    const row = Math.floor(index / gridCols);
    let col = index % gridCols;
    if (row % 2 === 1) {
      col = gridCols - 1 - col;
    }
    const baseX = colX[col];
    const baseY = rowY[row];
    for (const table of cluster.tables) {
      const offset = cluster.offsets.get(table.id);
      if (!offset) continue;
      result.set(table.id, { x: Math.round(baseX + offset.x), y: Math.round(baseY + offset.y) });
    }
  });

  return result;
}
