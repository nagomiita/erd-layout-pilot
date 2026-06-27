import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
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
import { buildDiagramData, removeStaleTables } from './dbml/parser';
import { computeAutoLayout } from './layout/autoLayout';
import { renderDiagramHtml } from './webview/diagramView';
import type { DbdiagramFile } from './model/types';

let layoutPreviewPanel: vscode.WebviewPanel | undefined;
let diagramPanel: vscode.WebviewPanel | undefined;
// Active .dbml the diagram currently tracks (relative to workspace root).
// Kept in memory only so we never write to the user's settings.json.
let activeDbmlPath: string | undefined;

const GITHUB_REPOSITORY = 'nagomiita/erd-layout-pilot';

type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name: string;
  assets: GithubReleaseAsset[];
};

function resolveDbmlPath(settings = getSettings()): string {
  return path.resolve(getWorkspaceRoot(), activeDbmlPath ?? settings.dbmlPath);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'erd-layout-pilot-vscode-extension',
  };
}

async function fetchLatestGithubRelease(): Promise<GithubRelease> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`, {
    headers: githubHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch latest release (${response.status} ${response.statusText}).`);
  }
  return (await response.json()) as GithubRelease;
}

function findVsixAsset(release: GithubRelease): GithubReleaseAsset {
  const asset = release.assets.find((item) => item.name.toLowerCase().endsWith('.vsix'));
  if (!asset) {
    throw new Error(`Latest release ${release.tag_name} does not include a VSIX asset.`);
  }
  return asset;
}

