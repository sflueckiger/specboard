# Changelog

All notable changes to Specboard are documented in this file.

## [1.2.0] - 2026-07-17

### Added

- **Automatic port fall-forward**: if the requested port (default 3456) is already in use, Specboard now tries the next port instead of crashing, and reports the port it actually bound.

### Changed

- **Runs on Node.js** — the backend was ported off Bun-only APIs (`Bun.serve`, `Bun.file`, `Bun.write`, `Bun.spawn`, `Bun.argv`, `import.meta.dir`/`import.meta.main`) to the Node.js standard library (`node:http` with a Web `Request`/`Response` adapter, `fs/promises`, `child_process`). Specboard now runs on Node.js 18+ **and** Bun.
- The published package now ships compiled JavaScript (`dist/cli.js`, built via `bun run build`) instead of raw TypeScript, with a `node` shebang.

### Fixed

- **`npx @sflueckiger/specboard` no longer requires Bun** ([#1](https://github.com/sflueckiger/specboard/issues/1)) — running via `npx` on a machine without Bun failed with `'"bun"' is not recognized` on Windows. It now launches under plain Node.js.

### Removed

- Dropped the accidental self-dependency on `@sflueckiger/specboard` from `dependencies`.

## [1.1.2] - 2026-03-23

### Changed

- Updated the README screenshot.

## [1.1.1] - 2026-03-02

### Added

- **Feature Deduplication**: When the same feature exists in multiple worktrees, Specboard now intelligently displays only the most relevant instance using a three-tier priority system:
  1. **Artifact count** - Shows the instance with more completed artifacts (proposal, design, specs, tasks)
  2. **Task completion** - If tied on artifacts, shows the instance with more completed subtasks
  3. **Workspace isolation** - If still tied, prefers the instance that is the only feature in its worktree

### Fixed

- **Manual subtask detection**: Extended pattern matching to recognize additional prefixes like "Manual verification:", "Manual test:", and "Manual check:" (previously only "Manual QA" and "(manual)" were detected)
- **Task counting bug**: Fixed critical bug where completed task counts were always showing as 0, preventing proper feature deduplication (was checking `s.done` instead of `s.completed`)

### Changed

- Deduplication applies to both Live view (swimlanes) and Features view (cards) for consistent experience
- Features now show the worktree name of the canonical instance being displayed

## [1.1.0] - 2026-03-02

### Added

#### CLI Support
- Run Specboard from anywhere with `bunx @sflueckiger/specboard` or `npx @sflueckiger/specboard`
- Global install support: `bun install -g @sflueckiger/specboard` then run `specboard`
- CLI flags: `--port <number>`, `--open` (auto-open browser), `--help`, `--version`
- Positional argument for root path: `specboard /path/to/workspace`

#### Single-Worktree Mode
- Auto-detect directory structure on startup (workspace vs single-project)
- Support standalone projects with `openspec/changes/` directly in root
- Support sibling projects: `root/{project}/openspec/changes/`
- Simplified UI when only one repository exists (auto-select, hide dropdown)

#### Recent Directories
- New "Recent" section in sidebar below Features navigation
- Quick-switch to previously visited directories with one click
- Persists up to 5 recent directories in localStorage
- Shows directory basename with full path tooltip on hover

#### Archive Display
- View archived features in the Features tab (below a separator)
- "Show Archive" toggle in Live view header
- Archived swimlanes display with "Archived" badge
- Full artifact access for archived features

### Changed

- Refactored server to export `startServer(options)` for programmatic use
- Path changes now update the view directly without manual refresh

## [1.0.0] - 2026-03-01

### Added

- Initial release
- Real-time OpenSpec progress monitoring via SSE
- Kanban-style task visualization (Todo, In Progress, Done)
- Feature detail view with artifact tabs (Proposal, Specs, Design, Plan)
- Interactive Manual QA subtask toggling
- Directory browser for path selection
- Multi-repository and multi-worktree support
- Action buttons to open in Finder, VS Code, or Terminal
