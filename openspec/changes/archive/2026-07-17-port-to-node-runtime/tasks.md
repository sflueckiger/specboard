## 1. HTTP server adapter (Bun.serve → node:http)

- [x] 1.1 Add a `node:http` server via `http.createServer` in `server.ts`, replacing `Bun.serve`
- [x] 1.2 Write a Request adapter: convert `IncomingMessage` (method, URL, headers, buffered body) into a Web `Request` so the existing `fetch`-style handler and `req.json()` work unchanged
- [x] 1.3 Write a Response writer: map the returned Web `Response` (status, headers, body) onto the Node `ServerResponse`
- [x] 1.4 Update `createServer`/`startServer` to use the new server (drop `ReturnType<typeof Bun.serve>` typing)
- [x] 1.5 Verify each JSON route (`GET/POST /api/config`, `/api/repositories`, `/api/repositories/:name`, `/api/subtask/toggle`, `/api/artifact`, `/api/browse`) returns identical status + JSON
- [x] 1.6 Add automatic port fall-forward: on `EADDRINUSE`, retry successive ports and report the actually-bound port

## 2. SSE endpoint (ReadableStream → ServerResponse)

- [x] 2.1 Change the `clients` set to hold `ServerResponse` objects instead of stream controllers
- [x] 2.2 In the `/api/events` route, write SSE headers directly to the response, send the initial `connected` event, and register the response
- [x] 2.3 Rewrite `broadcastUpdate()` to `res.write(...)` per client, removing dead clients on write error
- [x] 2.4 Remove each client on `req`/socket `close`; ensure no write-after-close errors
- [x] 2.5 Verify: open the UI, edit a `tasks.md`, confirm the board refreshes; confirm disconnect cleanup

## 3. Filesystem APIs (Bun.file / Bun.write)

- [x] 3.1 Replace `Bun.write(tasksPath, ...)` with `fs/promises.writeFile` in `toggleSubtask`
- [x] 3.2 Replace static-file serving (`Bun.file` + `.exists()` + `new Response(file)`) with an existence check plus `createReadStream`/`readFile`, preserving the `GET /` → `index.html` behavior
- [x] 3.3 Replace `Bun.file(package.json).json()` in `cli.ts` with `JSON.parse(await readFile(...,'utf8'))`

## 4. Process spawning (Bun.spawn → child_process.spawn)

- [x] 4.1 Replace all `Bun.spawn([...])` calls (finder/explorer, VS Code, terminal, browser-open) with `child_process.spawn(cmd, args, { detached: true, stdio: 'ignore' })` + `.unref()`
- [x] 4.2 Preserve exact per-platform argument vectors (darwin/win32/linux), including the Windows `cmd /c start ...` forms
- [x] 4.3 Keep try/catch so a failed spawn returns `500` and the server keeps running

## 5. Runtime globals & entry point

- [x] 5.1 Replace `Bun.argv` with `process.argv` in `cli.ts` and `server.ts`
- [x] 5.2 Replace `import.meta.dir` with `dirname(fileURLToPath(import.meta.url))` and fix the `public/` path relative to the compiled `dist/` layout
- [x] 5.3 Replace `import.meta.main` with a Node-safe entry-point check (works under Node and Bun)
- [x] 5.4 Change the `cli` shebang from `#!/usr/bin/env bun` to `#!/usr/bin/env node`

## 6. Build & packaging

- [x] 6.1 Add a `build` script that compiles `cli.ts`/`server.ts` → `dist/cli.js`/`dist/server.js` targeting Node (ESM), via `bun build --target=node`
- [x] 6.2 Add `prepublishOnly` to run the build before publishing
- [x] 6.3 Update `package.json`: `bin` → `dist/cli.js`, `files` → `dist/` + `public/`, keep `engines.node` `>=18`
- [x] 6.4 Remove the accidental self-dependency `"@sflueckiger/specboard"` from `dependencies`
- [x] 6.5 Add `dist/` to `.gitignore`

## 7. Verification

- [x] 7.1 Build, then run `node dist/cli.js --version` and `node dist/cli.js <path>` with `bun` removed from PATH — server starts, no Bun errors
- [x] 7.2 Smoke-test the running server: static UI loads, a JSON endpoint responds, SSE updates fire, an open-action launches
- [x] 7.3 Confirm `bun server.ts` (dev) and `bunx` still work

## 8. Documentation

- [x] 8.1 README **Prerequisites**: change "Bun (v1.0 or later)" to "Node.js 18+ (Bun optional, still supported)"
- [x] 8.2 README **Installation**: update the `npx`/`bunx` notes — `npx` no longer "requires Bun to be installed"; both `npm install -g` and `bun install -g` work
- [x] 8.3 README **Architecture/Development**: correct "Runtime: Bun" and "requires no build step" to reflect Node support and the publish-time build step (dev still needs none)
- [x] 8.4 Update `CLAUDE.md` (repo) Overview/Commands: note Node 18+ support, the `build` script, and the `dist/` publish layout
- [x] 8.5 Sweep source comments for Bun-branded wording (e.g. server.ts header "A Bun-based HTTP server") and update to reflect the Node/Bun dual-runtime reality

## 9. Cleanup & release

- [x] 9.1 Expand `.gitignore` to cover `dist/`, `node_modules/`, and `.DS_Store`
- [x] 9.2 Remove committed/loose `.DS_Store` files from the tree
- [x] 9.3 Reconcile publish include-list: ensure `files`/`.npmignore` ship `dist/` + `public/` (not source `.ts`), and remove the now-redundant path in whichever is superseded
- [x] 9.4 Bump version in `package.json` (patch/minor) and align any version references
- [x] 9.5 Add a `CHANGELOG.md` entry (release notes) documenting the Node runtime support and the `npx`-on-Node fix (link issue #1)
