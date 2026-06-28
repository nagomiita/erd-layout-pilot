export type TablePosition = {
  name: string;
  schemaName?: string;
  x: number;
  y: number;
};

export type TableGroup = {
  name: string;
  tables: string[];
};

export type ReferencePath = {
  firstTableName: string;
  secondTableName: string;
};

export type DbdiagramView = {
  tablePositions: TablePosition[];
  referencePaths?: ReferencePath[];
};

export type DbdiagramFile = {
  version: string;
  defaultView: DbdiagramView;
  views?: Record<string, unknown>;
  tableGroups?: TableGroup[];
  [key: string]: unknown;
};

export type LayoutSettings = {
  filePath: string;
  dbmlPath: string;
  defaultGapX: number;
  defaultGapY: number;
  pinnedTables: Set<string>;
  cleanupReferencePathsOnApply: boolean;
  autoOpenDbmlPreviewOnLayoutSave: boolean;
  refreshDbmlPreviewByTouch: boolean;
  autoCleanupStaleTables: boolean;
};

export type ValidationResult = {
  warnings: string[];
  invalidReferenceCount: number;
};

export type MoveGroupOperation = {
  type: 'moveGroup';
  group: string;
  dx: number;
  dy: number;
};

export type ArrangeGroupGridOperation = {
  type: 'arrangeGroupGrid';
  group: string;
  columns: number;
  gapX?: number;
  gapY?: number;
};

export type PackAllOperation = {
  type: 'packAll';
};

export type Operation = MoveGroupOperation | ArrangeGroupGridOperation | PackAllOperation;

export type InstructionPayload = {
  operations: Operation[];
  options?: {
    cleanupReferencePaths?: boolean;
  };
};

// --- Diagram model (parsed from .dbml, positioned by .dbdiagram) ---

export type DiagramColumn = {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  notNull: boolean;
  unique: boolean;
  note?: string;
};

export type DiagramTable = {
  id: string;
  name: string;
  schema: string;
  note?: string;
  headerColor?: string;
  group?: string;
  columns: DiagramColumn[];
  x: number;
  y: number;
  positioned: boolean;
};

export type DiagramRef = {
  fromTable: string;
  fromColumn: string;
  fromRelation?: string;
  toTable: string;
  toColumn: string;
  toRelation?: string;
  onDelete?: string;
};

export type DiagramGroup = {
  name: string;
  color?: string;
  tables: string[];
};

export type DiagramData = {
  tables: DiagramTable[];
  refs: DiagramRef[];
  groups: DiagramGroup[];
  staleTables: string[];
  parseError?: string;
};
