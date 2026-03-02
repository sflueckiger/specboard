## Context

Specboard is a Bun-based server (`server.ts`) with hardcoded configuration (PORT=3456, rootPath defaults to `~/conductor/workspaces`). The `--open` flag already exists but is parsed directly from `Bun.argv`. To make this runnable via `bunx`/`npx` or global install, we need a proper CLI entry point and npm package configuration.

## Goals / Non-Goals

**Goals:**
- Enable `bunx specboard` and `npx specboard` usage without cloning repo
- Enable global install via `bun install -g specboard` / `npm install -g specboard`
- Support `--open`, `--port`, and positional `[path]` arguments
- Maintain backward compatibility with current `bun run start` usage

**Non-Goals:**
- Subcommands (e.g., `specboard serve`, `specboard init`) - single command only
- Configuration file support - CLI args are sufficient
- Daemon/background mode - runs in foreground

## Decisions

### 1. Entry point: `cli.ts` at project root

**Choice**: Create `cli.ts` in the project root, not `bin/specboard.ts`.

**Rationale**:
- Simpler - no nested directory needed
- Consistent with small CLI projects
- `package.json` bin field can point directly to it

**Alternative considered**: `bin/specboard.ts` - adds unnecessary directory structure for a single-file CLI.

### 2. Argument parsing: Bun's built-in `Bun.argv`

**Choice**: Use `Bun.argv` with simple manual parsing.

**Rationale**:
- No external dependencies
- Only 3 arguments to parse (`--open`, `--port`, positional path)
- Keeps the package lightweight

**Alternative considered**: `commander` or `yargs` - overkill for this use case, adds dependencies.

### 3. Server integration: Import and modify `server.ts` exports

**Choice**: Refactor `server.ts` to export a `startServer(options)` function, call it from `cli.ts`.

**Rationale**:
- Clean separation between CLI parsing and server logic
- `server.ts` remains runnable directly (`bun server.ts`) for development
- Testable server function

**Alternative considered**: Spawn `server.ts` as subprocess - loses ability to pass config cleanly.

### 4. Package.json structure

```json
{
  "name": "specboard",
  "bin": {
    "specboard": "./cli.ts"
  },
  "files": [
    "cli.ts",
    "server.ts",
    "public/**/*"
  ],
  "type": "module"
}
```

**Rationale**:
- `bin.specboard` makes both `bunx specboard` and global install work
- `files` ensures only necessary files are published (no openspec/, etc.)
- `type: "module"` required for ESM imports

### 5. CLI interface

```
specboard [path] [options]

Arguments:
  path          Root path to watch (default: current directory)

Options:
  --port, -p    Port to run on (default: 3456)
  --open, -o    Open browser after starting
  --help, -h    Show help
  --version, -v Show version
```

**Rationale**:
- Positional path argument is intuitive (`specboard ~/projects`)
- Current directory as default makes sense for most use cases
- Flags match existing `--open` behavior

## Risks / Trade-offs

**[Bun-only runtime]** → Users must have Bun installed. Mitigation: Document clearly in README, show error message if run with Node.

**[Breaking change to rootPath default]** → Currently defaults to `~/conductor/workspaces`, CLI will default to cwd. Mitigation: Not breaking - direct `bun server.ts` usage unchanged, CLI is new interface.

**[No npx native support]** → `npx specboard` may fail if user doesn't have Bun. Mitigation: Document that `bunx` is preferred; consider adding Node shim later if needed.
