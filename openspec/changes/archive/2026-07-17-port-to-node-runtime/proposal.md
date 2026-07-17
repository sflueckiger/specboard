## Why

Specboard is published to npm but is a Bun-native program: its `bin` entry (`cli.ts`) has a `#!/usr/bin/env bun` shebang and both `cli.ts` and `server.ts` rely on Bun-only APIs (`Bun.serve`, `Bun.file`, `Bun.write`, `Bun.spawn`, `Bun.argv`, `import.meta.dir`, `import.meta.main`). A Windows user running `npx @sflueckiger/specboard` hit `'"bun"' is not recognized` ([issue #1](https://github.com/sflueckiger/specboard/issues/1)) because npm's shim tried to exec `bun`, which was not installed. Publishing to npm implies "runs on Node via npx" — a promise the code cannot currently keep.

## What Changes

- **BREAKING (internal)**: Replace all Bun-only runtime APIs with Node.js standard-library equivalents so the server runs on Node 18+:
  - `Bun.serve` → `node:http` server with a small `Request`/`Response` adapter (the existing Web-standard handler is preserved).
  - `Bun.file` / `Bun.write` → `node:fs`/`fs/promises` (`readFile`, `writeFile`, `createReadStream`).
  - `Bun.spawn` → `child_process.spawn` (detached) for open-in-editor/terminal/finder/browser actions.
  - `Bun.argv` → `process.argv`.
  - `import.meta.dir` → path derived from `import.meta.url` via `fileURLToPath`.
  - `import.meta.main` → Node-compatible entry-point detection.
- Preserve the SSE endpoint (`/api/events`) behavior when streaming through a raw Node response (keep-alive, per-client flush, cleanup on disconnect).
- **Add a build step**: compile `cli.ts`/`server.ts` → `dist/*.js` (targeting Node). `bin` points to `dist/cli.js`; the published package ships `dist/`. Dev loop stays `bun server.ts`.
- Change the `cli` shebang from `bun` to `node`.
- Fix `package.json`: remove the accidental self-dependency `"@sflueckiger/specboard"`, point `bin`/`files` at the compiled output, add `build`/`prepublishOnly` scripts, keep `engines.node` truthful (`>=18`).
- Preserve the ability to run under Bun (`bun server.ts`, `bunx`) — Node-native code runs on Bun unchanged.

## Capabilities

### New Capabilities
- `node-runtime-support`: Specboard runs on the Node.js runtime (18+) with no Bun dependency, launches correctly via `npx` on all platforms, ships as compiled JavaScript, and continues to run under Bun. Covers the launch/runtime contract, cross-platform process-spawning for open actions, SSE streaming over Node HTTP, and the build/publish shape.

### Modified Capabilities
<!-- No existing specs in openspec/specs/; behavior of API endpoints and UI is unchanged. -->

## Impact

- **Code**: `server.ts` (13+ Bun call sites, SSE stream, static file serving, watcher unaffected), `cli.ts` (shebang, arg parsing, package.json read).
- **Build/Publish**: new `dist/` output, `build` + `prepublishOnly` scripts, `bin` and `files` updated in `package.json`.
- **Dependencies**: remove self-dependency; no new runtime dependencies (Node stdlib only); a dev-only bundler/compiler (`bun build` or `tsc`/`esbuild`).
- **Runtimes supported**: Node 18+, Bun, `npx`, `bunx`.
- **Frontend** (`public/`): unchanged — this is a behavior-preserving backend/runtime refactor.
- **Docs & release** (in scope): README (Prerequisites/Installation/Architecture no longer say "requires Bun"), repo `CLAUDE.md`, source comments, `CHANGELOG.md` release-notes entry, version bump, and `.gitignore`/publish include-list cleanup so the package published to open source is properly structured and documented.
