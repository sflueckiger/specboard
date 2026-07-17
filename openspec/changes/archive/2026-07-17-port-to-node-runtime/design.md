## Context

Specboard's backend (`server.ts`) and CLI (`cli.ts`) are TypeScript executed directly by Bun. The code uses Bun-only globals and cannot run on Node.js, yet the package is published to npm where `npx` invokes it under Node. Issue #1 reports the resulting failure on Windows (`'"bun"' is not recognized`). The frontend (`public/`) is runtime-agnostic vanilla JS and is unaffected.

Bun-specific surface to replace (grounded in the current source):

| Bun API | Location(s) | Node replacement |
| --- | --- | --- |
| `Bun.serve` | `server.ts:592` | `http.createServer` + Web↔Node adapter |
| `Bun.file(...).json()` | `cli.ts:11` | `JSON.parse(await readFile(...,'utf8'))` |
| `Bun.file` / `.exists()` / `new Response(file)` | `server.ts:799-801` | `fs.existsSync`/`stat` + `createReadStream` |
| `Bun.write` | `server.ts:244` | `fs/promises.writeFile` |
| `Bun.spawn` | `server.ts:656,670,686,688,690,832,834,836` | `child_process.spawn(..., { detached, stdio:'ignore' }).unref()` |
| `Bun.argv` | `cli.ts:17`, `server.ts:850` | `process.argv` (slice offset differs — see Decisions) |
| `import.meta.dir` | `server.ts:796` | `fileURLToPath(import.meta.url)` + `dirname` |
| `import.meta.main` | `server.ts:849` | compare `process.argv[1]` to module path |

A key constraint surfaced during exploration: Node cannot execute `.ts` directly on the targeted versions (native stripping is stable only in Node 23.6+). The chosen resolution (see proposal) is a **build step** that emits `dist/*.js`.

## Goals / Non-Goals

**Goals:**
- Specboard launches via `npx @sflueckiger/specboard` on Node 18+ across macOS, Windows, and Linux.
- All existing API endpoints, SSE behavior, static serving, file watching, and open-actions behave identically.
- The package still runs under `bun server.ts` (dev) and `bunx` (Node-native code runs on Bun).
- No new runtime dependencies — Node standard library only.

**Non-Goals:**
- No frontend changes (`public/` untouched).
- No new features, endpoints, or API shape changes.
- No move away from TypeScript in source — TS stays; only the published artifact is compiled JS.
- No standalone-binary distribution (`bun build --compile`) — out of scope.

## Decisions

### D1: `node:http` with a Web-standard Request/Response adapter (not a rewrite)
The existing `Bun.serve({ fetch(req) })` handler already speaks Web-standard `Request`/`Response`/`URL`/`ReadableStream`, all of which Node 18+ exposes as globals (via undici). Rather than rewrite every route to Node's `(req, res)` style, wrap `http.createServer` with a ~40-line adapter that (a) converts the incoming `IncomingMessage` into a Web `Request` (method, URL, headers, and a body stream for POSTs), (b) invokes the unchanged `fetch`-style handler, and (c) writes the returned `Response` back to the `ServerResponse` (status, headers, streamed body).
- **Why**: Minimizes diff and risk in the ~20 routes; the handler logic (`Response.json`, `req.json()`, `url.searchParams`) stays byte-for-byte.
- **Alternative considered**: Rewrite each route to native Node `(req,res)`. Rejected — large mechanical diff, higher regression surface, discards the Web-standard handler that already works.

### D2: SSE streamed directly to the Node `ServerResponse`, bypassing the adapter
`/api/events` returns a long-lived `ReadableStream`. Piping an infinite stream through the generic Response-writer is awkward for keep-alive and flushing. Instead, detect the SSE route and write headers (`text/event-stream`, `no-cache`, `keep-alive`) directly to `res`, then keep a reference to `res` per client. `broadcastUpdate()` changes from `controller.enqueue(encoded)` to `res.write(data)`; client registry becomes a `Set<ServerResponse>`; cleanup happens on `req.on('close')`.
- **Why**: SSE is the one place the Web-stream abstraction fights Node; direct `res.write` is the idiomatic, reliable Node SSE pattern.
- **Alternative considered**: Force the `ReadableStream` through the adapter. Rejected — flushing/backpressure/disconnect semantics are fragile; the internal `clients` set and `broadcastUpdate` are private, so switching them to `ServerResponse` is contained.

