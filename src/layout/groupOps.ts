import { DbdiagramFile, TablePosition } from '../model/types';

function tableNamesByGroup(payload: DbdiagramFile, groupName: string): string[] {
  const groups = payload.tableGroups ?? [];
  const group = groups.find((item) => item.name === groupName);
  return group?.tables ?? [];
}

function indexPositions(payload: DbdiagramFile): Map<string, TablePosition> {
  return new Map(payload.defaultView.tablePositions.map((item) => [item.name, item]));
}

export function moveGroup(
  payload: DbdiagramFile,
  groupName: string,
  dx: number,
  dy: number,
  pinnedTables: Set<string>,
): number {
  const names = tableNamesByGroup(payload, groupName);
  const byName = indexPositions(payload);
  let moved = 0;

  for (const name of names) {
    if (pinnedTables.has(name)) {
      continue;
    }
    const position = byName.get(name);
    if (!position) {
      continue;
    }
    position.x += dx;
    position.y += dy;
    moved += 1;
  }

  return moved;
}

export function arrangeGroupGrid(
  payload: DbdiagramFile,
  groupName: string,
  columns: number,
  gapX: number,
  gapY: number,
  pinnedTables: Set<string>,
): number {
  if (columns < 1) {
    return 0;
  }

  const names = tableNamesByGroup(payload, groupName).filter((name) => !pinnedTables.has(name));
  if (names.length === 0) {
    return 0;
  }

  const byName = indexPositions(payload);
  const existing = names.map((name) => byName.get(name)).filter((item): item is TablePosition => Boolean(item));
  if (existing.length === 0) {
    return 0;
  }

  const originX = Math.min(...existing.map((item) => item.x));
  const originY = Math.min(...existing.map((item) => item.y));

  let changed = 0;
  names.forEach((name, index) => {
    const position = byName.get(name);
    if (!position) {
      return;
    }
    const row = Math.floor(index / columns);
    const col = index % columns;
    position.x = originX + col * gapX;
    position.y = originY + row * gapY;
    changed += 1;
  });

  return changed;
}

export function packAllGroups(payload: DbdiagramFile, pinnedTables: Set<string>): number {
  const groups = payload.tableGroups ?? [];
  if (groups.length === 0) {
    return 0;
  }

  const byName = indexPositions(payload);
  const groupGapX = 420;
  const groupGapY = 320;
  const columns = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
  let changed = 0;

  groups.forEach((group, idx) => {
    const row = Math.floor(idx / columns);
    const col = idx % columns;
    const anchorX = col * groupGapX;
    const anchorY = row * groupGapY;

    group.tables.forEach((tableName, tableIdx) => {
      if (pinnedTables.has(tableName)) {
        return;
      }
      const pos = byName.get(tableName);
      if (!pos) {
        return;
      }
      const localCol = tableIdx % 2;
      const localRow = Math.floor(tableIdx / 2);
      pos.x = anchorX + localCol * 200;
      pos.y = anchorY + localRow * 120;
      changed += 1;
    });
  });

  return changed;
}
