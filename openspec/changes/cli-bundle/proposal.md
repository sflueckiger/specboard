## Why

Running Specboard currently requires cloning the repo and running `bun run start` from that directory. Users should be able to run it from anywhere with a single command (`specboard` or `bunx specboard`).

## What Changes

- Add `bin` field to `package.json` pointing to executable entry script
- Create CLI entry script (`bin/specboard.ts` or `cli.ts`) with:
  - Shebang for direct execution (`#!/usr/bin/env bun`)
  - `--open` flag to launch browser after starting
  - `--port` flag to specify custom port (default: 3456)
  - Positional argument for root path (optional, uses cwd if not provided)
- Add `files` field to `package.json` to control what gets published
- Add `type: "module"` if needed for ESM compatibility
- Update README.md with:
  - Installation options (bunx, npx, global install)
  - CLI usage and available flags
  - Examples for common use cases

## Capabilities

### New Capabilities

- `cli`: Command-line interface for starting Specboard from anywhere, supporting flags for port, auto-open browser, and root path configuration

### Modified Capabilities

None - server behavior remains unchanged, CLI is a thin wrapper.

## Impact

- **New files**: `cli.ts` (or `bin/specboard.ts`)
- **Modified files**: `package.json` (bin, files, type fields), `README.md`
- **Dependencies**: None new - uses Bun's built-in arg parsing
- **Publishing**: Package must be published to npm registry
- **Usage after publish**:
  - `bunx specboard` / `npx specboard` - run without install
  - `bun install -g specboard` / `npm install -g specboard` - install globally, then run `specboard`
