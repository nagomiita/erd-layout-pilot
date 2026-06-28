import * as fs from 'node:fs/promises';
import { Parser } from '@dbml/core';
import type {
  DbdiagramFile,
  DiagramColumn,
  DiagramData,
  DiagramGroup,
  DiagramRef,
  DiagramTable,
} from '../model/types';

const GRID_GAP_X = 320;
const GRID_GAP_Y = 260;
const GRID_COLUMNS = 6;

function tableId(schema: string, name: string): string {
  return schema && schema !== 'public' ? `${schema}.${name}` : name;
}

type ParsedSchema = {
  tables: ParsedTable[];
  refs: DiagramRef[];
  groups: DiagramGroup[];
};

type ParsedTable = {
  id: string;
  name: string;
  schema: string;
  note?: string;
  headerColor?: string;
  columns: DiagramColumn[];
};

function normalizeNote(note: unknown): string | undefined {
  if (!note) {
    return undefined;
  }
  if (typeof note === 'string') {
    return note;
  }
  if (typeof note === 'object' && note !== null && 'value' in note) {
    const value = (note as { value?: unknown }).value;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function parseDbmlString(source: string): ParsedSchema {
  const parser = new Parser();
  let database: unknown;
  try {
    database = parser.parse(source, 'dbmlv2');
  } catch {
    database = parser.parse(source, 'dbml');
  }

  const schemas = (database as { schemas?: unknown[] }).schemas ?? [];
  const tables: ParsedTable[] = [];
  const refs: DiagramRef[] = [];
  const groups: DiagramGroup[] = [];

  for (const schemaRaw of schemas) {
    const schema = schemaRaw as {
      name?: string;
      tables?: unknown[];
      refs?: unknown[];
      tableGroups?: unknown[];
    };
    const schemaName = schema.name ?? 'public';

    for (const tableRaw of schema.tables ?? []) {
      const table = tableRaw as {
        name: string;
        schema?: { name?: string };
        note?: unknown;
        headerColor?: string;
        fields?: unknown[];
      };
      const tSchema = table.schema?.name ?? schemaName;
      const columns: DiagramColumn[] = (table.fields ?? []).map((fieldRaw) => {
        const field = fieldRaw as {
          name: string;
          type?: { type_name?: string };
          pk?: boolean;
          not_null?: boolean;
          unique?: boolean;
          note?: unknown;
        };
        return {
          name: field.name,
          type: field.type?.type_name ?? '',
          pk: Boolean(field.pk),
          fk: false,
          notNull: Boolean(field.not_null),
          unique: Boolean(field.unique),
          note: normalizeNote(field.note),
        };
      });

      tables.push({
        id: tableId(tSchema, table.name),
        name: table.name,
        schema: tSchema,
        note: normalizeNote(table.note),
        headerColor: table.headerColor,
        columns,
      });
    }

    for (const refRaw of schema.refs ?? []) {
      const ref = refRaw as {
        onDelete?: string;
        endpoints?: Array<{
          schemaName?: string;
          tableName: string;
          fieldNames: string[];
          relation: string;
          fields?: Array<{ not_null?: boolean }>;
        }>;
      };
      const endpoints = ref.endpoints ?? [];
      if (endpoints.length !== 2) {
        continue;
      }
      // relation '*' = many side (child / FK), '1' = one side (parent / PK)
      const many = endpoints.find((e) => e.relation === '*') ?? endpoints[0];
      const one = endpoints.find((e) => e.relation === '1') ?? endpoints.find((e) => e !== many) ?? endpoints[1];
      const fromSchema = many.schemaName ?? schemaName;
      const toSchema = one.schemaName ?? schemaName;
      const manyField = many.fields?.[0] as { not_null?: boolean } | undefined;
      refs.push({
        fromTable: tableId(fromSchema, many.tableName),
        fromColumn: many.fieldNames[0],
        fromRelation: many.relation,
        fromMin: 0,
        toTable: tableId(toSchema, one.tableName),
        toColumn: one.fieldNames[0],
        toRelation: one.relation,
        toMin: manyField?.not_null ? 1 : 0,
        onDelete: ref.onDelete,
      });
    }

    for (const groupRaw of schema.tableGroups ?? []) {
      const group = groupRaw as {
        name: string;
        color?: string;
        tables?: Array<{ name: string; schemaName?: string; schema?: { name?: string } }>;
      };
      groups.push({
        name: group.name,
        color: group.color,
        tables: (group.tables ?? []).map((t) =>
          tableId(t.schemaName ?? t.schema?.name ?? schemaName, t.name),
        ),
      });
    }
  }

  // Mark FK columns based on refs.
  const byId = new Map(tables.map((t) => [t.id, t]));
  for (const ref of refs) {
    const child = byId.get(ref.fromTable);
    const column = child?.columns.find((c) => c.name === ref.fromColumn);
    if (column) {
      column.fk = true;
    }
  }

  return { tables, refs, groups };
}

function positionKey(name: string, schemaName?: string): string {
  return schemaName && schemaName !== 'public' ? `${schemaName}.${name}` : name;
}

/**
 * Remove table positions / referencePaths / tableGroup memberships that refer to
 * tables which no longer exist in the given .dbml. Returns the number of removed
 * table positions. Mutates `layout` in place.
 */
export async function removeStaleTables(
  dbmlPath: string,
  layout: DbdiagramFile,
): Promise<number> {
  const source = await fs.readFile(dbmlPath, 'utf8');
  const parsed = parseDbmlString(source);
  const knownIds = new Set(parsed.tables.map((t) => t.id));
  const knownNames = new Set(parsed.tables.map((t) => t.name));

  const view = layout.defaultView;
  const before = view.tablePositions.length;
  view.tablePositions = view.tablePositions.filter((p) =>
    knownIds.has(positionKey(p.name, p.schemaName)),
  );
  const removed = before - view.tablePositions.length;

  if (Array.isArray(view.referencePaths)) {
    view.referencePaths = view.referencePaths.filter(
      (r) => knownNames.has(r.firstTableName) && knownNames.has(r.secondTableName),
    );
  }

  if (Array.isArray(layout.tableGroups)) {
    for (const group of layout.tableGroups) {
      if (Array.isArray(group.tables)) {
        group.tables = group.tables.filter(
          (name) => knownIds.has(name) || knownNames.has(name),
        );
      }
    }
  }

  return removed;
}

export async function buildDiagramData(
  dbmlPath: string,
  layout: DbdiagramFile,
): Promise<DiagramData> {
  const source = await fs.readFile(dbmlPath, 'utf8');

  let parsed: ParsedSchema;
  try {
    parsed = parseDbmlString(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tables: [], refs: [], groups: [], staleTables: [], parseError: message };
  }

  const groupByTable = new Map<string, string>();
  for (const group of parsed.groups) {
    for (const tableIdValue of group.tables) {
      groupByTable.set(tableIdValue, group.name);
    }
  }

  const positionByKey = new Map<string, { x: number; y: number }>();
  for (const pos of layout.defaultView.tablePositions) {
    positionByKey.set(positionKey(pos.name, pos.schemaName), { x: pos.x, y: pos.y });
  }

  const knownIds = new Set(parsed.tables.map((t) => t.id));
  const staleTables = layout.defaultView.tablePositions
    .map((p) => positionKey(p.name, p.schemaName))
    .filter((key) => !knownIds.has(key));

  let autoIndex = 0;
  const tables: DiagramTable[] = parsed.tables.map((table) => {
    const stored = positionByKey.get(table.id);
    let x: number;
    let y: number;
    let positioned = true;
    if (stored) {
      x = stored.x;
      y = stored.y;
    } else {
      positioned = false;
      x = (autoIndex % GRID_COLUMNS) * GRID_GAP_X;
      y = Math.floor(autoIndex / GRID_COLUMNS) * GRID_GAP_Y;
      autoIndex += 1;
    }
    return {
      ...table,
      group: groupByTable.get(table.id),
      x,
      y,
      positioned,
    };
  });

  return { tables, refs: parsed.refs, groups: parsed.groups, staleTables };
}