async function installLatestRelease(installedVersion: string): Promise<void> {
  if (vscode.env.uiKind === vscode.UIKind.Web) {
    throw new Error('This command requires the desktop VS Code app.');
  }

  const release = await fetchLatestGithubRelease();
  const releaseVersion = release.tag_name.replace(/^v/, '');
  if (releaseVersion === installedVersion) {
    void vscode.window.showInformationMessage(
      `ERD Layout: already on the latest release (${release.tag_name}).`,
    );
    return;
  }

  const asset = findVsixAsset(release);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'erd-layout-pilot-'));
  const vsixPath = path.join(tempDir, asset.name);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Installing ${release.tag_name}`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: `Downloading ${asset.name}` });
        const response = await fetch(asset.browser_download_url, {
          headers: {
            'User-Agent': 'erd-layout-pilot-vscode-extension',
          },
        });
        if (!response.ok) {
          throw new Error(
            `Failed to download VSIX (${response.status} ${response.statusText}).`,
          );
        }
        const bytes = await response.arrayBuffer();
        await fs.writeFile(vsixPath, Buffer.from(bytes));

        progress.report({ message: 'Installing extension' });
        await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsixPath));
      },
    );

    const reload = await vscode.window.showInformationMessage(
      `ERD Layout: installed ${asset.name}. Reload now?`,
      'Reload',
    );
    if (reload === 'Reload') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

type IncomingPosition = { name: string; schema?: string; x: number; y: number };

function upsertPosition(payload: DbdiagramFile, pos: IncomingPosition): void {
  const schemaName = pos.schema && pos.schema !== 'public' ? pos.schema : undefined;
  const positions = payload.defaultView.tablePositions;
  const existing = positions.find(
    (p) => p.name === pos.name && (p.schemaName ?? undefined) === (schemaName ?? p.schemaName),
  );
  if (existing) {
    existing.x = pos.x;
    existing.y = pos.y;
    return;
  }
  positions.push({ name: pos.name, schemaName: schemaName ?? 'public', x: pos.x, y: pos.y });
}

async function persistPositions(positions: IncomingPosition[]): Promise<void> {
  const settings = getSettings();
  const filePath = resolveLayoutPath(settings);
  const payload = await readDbdiagram(filePath);
  for (const pos of positions) {
    upsertPosition(payload, pos);
  }
  await writeDbdiagram(filePath, payload);
}

async function cleanupStaleTables(): Promise<number> {
  const settings = getSettings();
  const filePath = resolveLayoutPath(settings);
  const dbmlPath = resolveDbmlPath(settings);
  const payload = await readDbdiagram(filePath);
  const removed = await removeStaleTables(dbmlPath, payload);
  if (removed > 0) {
    await writeDbdiagram(filePath, payload);
  }
  return removed;
}

async function applyAutoLayout(): Promise<number> {
  const settings = getSettings();
  const filePath = resolveLayoutPath(settings);
  const dbmlPath = resolveDbmlPath(settings);
  const payload = await readDbdiagram(filePath);
  const data = await buildDiagramData(dbmlPath, payload);
  if (data.parseError) {
    throw new Error(`Cannot auto layout: ${data.parseError}`);
  }
  const positions = computeAutoLayout(data);
  let applied = 0;
  for (const table of data.tables) {
    const point = positions.get(table.id);
    if (!point) continue;
    upsertPosition(payload, {
      name: table.name,
      schema: table.schema,
      x: point.x,
      y: point.y,
    });
    applied += 1;
  }
  await writeDbdiagram(filePath, payload);
  return applied;
}

async function renderDiagram(): Promise<void> {
  if (!diagramPanel) {
    return;
  }
  const settings = getSettings();
  const dbmlPath = resolveDbmlPath(settings);
  const layoutPath = resolveLayoutPath(settings);
  let layout: DbdiagramFile;
  try {
    layout = await readDbdiagram(layoutPath);
  } catch {
    layout = { version: '2.0.0', defaultView: { tablePositions: [] } };
  }
  const data = await buildDiagramData(dbmlPath, layout);
  const title = path.relative(getWorkspaceRoot(), dbmlPath);
  diagramPanel.webview.html = renderDiagramHtml(data, { title, dbmlRelPath: title });
}

async function openDiagram(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  if (uri && uri.fsPath.endsWith('.dbml')) {
    const rel = path.relative(getWorkspaceRoot(), uri.fsPath);
    if (rel && !rel.startsWith('..')) {
      // Remember the opened .dbml in memory only (do not touch settings.json).
      activeDbmlPath = rel;
    }
  }

  if (!diagramPanel) {
    diagramPanel = vscode.window.createWebviewPanel(
      'erdLayout.diagram',
      'ERD Diagram',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    diagramPanel.onDidDispose(() => {
      diagramPanel = undefined;
    });
    diagramPanel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
      try {
        if (message.type === 'moveTable') {
          await persistPositions([message as unknown as IncomingPosition]);
        } else if (message.type === 'moveTables') {
          const positions = (message as unknown as { positions: IncomingPosition[] }).positions;
          await persistPositions(positions);
        } else if (message.type === 'cleanupStale') {
          const removed = await cleanupStaleTables();
          void vscode.window.showInformationMessage(
            `ERD Diagram: removed ${removed} stale table(s) from layout.`,
          );
          await renderDiagram();
        } else if (message.type === 'autoLayout') {
          const applied = await applyAutoLayout();
          void vscode.window.showInformationMessage(
            `ERD Diagram: auto-laid out ${applied} table(s).`,
          );
          await renderDiagram();
        } else if (message.type === 'reload') {
          await renderDiagram();
        } else if (message.type === 'installLatestRelease') {
          await installLatestRelease(String(context.extension.packageJSON.version ?? ''));
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`ERD Diagram: ${text}`);
      }
    });
  } else {
    diagramPanel.reveal(vscode.ViewColumn.Beside, true);
  }

  if (getSettings().autoCleanupStaleTables) {
    try {
      await cleanupStaleTables();
    } catch {
      // Non-blocking: still render even if cleanup fails.
    }
  }

  await renderDiagram();
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
      const dbmlPath = resolveDbmlPath(settings);
      const isDbml = path.normalize(document.uri.fsPath) === path.normalize(dbmlPath);

      if (isDbml) {
        try {
          await renderDiagram();
        } catch {
          // Non-blocking.
        }
        return;
      }

      if (!isLayoutDocument(document, settings)) {
        return;
      }

      try {
        await renderLayoutPreview();
        await renderDiagram();
        await refreshDbmlAfterLayoutChange(settings);
      } catch {
        // Non-blocking: save should still succeed even if preview cannot be refreshed.
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('erd-layout.openDiagram', async (uri?: vscode.Uri) => {
      try {
        await openDiagram(context, uri);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`ERD Diagram: ${message}`);
      }
    }),
  );

  register(context, 'erd-layout.autoLayout', async () => {
    const applied = await applyAutoLayout();
    await renderDiagram();
    await refreshDbmlAfterLayoutChange(getSettings());
    void vscode.window.showInformationMessage(
      `ERD Layout: auto-laid out ${applied} table(s).`,
    );
  });

  register(context, 'erd-layout.openConfig', openConfig);
  register(context, 'erd-layout.openLayoutPreview', openLayoutPreview);
  register(context, 'erd-layout.openDbmlPreview', openDbmlPreview);
  register(context, 'erd-layout.validate', validate);
  register(context, 'erd-layout.moveGroup', moveGroupCommand);
  register(context, 'erd-layout.arrangeGroupGrid', arrangeGroupGridCommand);
  register(context, 'erd-layout.packAll', packAllCommand);
  register(context, 'erd-layout.applyInstruction', applyInstructionCommand);
  register(context, 'erd-layout.installLatestRelease', async () => {
    await installLatestRelease(String(context.extension.packageJSON.version ?? ''));
  });
}

export function deactivate(): void {
  // no-op
}
