# ERD Layout Pilot (MVP)

This extension renders an interactive ER diagram from a `.dbml` file and lets you
edit the layout (table positions) stored in a `.dbdiagram` sidecar file.
It is designed for AI-assisted layout operations on large ERDs.

## ER Diagram

Open any `.dbml` file and click the **ERD: 図を開く** button in the editor
title bar (or right-click the file in the Explorer). The diagram is parsed from
the `.dbml` with [`@dbml/core`](https://www.npmjs.com/package/@dbml/core) and shows:

- Tables with columns, types, and PK / FK / unique badges
- Relationship edges between columns (solid = `cascade`, dashed = `set null`)
- TableGroup backgrounds and labels
- Pan / zoom / fit, drag-to-reposition (saved to `.dbdiagram`), and auto-arrange
  (Grid / Horizontal / Vertical / Circular)

Table positions are read from and written back to the `.dbdiagram` file
(`erdLayout.filePath`). Saving either the `.dbml` or `.dbdiagram` re-renders the
open diagram.

## Commands

- ERD: 図を開く
- ERD: 自動配置 (グループ)
- ERD Layout: 設定を開く
- ERD Layout: レイアウトプレビューを開く
- ERD Layout: DBMLプレビューを開く
- ERD Layout: レイアウトJSONを検証
- ERD Layout: グループを移動
- ERD Layout: グループをグリッド配置
- ERD Layout: 全グループを詰める
- ERD Layout: 指示を適用
- ERD Layout: 最新リリースへ更新

## Auto Layout (grouped, FK-aware)

`ERD: 自動配置 (グループ)` (title-bar button, command palette, or the
"Grouped (FK-aware)" option of the diagram's **Auto arrange**) computes a
deterministic layout from the parsed `.dbml` and writes it to `.dbdiagram`.
The algorithm is intentionally simple and reproducible:

1. **Cluster by TableGroup** — each `TableGroup` becomes one cluster; ungrouped
   tables share a single `(ungrouped)` cluster.
2. **Order groups by connectivity** — build a weighted group graph from
   inter-group FK counts, then seriate groups into a chain greedily: start from
   the most-connected group, then repeatedly append the group most strongly
   connected to those already placed (ties broken by size, then name). This keeps
   strongly-related groups spatially adjacent.
3. **Place clusters on a grid** — clusters are laid out left-to-right,
   top-to-bottom on a grid of `ceil(sqrt(groupCount))` columns, using
   boustrophedon (snake) row direction so consecutive groups in the chain remain
   neighbours across row breaks.
4. **Within a cluster** — member tables are placed in a grid of `ceil(sqrt(n))`
   columns, ordered by FK degree (hub tables first), so highly-connected tables
   sit at the cluster's top-left.
5. **Sizing** — card heights are derived from column counts; fixed table/group
   gaps and padding keep clusters visually separated.

Because the algorithm is pure and deterministic, re-running it always yields the
same result for a given `.dbml`. Manual drag adjustments afterwards are preserved
until the command is run again.

## Settings

- `erdLayout.filePath`
- `erdLayout.dbmlPath`
- `erdLayout.defaultGapX`
- `erdLayout.defaultGapY`
- `erdLayout.pinnedTables`
- `erdLayout.cleanupReferencePathsOnApply`
- `erdLayout.autoOpenDbmlPreviewOnLayoutSave`
- `erdLayout.refreshDbmlPreviewByTouch`

When `erdLayout.autoOpenDbmlPreviewOnLayoutSave` is enabled (default: true),
the extension re-opens DBML preview after applying ERD Layout commands and when
the layout file is saved.

When `erdLayout.refreshDbmlPreviewByTouch` is enabled (default: true),
the extension first tries to refresh DBML preview in place by touching the DBML
file, then falls back to preview reopen if touch-based refresh fails.

`ERD Layout: レイアウトプレビューを開く` renders table positions directly from
`.dbdiagram` and refreshes the same panel when layout changes are saved.

## Dev

```bash
cd /home/takeshi/erd-layout-pilot
npm install
npm run build
```

Press F5 in VS Code from this extension folder to launch Extension Development Host.

## Separate Repository Operation

This extension can be managed in a repository independent from Eagle.

- Keep this folder as the repository root in a new GitHub repository.
- Preserve command IDs (`erd-layout.*`) to keep user settings compatible.
- Configure CI with `.github/workflows/ci.yml`.
- Configure VSIX release with `.github/workflows/release-vsix.yml`.

`ERD Layout: 最新リリースへ更新` downloads the newest GitHub Release VSIX for this repository and installs it in the current VS Code session.

## Local Release (No Actions Required)

When GitHub Actions is unavailable, publish from local machine:

```bash
cd /home/takeshi/erd-layout-pilot
npm run release:local -- 0.0.3
```

This command performs all of the following:

- Update extension version
- Run check/build/package
- Commit and push version bump
- Create GitHub Release (`v<version>`) and upload VSIX
