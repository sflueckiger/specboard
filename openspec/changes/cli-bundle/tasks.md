## 1. Refactor server.ts for CLI integration

- [x] 1.1 Extract server config into `ServerOptions` interface (port, rootPath, open)
- [x] 1.2 Create `startServer(options: ServerOptions)` exported function
- [x] 1.3 Move startup logic (watcher init, console output, browser open) into startServer
- [x] 1.4 Keep direct execution support: detect if run directly via `import.meta.main`

## 2. Create CLI entry point

- [x] 2.1 Create `cli.ts` with shebang `#!/usr/bin/env bun`
- [x] 2.2 Implement argument parsing for `--port`/`-p`, `--open`/`-o`, `--help`/`-h`, `--version`/`-v`
- [x] 2.3 Parse positional path argument (first non-flag argument)
- [x] 2.4 Implement `--help` output with usage information
- [x] 2.5 Implement `--version` output reading from package.json
- [x] 2.6 Call `startServer()` with parsed options

## 3. Update package.json

- [x] 3.1 Add `"bin": { "specboard": "./cli.ts" }`
- [x] 3.2 Add `"files": ["cli.ts", "server.ts", "public"]`
- [x] 3.3 Add `"type": "module"`
- [x] 3.4 Verify existing scripts still work (`bun run start`, `bun run dev`)

## 4. Update README documentation

- [x] 4.1 Add Installation section with bunx, npx, and global install options
- [x] 4.2 Add CLI Usage section with all flags and examples
- [x] 4.3 Update existing "Commands" section to reference both dev and CLI usage

## 5. Manual QA

- [x] 5.1 Manual QA: Test `bun run start` still works (backward compat)
- [x] 5.2 Manual QA: Test `bun cli.ts` runs correctly
- [x] 5.3 Manual QA: Test `bun cli.ts --help` shows usage
- [x] 5.4 Manual QA: Test `bun cli.ts --version` shows version
- [x] 5.5 Manual QA: Test `bun cli.ts /some/path --port 8080 --open` with all flags
