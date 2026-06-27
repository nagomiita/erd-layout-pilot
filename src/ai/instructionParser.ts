import { InstructionPayload, Operation } from '../model/types';

function parseNaturalLanguage(line: string): Operation | null {
  const normalized = line.trim();

  const moveMatch = normalized.match(/^(.+)\s+を\s+右に\s*(-?\d+)\s*、?\s*下に\s*(-?\d+)\s*移動$/);
  if (moveMatch) {
    return {
      type: 'moveGroup',
      group: moveMatch[1].trim(),
      dx: Number(moveMatch[2]),
      dy: Number(moveMatch[3]),
    };
  }

  const gridMatch = normalized.match(/^(.+)\s+を\s*(\d+)\s*列で並べ直して?$/);
  if (gridMatch) {
    return {
      type: 'arrangeGroupGrid',
      group: gridMatch[1].trim(),
      columns: Number(gridMatch[2]),
    };
  }

  if (normalized === '全体を詰めて' || normalized.toLowerCase() === 'pack all') {
    return {
      type: 'packAll',
    };
  }

  return null;
}

export function parseInstruction(input: string): InstructionPayload {
  const trimmed = input.trim();

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as InstructionPayload;
    if (!Array.isArray(parsed.operations)) {
      throw new Error('Invalid instruction JSON: operations is required.');
    }
    return parsed;
  }

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const operations: Operation[] = [];
  for (const line of lines) {
    const op = parseNaturalLanguage(line);
    if (!op) {
      throw new Error(`Unsupported instruction: ${line}`);
    }
    operations.push(op);
  }

  if (operations.length === 0) {
    throw new Error('No operations found in instruction.');
  }

  return { operations };
}
