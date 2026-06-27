import * as vscode from 'vscode';
import * as path from 'node:path';
import { parseInstruction } from './ai/instructionParser';
import {
  getSettings,
  readDbdiagram,
  resolveLayoutPath,
  writeDbdiagram,
} from './io/dbdiagramStore';
import { arrangeGroupGrid, moveGroup, packAllGroups } from './layout/groupOps';
import { cleanupInvalidReferencePaths, validateDbdiagram } from './layout/validate';

async function refreshDbmlPreview(settings = getSettings()): Promise<void> {
  const dbmlPath = path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', settings.dbmlPath);
  const target = vscode.Uri.file(dbmlPath);
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
  await vscode.commands.executeCommand('dbdiagram-vscode.showPreview');
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
  if (settings.autoOpenDbmlPreviewOnLayoutSave) {
    await openDbmlPreview();
  }
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
  if (settings.autoOpenDbmlPreviewOnLayoutSave) {
    await openDbmlPreview();
  }
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
  if (settings.autoOpenDbmlPreviewOnLayoutSave) {
    await openDbmlPreview();
  }
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
  if (settings.autoOpenDbmlPreviewOnLayoutSave) {
    await openDbmlPreview();
  }
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
      if (!settings.autoOpenDbmlPreviewOnLayoutSave || !isLayoutDocument(document, settings)) {
        return;
      }

      try {
        await openDbmlPreview();
      } catch {
        // Non-blocking: save should still succeed even if preview cannot be refreshed.
      }
    }),
  );

  register(context, 'erd-layout.openConfig', openConfig);
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
