import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { parseInstruction } from './ai/instructionParser';
import {
  getWorkspaceRoot,
  getSettings,
  readDbdiagram,
  resolveLayoutPath,
  writeDbdiagram,
} from './io/dbdiagramStore';
import { arrangeGroupGrid, moveGroup, packAllGroups } from './layout/groupOps';
import { cleanupInvalidReferencePaths, validateDbdiagram } from './layout/validate';
import type { DbdiagramFile } from './model/types';

let layoutPreviewPanel: vscode.WebviewPanel | undefined;

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createLayoutPreviewHtml(payload: DbdiagramFile, title: string): string {
  const positions = payload.defaultView.tablePositions;
  if (positions.length === 0) {
    return `<!doctype html>
<html lang="en">
<body style="font-family: sans-serif; padding: 16px;">
  <h2>ERD Layout Preview</h2>
  <p>No table positions found in this .dbdiagram file.</p>
</body>
</html>`;
  }

  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const maxX = Math.max(...positions.map((p) => p.x));
  const maxY = Math.max(...positions.map((p) => p.y));

  const width = Math.max(800, Math.ceil((maxX - minX + 420) * 0.38));
  const height = Math.max(520, Math.ceil((maxY - minY + 280) * 0.38));

  const boxes = positions
    .map((pos) => {
      const left = Math.round((pos.x - minX + 40) * 0.38);
      const top = Math.round((pos.y - minY + 30) * 0.38);
      return `<div class="tbl" style="left:${left}px;top:${top}px">${escapeHtml(pos.name)}</div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #0f1115;
      color: #d7dce3;
    }
    .head {
      padding: 10px 14px;
      border-bottom: 1px solid #2a3240;
      background: #141923;
      font-size: 12px;
      color: #9fb0c7;
    }
    .canvas-wrap {
      padding: 12px;
      overflow: auto;
      height: calc(100vh - 46px);
    }
    .canvas {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      background-image:
        linear-gradient(#1f2530 1px, transparent 1px),
        linear-gradient(90deg, #1f2530 1px, transparent 1px);
      background-size: 24px 24px;
      border: 1px solid #2a3240;
      border-radius: 8px;
    }
    .tbl {
      position: absolute;
      min-width: 124px;
      padding: 8px 10px;
      background: #1a2330;
      color: #e8f0ff;
      border: 1px solid #39639d;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="head">ERD Layout Preview | ${escapeHtml(title)} | tables=${positions.length}</div>
  <div class="canvas-wrap">
    <div class="canvas">${boxes}</div>
  </div>
</body>
</html>`;
}

async function renderLayoutPreview(): Promise<void> {
  if (!layoutPreviewPanel) {
    return;
  }

  const settings = getSettings();
  const filePath = resolveLayoutPath(settings);
  const payload = await readDbdiagram(filePath);
  const title = path.relative(getWorkspaceRoot(), filePath);
  layoutPreviewPanel.webview.html = createLayoutPreviewHtml(payload, title);
}

async function openLayoutPreview(): Promise<void> {
  if (!layoutPreviewPanel) {
    layoutPreviewPanel = vscode.window.createWebviewPanel(
      'erdLayout.layoutPreview',
      'ERD Layout: Layout Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
      },
    );

    layoutPreviewPanel.onDidDispose(() => {
      layoutPreviewPanel = undefined;
    });
  } else {
    layoutPreviewPanel.reveal(vscode.ViewColumn.Beside, true);
  }

  await renderLayoutPreview();
}

async function refreshDbmlPreview(settings = getSettings()): Promise<void> {
  const dbmlPath = path.resolve(getWorkspaceRoot(), settings.dbmlPath);
  const target = vscode.Uri.file(dbmlPath);
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
  await vscode.commands.executeCommand('dbdiagram-vscode.showPreview');
}

async function touchDbmlFile(settings = getSettings()): Promise<void> {
  const dbmlPath = path.resolve(getWorkspaceRoot(), settings.dbmlPath);
  const content = await fs.readFile(dbmlPath, 'utf8');
  await fs.writeFile(dbmlPath, content, 'utf8');
}

async function refreshDbmlAfterLayoutChange(settings = getSettings()): Promise<void> {
  await renderLayoutPreview();

  if (settings.refreshDbmlPreviewByTouch) {
    try {
      await touchDbmlFile(settings);
      return;
    } catch {
      // Fallback to reopen preview when touch strategy fails.
    }
  }

  if (settings.autoOpenDbmlPreviewOnLayoutSave) {
    await openDbmlPreview();
  }
}

async function openDbmlPreview(): Promise<void> {
  try {
    await refreshDbmlPreview();
  } catch {
    throw new Error(
      'Failed to open DBML preview. Ensure dbdiagram extension is installed and erdLayout.dbmlPath is correct.',
    );
  }
}

function isLayoutDocument(document: vscode.TextDocument, settings = getSettings()): boolean {
  const layoutPath = resolveLayoutPath(settings);
  return path.normalize(document.uri.fsPath) === path.normalize(layoutPath);
}

async function openConfig(): Promise<void> {
  const settings = getSettings();
  const target = vscode.Uri.file(resolveLayoutPath(settings));
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function validate(): Promise<void> {
  const settings = getSettings();
  const filePath = resolveLayoutPath(settings);
  const payload = await readDbdiagram(filePath);
  const result = validateDbdiagram(payload);

  if (result.warnings.length === 0) {
    void vscode.window.showInformationMessage('ERD Layout: validation passed.');
    return;
  }

  const preview = result.warnings.slice(0, 10).join('\n');
  const more = result.warnings.length > 10 ? `\n...and ${result.warnings.length - 10} more` : '';
  void vscode.window.showWarningMessage(
    `ERD Layout: ${result.warnings.length} warning(s) found.\n${preview}${more}`,
  );
}

async function moveGroupCommand(): Promise<void> {
  const settings = getSettings();
  const groupName = await vscode.window.showInputBox({ prompt: 'Group name' });
  if (!groupName) {
    return;
  }

  const dxRaw = await vscode.window.showInputBox({ prompt: 'dx (number)', value: '100' });
  if (!dxRaw) {
    return;
  }

  const dyRaw = await vscode.window.showInputBox({ prompt: 'dy (number)', value: '0' });
  if (!dyRaw) {
    return;
  }

  const dx = Number(dxRaw);
  const dy = Number(dyRaw);
  if (Number.isNaN(dx) || Number.isNaN(dy)) {
    throw new Error('dx and dy must be numbers.');
  }

  const filePath = resolveLayoutPath(settings);
  const payload = await readDbdiagram(filePath);
  const changed = moveGroup(payload, groupName, dx, dy, settings.pinnedTables);
  await writeDbdiagram(filePath, payload);
  await refreshDbmlAfterLayoutChange(settings);
  void vscode.window.showInformationMessage(
    `ERD Layout: moved ${changed} table(s) in group ${groupName}.`,
  );
}

async function arrangeGroupGridCommand(): Promise<void> {
  const settings = getSettings();
  const groupName = await vscode.window.showInputBox({ prompt: 'Group name' });
  if (!groupName) {
    return;
  }

  const columnsRaw = await vscode.window.showInputBox({ prompt: 'Columns', value: '2' });
  if (!columnsRaw) {
    return;
  }

  const columns = Number(columnsRaw);
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error('Columns must be a positive integer.');
  }

  const filePath = resolveLayoutPath(settings);
  const payload = await readDbdiagram(filePath);
  const changed = arrangeGroupGrid(
    payload,
    groupName,
    columns,
    settings.defaultGapX,
    settings.defaultGapY,
    settings.pinnedTables,
  );
  await writeDbdiagram(filePath, payload);
  await refreshDbmlAfterLayoutChange(settings);
  void vscode.window.showInformationMessage(
    `ERD Layout: arranged ${changed} table(s) in group ${groupName}.`,
  );
}

async function packAllCommand(): Promise<void> {
  const settings = getSettings();
  const filePath = resolveLayoutPath(settings);
  const payload = await readDbdiagram(filePath);
  const changed = packAllGroups(payload, settings.pinnedTables);
  await writeDbdiagram(filePath, payload);
  await refreshDbmlAfterLayoutChange(settings);
  void vscode.window.showInformationMessage(`ERD Layout: packed ${changed} table(s).`);
}

async function applyInstructionCommand(): Promise<void> {
  const settings = getSettings();
  const raw = await vscode.window.showInputBox({
    prompt: 'Instruction JSON or one-line natural language',
    placeHolder: '例: novels を 右に 400、下に 120 移動',
    ignoreFocusOut: true,
  });
  if (!raw) {
    return;
  }

  const filePath = resolveLayoutPath(settings);
  const payload = await readDbdiagram(filePath);
  const instruction = parseInstruction(raw);

  let touched = 0;
  for (const op of instruction.operations) {
    if (op.type === 'moveGroup') {
      touched += moveGroup(payload, op.group, op.dx, op.dy, settings.pinnedTables);
    } else if (op.type === 'arrangeGroupGrid') {
      touched += arrangeGroupGrid(
        payload,
        op.group,
        op.columns,
        op.gapX ?? settings.defaultGapX,
        op.gapY ?? settings.defaultGapY,
        settings.pinnedTables,
      );
    } else if (op.type === 'packAll') {
      touched += packAllGroups(payload, settings.pinnedTables);
    }
  }

  const shouldCleanup =
    instruction.options?.cleanupReferencePaths ?? settings.cleanupReferencePathsOnApply;
  let cleaned = 0;
  if (shouldCleanup) {
    cleaned = cleanupInvalidReferencePaths(payload);
  }

  await writeDbdiagram(filePath, payload);
  await refreshDbmlAfterLayoutChange(settings);
  void vscode.window.showInformationMessage(
    `ERD Layout: applied instruction. touched=${touched}, cleanedRefs=${cleaned}`,
  );
}

function register(
  context: vscode.ExtensionContext,
  command: string,
  handler: () => Promise<void>,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(command, async () => {
      try {
        await handler();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`ERD Layout: ${message}`);
      }
    }),
  );
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const settings = getSettings();
      if (!isLayoutDocument(document, settings)) {
        return;
      }

      try {
        await renderLayoutPreview();
        await refreshDbmlAfterLayoutChange(settings);
      } catch {
        // Non-blocking: save should still succeed even if preview cannot be refreshed.
      }
    }),
  );

  register(context, 'erd-layout.openConfig', openConfig);
  register(context, 'erd-layout.openLayoutPreview', openLayoutPreview);
  register(context, 'erd-layout.openDbmlPreview', openDbmlPreview);
  register(context, 'erd-layout.validate', validate);
  register(context, 'erd-layout.moveGroup', moveGroupCommand);
  register(context, 'erd-layout.arrangeGroupGrid', arrangeGroupGridCommand);
  register(context, 'erd-layout.packAll', packAllCommand);
  register(context, 'erd-layout.applyInstruction', applyInstructionCommand);
}

export function deactivate(): void {
  // no-op
}
