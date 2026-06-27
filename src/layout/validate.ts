import { DbdiagramFile, ValidationResult } from '../model/types';

export function validateDbdiagram(payload: DbdiagramFile): ValidationResult {
  const warnings: string[] = [];
  const tableNames = new Set(payload.defaultView.tablePositions.map((item) => item.name));

  const groups = payload.tableGroups ?? [];
  for (const group of groups) {
    for (const table of group.tables) {
      if (!tableNames.has(table)) {
        warnings.push(`TableGroup ${group.name} references unknown table: ${table}`);
      }
    }
  }

  const refs = payload.defaultView.referencePaths ?? [];
  let invalidReferenceCount = 0;

  for (const ref of refs) {
    if (!tableNames.has(ref.firstTableName) || !tableNames.has(ref.secondTableName)) {
      invalidReferenceCount += 1;
      warnings.push(
        `Invalid reference path: ${ref.firstTableName} -> ${ref.secondTableName}`,
      );
    }
  }

  return {
    warnings,
    invalidReferenceCount,
  };
}

export function cleanupInvalidReferencePaths(payload: DbdiagramFile): number {
  const refs = payload.defaultView.referencePaths;
  if (!refs) {
    return 0;
  }

  const tableNames = new Set(payload.defaultView.tablePositions.map((item) => item.name));
  const before = refs.length;
  payload.defaultView.referencePaths = refs.filter(
    (ref) => tableNames.has(ref.firstTableName) && tableNames.has(ref.secondTableName),
  );
  return before - payload.defaultView.referencePaths.length;
}
