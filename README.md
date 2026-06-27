# ERD Layout Pilot (MVP)

This extension renders an interactive ER diagram from a `.dbml` file and lets you
edit the layout (table positions) stored in a `.dbdiagram` sidecar file.
It is designed for AI-assisted layout operations on large ERDs.

## ER Diagram

Open any `.dbml` file and click the **ERD: Open Diagram** button in the editor
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

- ERD: Open Diagram
- ERD Layout: Open Config
- ERD Layout: Open Layout Preview
- ERD Layout: Open DBML Preview
- ERD Layout: Validate Layout JSON
- ERD Layout: Move Group
- ERD Layout: Arrange Group Grid
- ERD Layout: Pack All Groups
- ERD Layout: Apply Instruction

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

`ERD Layout: Open Layout Preview` renders table positions directly from
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
