# ERD Layout Pilot (MVP)

This extension edits ERD layout JSON files (for example, `.dbdiagram`) in a command-driven way.
It is designed for AI-assisted layout operations on large ERDs.

## Commands

- ERD Layout: Open Config
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

When `erdLayout.autoOpenDbmlPreviewOnLayoutSave` is enabled (default: true),
the extension re-opens DBML preview after applying ERD Layout commands and when
the layout file is saved.

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