### D3: `child_process.spawn` detached + unref for open-actions
Replace each `Bun.spawn([...])` with `spawn(cmd, args, { detached: true, stdio: 'ignore' })` followed by `.unref()`, so opening Finder/Explorer/VS Code/Terminal/browser does not tie the child to the server's lifetime. Argument arrays map directly. The Windows `cmd /c start ...` invocations keep their exact argument vectors.
- **Why**: Matches Bun.spawn's fire-and-forget semantics; `.unref()` prevents the server from hanging on child processes.
- **Alternative considered**: `child_process.exec` with a shell string. Rejected — reintroduces shell-injection risk on the user-supplied `path`; the array form is safer.

### D4: Build with `bun build --target=node` → `dist/`
Use Bun (already the dev toolchain) to bundle `cli.ts` and `server.ts` to `dist/cli.js` and `dist/server.js` targeting Node, preserving ESM. `bin` → `dist/cli.js`; `files` ships `dist/` + `public/`; add `build` and `prepublishOnly` scripts. `dist/` is git-ignored and produced at publish time.
- **Why**: Reuses the toolchain already present; no new dev dependency; one command produces Node-ready JS.
- **Alternatives considered**: (a) `tsc` — needs a tsconfig and emits per-file JS, more config; viable fallback if bun-in-CI is undesirable. (b) `esbuild` — extra dependency. (c) Ship `.ts` and require Node 23.6+ — rejected, contradicts Node 18+ target and the reporting user's environment.

### D5: Entry-point and argv details
- `import.meta.dir` → `dirname(fileURLToPath(import.meta.url))`; static files resolve relative to the compiled `dist/`, so the `public/` path resolution must account for the published layout (`public/` sits beside `dist/` or is copied — verify final relative path).
- `import.meta.main` → guard with a Node-safe check comparing the resolved module path to `process.argv[1]` (works under both Node and Bun).
- `Bun.argv.slice(2)` ↔ `process.argv.slice(2)` — both drop runtime + script; semantics match.

## Risks / Trade-offs

- **Static-file path resolution changes after bundling** → The `public/` directory location relative to `dist/cli.js` differs from `import.meta.dir` today. Mitigation: resolve `public/` explicitly relative to the compiled file and verify the `GET /` + static route serves `index.html` post-build.
- **SSE regression from stream→ServerResponse switch** → Real-time updates could silently break. Mitigation: manual verification — open the UI, edit a `tasks.md`, confirm the board refreshes; confirm disconnect removes the client (no write-after-close errors).
- **Body parsing for POST routes** → The adapter must buffer the request body so `req.json()` works. Mitigation: adapter collects the body stream into the Web `Request` before invoking the handler; test each POST route (`/api/config`, `/api/subtask/toggle`, `/api/open/*`).
- **`bun build` output not truly Node-clean** → Bundler could leave a Bun-ism. Mitigation: smoke-test `node dist/cli.js --version` and `node dist/cli.js <path>` in CI/locally with Bun absent from PATH.
- **Publishing a stale `dist/`** → `prepublishOnly: bun run build` guarantees a fresh build before publish; `dist/` stays git-ignored to avoid drift.
- **Cross-platform open-actions** → Only fully verifiable per-OS. Mitigation: preserve exact argument vectors; the reporter (Windows) can validate the `npx` launch path.

## Migration Plan

1. Port `server.ts` and `cli.ts` API-by-API (adapter, SSE, spawn, fs, argv, entry-point).
2. Add build tooling and update `package.json` (`bin`, `files`, scripts, remove self-dep, `engines`).
3. Verify under Node with Bun off PATH (`node dist/cli.js`), then under `bun`/`bunx`.
4. Publish a patch/minor release; issue #1 reporter validates `npx` on Windows.
- **Rollback**: revert is a single commit; the previously published 1.1.2 remains installable. No data/state migration involved.

## Open Questions

- Should `public/` be copied into `dist/` at build time or referenced from the package root? (Resolve during implementation by fixing the static path relative to `dist/cli.js`.)
- Keep `bun build` as the canonical builder, or prefer `tsc` so publishing works in a Bun-less CI? (Default: `bun build`; revisit if CI constraints require otherwise.)
