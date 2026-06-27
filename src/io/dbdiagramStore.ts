import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { DbdiagramFile, LayoutSettings } from '../model/types';

const DEFAULT_FILE_PATH = 'backend/tenant/autogen/db/erd.dbdiagram';

export function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Workspace folder is not available.');
  }
  return folder.uri.fsPath;
}

export function getSettings(): LayoutSettings {
  const config = vscode.workspace.getConfiguration('erdLayout');
  return {
    filePath: config.get<string>('filePath', DEFAULT_FILE_PATH),
    dbmlPath: config.get<string>('dbmlPath', 'backend/tenant/autogen/db/erd.dbml'),
    defaultGapX: config.get<number>('defaultGapX', 220),
    defaultGapY: config.get<number>('defaultGapY', 140),
    pinnedTables: new Set(config.get<string[]>('pinnedTables', [])),
    cleanupReferencePathsOnApply: config.get<boolean>('cleanupReferencePathsOnApply', true),
    autoOpenDbmlPreviewOnLayoutSave: config.get<boolean>(
      'autoOpenDbmlPreviewOnLayoutSave',
      true,
    ),
  };
}

export function resolveLayoutPath(settings: LayoutSettings): string {
  return path.resolve(getWorkspaceRoot(), settings.filePath);
}

export async function readDbdiagram(filePath: string): Promise<DbdiagramFile> {
  const content = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(content) as DbdiagramFile;
  if (!parsed.defaultView || !Array.isArray(parsed.defaultView.tablePositions)) {
    throw new Error('Invalid dbdiagram format: defaultView.tablePositions is required.');
  }
  return parsed;
}

export async function writeDbdiagram(filePath: string, payload: DbdiagramFile): Promise<void> {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(filePath, serialized, 'utf8');
}
