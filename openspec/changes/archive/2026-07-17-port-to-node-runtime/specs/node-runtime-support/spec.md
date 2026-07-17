## ADDED Requirements

### Requirement: Launch on Node.js without Bun
Specboard SHALL run on the Node.js runtime version 18 or later with no dependency on the Bun runtime being installed. The published `bin` entry SHALL use a `node` shebang, and no code path in the CLI or server SHALL reference a Bun-only global (`Bun.*`, `import.meta.dir`, `import.meta.main`).

#### Scenario: Start via npx on a machine without Bun
- **WHEN** a user runs `npx @sflueckiger/specboard` on a machine where `bun` is not installed and Node 18+ is available
- **THEN** the server starts and prints its local URL without any `bun`-not-found error

#### Scenario: Start directly with node
- **WHEN** a user runs `node dist/cli.js --version`
- **THEN** the command prints the package version and exits 0

#### Scenario: Windows npx launch
- **WHEN** a Windows user runs `npx @sflueckiger/specboard` in cmd.exe with Node 18+ installed and Bun absent
- **THEN** the server starts successfully and no `'"bun"' is not recognized` error occurs

### Requirement: Automatic port fall-forward
The server SHALL bind to the requested port, and when that port is already in use SHALL try successive ports (up to a bounded number of attempts) until it finds a free one, then report the port it actually bound.

#### Scenario: Requested port is available
- **WHEN** the server starts and the requested port is free
- **THEN** it binds that port and prints a URL containing it

#### Scenario: Requested port is in use
- **WHEN** the requested port is already in use by another process
- **THEN** the server binds the next available port and prints a URL containing the port it actually bound (not the requested one)

### Requirement: Continue to run under Bun
Specboard SHALL remain runnable under the Bun runtime so existing workflows are preserved.

#### Scenario: Dev loop under Bun
- **WHEN** a developer runs `bun server.ts`
- **THEN** the server starts and serves the dashboard as before

#### Scenario: Launch via bunx
- **WHEN** a user runs `bunx @sflueckiger/specboard`
- **THEN** the server starts successfully

### Requirement: Preserve HTTP API behavior on Node
The server SHALL serve every existing REST endpoint and static file with identical request/response behavior when running on Node.js.

#### Scenario: JSON GET endpoint
- **WHEN** a client sends `GET /api/config`
- **THEN** the server responds `200` with JSON containing `rootPath` and `mode`

#### Scenario: JSON POST endpoint with body
- **WHEN** a client sends `POST /api/config` with a JSON body `{ "rootPath": "<valid path>" }`
- **THEN** the server parses the body, updates the root path, and responds `200` with `success: true`

#### Scenario: Invalid POST body
- **WHEN** a client sends `POST /api/subtask/toggle` with a body missing `featurePath` or `subtaskId`
- **THEN** the server responds `400` with a JSON error

#### Scenario: Static file serving
- **WHEN** a client requests `GET /`
- **THEN** the server responds with the contents of `public/index.html`

#### Scenario: Unknown path
- **WHEN** a client requests a path that is neither an API route nor an existing static file
- **THEN** the server responds `404`

### Requirement: Preserve real-time SSE updates on Node
The server SHALL stream real-time update events over `GET /api/events` using Server-Sent Events, delivering an event to every connected client when a watched `.md` file changes, and SHALL release a client when its connection closes.

#### Scenario: Client receives connection and update events
- **WHEN** a client connects to `GET /api/events`
- **THEN** it receives an initial `connected` event, and subsequently receives an `update` event each time a watched `.md` file changes

#### Scenario: Client disconnect cleanup
- **WHEN** a connected SSE client closes its connection
- **THEN** the server removes it from the client set and no error is raised on the next broadcast

### Requirement: Preserve cross-platform open-actions on Node
The server SHALL launch external applications (Finder/Explorer, VS Code, Terminal, and the browser) using Node's process-spawning, with the child detached from the server process, on macOS, Windows, and Linux.

#### Scenario: Open a path in the file manager
- **WHEN** a client sends `POST /api/open/finder` with a valid `path`
- **THEN** the server spawns the platform-appropriate file-manager command and responds `200` with `success: true`

#### Scenario: Open browser on startup
- **WHEN** the server is started with the `--open` flag
- **THEN** it spawns the platform-appropriate command to open the dashboard URL and does not block on the child process

#### Scenario: Failed spawn
- **WHEN** an open-action is requested and the underlying command cannot be launched
- **THEN** the server responds with a `500` JSON error and continues running

### Requirement: Ship compiled JavaScript for publishing
The published npm package SHALL include compiled JavaScript executable by Node 18+, produced by a build step, and SHALL declare an accurate runtime engine. The package SHALL NOT depend on itself.

#### Scenario: Build produces Node-runnable output
- **WHEN** the `build` script is run
- **THEN** it produces `dist/cli.js` and `dist/server.js` that run under Node 18+

#### Scenario: Publish runs a fresh build
- **WHEN** the package is published
- **THEN** `prepublishOnly` runs the build so the shipped `dist/` matches the current source

#### Scenario: Manifest integrity
- **WHEN** the published `package.json` is inspected
- **THEN** `bin` points to the compiled entry, `engines.node` is `>=18`, and there is no self-referential dependency on `@sflueckiger/specboard`
