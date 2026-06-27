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
  defaultGapX: number;
  defaultGapY: number;
  pinnedTables: Set<string>;
  cleanupReferencePathsOnApply: boolean;
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
