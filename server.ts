/**
 * Specboard Server
 *
 * A Node.js HTTP server (also runs under Bun) that:
 * - Serves the static frontend files
 * - Provides REST API for reading OpenSpec data
 * - Watches for file changes and broadcasts updates via SSE
 * - Supports toggling Manual QA subtask completion
 */

import { watch, existsSync, type FSWatcher } from "fs";
import { readdir, readFile, stat, access, writeFile } from "fs/promises";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir, platform } from "os";
import { spawn } from "child_process";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_PORT = 3456;

/**
 * Resolve the directory containing the frontend assets. Works both in
 * development (server.ts sits beside public/) and when published (dist/server.js
 * sits beside a package-root public/ → ../public).
 */
function resolvePublicDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "public"), join(here, "..", "public")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

const PUBLIC_DIR = resolvePublicDir();

export interface ServerOptions {
  port?: number;
  rootPath?: string;
  open?: boolean;
}

// =============================================================================
// Application State
// =============================================================================

let rootPath = join(homedir(), "conductor", "workspaces");
let watcher: FSWatcher | null = null;
let clients: Set<ServerResponse> = new Set();
let serverInstance: Server | null = null;
let currentMode: "workspace" | "single" = "workspace";

// =============================================================================
// Type Definitions
// =============================================================================

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface TaskCard {
  id: string;
  title: string;
  subtasks: Subtask[];
  status: "todo" | "in_progress" | "done";
}

interface Feature {
  name: string;
  path: string;
  worktree: string;
  worktreePath: string;
  tasks: TaskCard[];
  hasProposal: boolean;
  hasDesign: boolean;
  specs: string[];
  hasPlan: boolean;
  isArchived: boolean;
}

interface Repository {
  name: string;
  path: string;
  worktrees: string[];
}

// =============================================================================
// Task Parsing
// =============================================================================

/**
 * Parse tasks.md content into structured task objects
 * Supports multiple formats:
 * - Format 1: "## 1. Title" headers with "- [x] 1.1 Subtask" checkboxes
 * - Format 2: "1. Title" with "1.1 Subtask" or indented checkboxes
 */
function parseTasks(content: string): TaskCard[] {
  const tasks: TaskCard[] = [];
  const lines = content.split("\n");
  let currentTask: TaskCard | null = null;

  for (const line of lines) {
    // Match header-style top-level task: "## 1. Title" or "# 1. Title"
    const headerMatch = line.match(/^#+\s*(\d+)\.\s+(.+)/);
    if (headerMatch) {
      if (currentTask) {
        currentTask.status = getTaskStatus(currentTask.subtasks);
        tasks.push(currentTask);
      }

      currentTask = {
        id: headerMatch[1],
        title: headerMatch[2].trim(),
        subtasks: [],
        status: "todo",
      };
      continue;
    }

    // Match plain top-level task: "1. Title" (not indented, no checkbox)
    const plainTopMatch = line.match(/^(\d+)\.\s+(?!\d)(?!\[)(.+)/);
    if (plainTopMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      if (currentTask) {
        currentTask.status = getTaskStatus(currentTask.subtasks);
        tasks.push(currentTask);
      }

      currentTask = {
        id: plainTopMatch[1],
        title: plainTopMatch[2].trim(),
        subtasks: [],
        status: "todo",
      };
      continue;
    }

    // Match checkbox subtask with number: "- [x] 1.1 Title"
    const checkboxNumMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(\d+)\.(\d+)\s+(.+)/);
    if (checkboxNumMatch && currentTask) {
      currentTask.subtasks.push({
        id: `${checkboxNumMatch[2]}.${checkboxNumMatch[3]}`,
        title: checkboxNumMatch[4].trim(),
        completed: checkboxNumMatch[1].toLowerCase() === "x",
      });
      continue;
    }

    // Match plain numbered subtask: "1.1 Title" or "1.1 [x] Title"
    const subtaskMatch = line.match(/^(\d+)\.(\d+)\s+(?:\[([ xX])\]\s+)?(.+)/);
    if (subtaskMatch && currentTask) {
      currentTask.subtasks.push({
        id: `${subtaskMatch[1]}.${subtaskMatch[2]}`,
        title: subtaskMatch[4].trim(),
        completed: subtaskMatch[3]?.toLowerCase() === "x",
      });
      continue;
    }

    // Match indented checkbox subtasks (no number): "  - [ ] Title"
    const indentedCheckbox = line.match(/^\s+[-*]\s+\[([ xX])\]\s+(.+)/);
    if (indentedCheckbox && currentTask) {
      currentTask.subtasks.push({
        id: `${currentTask.id}.${currentTask.subtasks.length + 1}`,
        title: indentedCheckbox[2].trim(),
        completed: indentedCheckbox[1].toLowerCase() === "x",
      });
    }
  }

  if (currentTask) {
    currentTask.status = getTaskStatus(currentTask.subtasks);
    tasks.push(currentTask);
  }

  return tasks;
}

/** Determine task status based on subtask completion */
function getTaskStatus(subtasks: Subtask[]): "todo" | "in_progress" | "done" {
  if (subtasks.length === 0) return "todo";
  const completed = subtasks.filter((s) => s.completed).length;
  if (completed === 0) return "todo";
  if (completed === subtasks.length) return "done";
  return "in_progress";
}

// =============================================================================
// File Utilities
// =============================================================================

/** Check if directory exists */
async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** Check if file exists */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Toggle subtask completion status in tasks.md
 * Supports checkbox format: "- [x] 1.1 Title"
 */
async function toggleSubtask(
  featurePath: string,
  subtaskId: string
): Promise<{ success: boolean; completed?: boolean; error?: string }> {
  try {
    const tasksPath = join(featurePath, "tasks.md");

    if (!(await fileExists(tasksPath))) {
      return { success: false, error: "tasks.md not found" };
    }

    const content = await readFile(tasksPath, "utf-8");
    const lines = content.split("\n");
    let found = false;
    let newCompleted = false;

    const updatedLines = lines.map((line) => {
      // Match checkbox subtask: "- [x] 1.1 Title"
      const checkboxNumMatch = line.match(/^([-*]\s+\[)([ xX])(\]\s+)(\d+\.\d+)(\s+.+)/);
      if (checkboxNumMatch && checkboxNumMatch[4] === subtaskId) {
        found = true;
        const currentlyCompleted = checkboxNumMatch[2].toLowerCase() === "x";
        newCompleted = !currentlyCompleted;
        return `${checkboxNumMatch[1]}${newCompleted ? "x" : " "}${checkboxNumMatch[3]}${checkboxNumMatch[4]}${checkboxNumMatch[5]}`;
      }

      // Match plain numbered subtask: "1.1 [x] Title"
      const plainMatch = line.match(/^(\d+\.\d+)(\s+\[)([ xX])(\]\s+.+)/);
      if (plainMatch && plainMatch[1] === subtaskId) {
        found = true;
        const currentlyCompleted = plainMatch[3].toLowerCase() === "x";
        newCompleted = !currentlyCompleted;
        return `${plainMatch[1]}${plainMatch[2]}${newCompleted ? "x" : " "}${plainMatch[4]}`;
      }

      return line;
    });

    if (!found) {
      return { success: false, error: "Subtask not found" };
    }

    await writeFile(tasksPath, updatedLines.join("\n"));
    return { success: true, completed: newCompleted };
  } catch (err) {
    return { success: false, error: `File error: ${err}` };
  }
}

// =============================================================================
// Mode Detection
// =============================================================================

/**
 * Detect whether the root path is a workspace (multi-repo/worktree) or single-worktree structure.
 * Detection order:
 * 1. rootPath/openspec/changes/ - single mode (direct project)
 * 2. rootPath/{child}/openspec/changes/ - single mode (sibling projects)
 * 3. Default - workspace mode (repo/worktree structure)
 */
async function detectMode(path: string): Promise<"workspace" | "single"> {
  // Check if rootPath itself has openspec/changes
  if (await dirExists(join(path, "openspec", "changes"))) {
    return "single";
  }

  // Check immediate children for openspec/changes
  if (!(await dirExists(path))) {
    return "workspace";
  }

  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const childPath = join(path, entry.name, "openspec", "changes");
      if (await dirExists(childPath)) {
        return "single"; // Found at first level = single mode
      }
    }
  }

  // Default to workspace mode (repo/worktree structure)
  return "workspace";
}

// =============================================================================
// Repository Scanning
// =============================================================================

/** Get all repositories from the root path */
async function getRepositories(): Promise<Repository[]> {
  if (currentMode === "single") {
    return getRepositoriesSingleMode();
  }
  return getRepositoriesWorkspaceMode();
}

/** Get repositories in workspace mode (existing behavior) */
async function getRepositoriesWorkspaceMode(): Promise<Repository[]> {
  if (!(await dirExists(rootPath))) {
    return [];
  }

  const entries = await readdir(rootPath, { withFileTypes: true });
  const repos: Repository[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const repoPath = join(rootPath, entry.name);
      const worktreeEntries = await readdir(repoPath, { withFileTypes: true });
      const worktrees = worktreeEntries
        .filter((w) => w.isDirectory() && !w.name.startsWith("."))
        .map((w) => w.name);

      repos.push({
        name: entry.name,
        path: repoPath,
        worktrees,
      });
    }
  }

  return repos;
}

/** Get repositories in single-worktree mode */
async function getRepositoriesSingleMode(): Promise<Repository[]> {
  if (!(await dirExists(rootPath))) {
    return [];
  }

  // Check if rootPath itself has openspec/changes (direct project)
  if (await dirExists(join(rootPath, "openspec", "changes"))) {
    const { basename } = await import("path");
    return [{
      name: basename(rootPath),
      path: rootPath,
      worktrees: ["main"],
    }];
  }

  // Check immediate children for openspec/changes (sibling projects)
  const entries = await readdir(rootPath, { withFileTypes: true });
  const worktrees: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const childPath = join(rootPath, entry.name, "openspec", "changes");
      if (await dirExists(childPath)) {
        worktrees.push(entry.name);
      }
    }
  }

  if (worktrees.length > 0) {
    return [{
      name: "projects",
      path: rootPath,
      worktrees,
    }];
  }

  return [];
}

/** Get all features across all worktrees for a repository */
async function getFeatures(repoName: string): Promise<Feature[]> {
  if (currentMode === "single") {
    return getFeaturesSingleMode(repoName);
  }
  return getFeaturesWorkspaceMode(repoName);
}

/** Get features in workspace mode (existing behavior) */
async function getFeaturesWorkspaceMode(repoName: string): Promise<Feature[]> {
  const repoPath = join(rootPath, repoName);
  const features: Feature[] = [];

  if (!(await dirExists(repoPath))) {
    return features;
  }

  const worktreeEntries = await readdir(repoPath, { withFileTypes: true });

  for (const worktreeEntry of worktreeEntries) {
    if (!worktreeEntry.isDirectory() || worktreeEntry.name.startsWith(".")) {
      continue;
    }

    const worktreeName = worktreeEntry.name;
    const worktreePath = join(repoPath, worktreeName);
    const changesPath = join(worktreePath, "openspec", "changes");

    if (!(await dirExists(changesPath))) {
      continue;
    }

    const entries = await readdir(changesPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "archive") {
        const featurePath = join(changesPath, entry.name);
        const feature = await parseFeature(featurePath, entry.name, worktreeName, worktreePath, false);
        features.push(feature);
      } else if (entry.name === "archive") {
        const archivePath = join(changesPath, "archive");
        const archiveEntries = await readdir(archivePath, { withFileTypes: true });
        for (const archiveEntry of archiveEntries) {
          if (archiveEntry.isDirectory()) {
            const featurePath = join(archivePath, archiveEntry.name);
            const feature = await parseFeature(featurePath, archiveEntry.name, worktreeName, worktreePath, true);
            features.push(feature);
          }
        }
      }
    }
  }

  return features;
}

/** Get features in single-worktree mode */
async function getFeaturesSingleMode(repoName: string): Promise<Feature[]> {
  const features: Feature[] = [];

  // Check if rootPath itself has openspec/changes (direct project)
  const directChangesPath = join(rootPath, "openspec", "changes");
  if (await dirExists(directChangesPath)) {
    const entries = await readdir(directChangesPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "archive") {
        const featurePath = join(directChangesPath, entry.name);
        const feature = await parseFeature(featurePath, entry.name, "main", rootPath, false);
        features.push(feature);
      } else if (entry.name === "archive") {
        const archivePath = join(directChangesPath, "archive");
        if (await dirExists(archivePath)) {
          const archiveEntries = await readdir(archivePath, { withFileTypes: true });
          for (const archiveEntry of archiveEntries) {
            if (archiveEntry.isDirectory()) {
              const featurePath = join(archivePath, archiveEntry.name);
              const feature = await parseFeature(featurePath, archiveEntry.name, "main", rootPath, true);
              features.push(feature);
            }
          }
        }
      }
    }
    return features;
  }

  // Check immediate children for openspec/changes (sibling projects)
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const projectPath = join(rootPath, entry.name);
      const changesPath = join(projectPath, "openspec", "changes");

      if (await dirExists(changesPath)) {
        const changeEntries = await readdir(changesPath, { withFileTypes: true });

        for (const changeEntry of changeEntries) {
          if (changeEntry.isDirectory() && changeEntry.name !== "archive") {
            const featurePath = join(changesPath, changeEntry.name);
            const feature = await parseFeature(featurePath, changeEntry.name, entry.name, projectPath, false);
            features.push(feature);
          } else if (changeEntry.name === "archive") {
            const archivePath = join(changesPath, "archive");
            if (await dirExists(archivePath)) {
              const archiveEntries = await readdir(archivePath, { withFileTypes: true });
              for (const archiveEntry of archiveEntries) {
                if (archiveEntry.isDirectory()) {
                  const featurePath = join(archivePath, archiveEntry.name);
                  const feature = await parseFeature(featurePath, archiveEntry.name, entry.name, projectPath, true);
                  features.push(feature);
                }
              }
            }
          }
        }
      }
    }
  }

  return features;
}

/** Parse a feature directory into a Feature object */
async function parseFeature(
  featurePath: string,
  name: string,
  worktree: string,
  worktreePath: string,
  isArchived: boolean
): Promise<Feature> {
  let tasks: TaskCard[] = [];
  const tasksPath = join(featurePath, "tasks.md");
  const hasPlan = await fileExists(tasksPath);

  if (hasPlan) {
    const content = await readFile(tasksPath, "utf-8");
    tasks = parseTasks(content);
  }

  // Check for specs - either single spec.md or specs/ directory
  let specs: string[] = [];
  const singleSpecPath = join(featurePath, "spec.md");
  const specsDir = join(featurePath, "specs");

  if (await fileExists(singleSpecPath)) {
    specs = ["_single"];
  } else if (await dirExists(specsDir)) {
    const entries = await readdir(specsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const specFile = join(specsDir, entry.name, "spec.md");
        if (await fileExists(specFile)) {
          specs.push(entry.name);
        }
      }
    }
    specs.sort();
  }

  return {
    name,
    path: featurePath,
    worktree,
    worktreePath,
    tasks,
    hasProposal: await fileExists(join(featurePath, "proposal.md")),
    hasDesign: await fileExists(join(featurePath, "design.md")),
    specs,
    hasPlan,
    isArchived,
  };
}

/** Get full data for a repository */
async function getRepositoryData(repoName: string): Promise<Feature[]> {
  return getFeatures(repoName);
}

// =============================================================================
// File Watcher (Real-time Updates)
// =============================================================================

/** Start watching the root path for file changes */
async function startWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  if (!(await dirExists(rootPath))) {
    console.log(`Directory does not exist: ${rootPath}`);
    return;
  }

  try {
    watcher = watch(rootPath, { recursive: true }, (event, filename) => {
      if (filename && (filename.endsWith(".md") || event === "rename")) {
        broadcastUpdate();
      }
    });
    console.log(`Watching: ${rootPath}`);
  } catch (err) {
    console.error("Failed to start watcher:", err);
  }
}

/** Broadcast update event to all SSE clients */
function broadcastUpdate() {
  const data = `data: ${JSON.stringify({ type: "update" })}\n\n`;
  for (const client of clients) {
    try {
      client.write(data);
    } catch {
      clients.delete(client);
    }
  }
}

// =============================================================================
// HTTP Server & API Routes
// =============================================================================

/** Launch an external application detached from the server process. */
function spawnDetached(cmd: string[]) {
  const child = spawn(cmd[0], cmd.slice(1), { detached: true, stdio: "ignore" });
  child.unref();
}

/** Map a file extension to a Content-Type for static file responses. */
function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

/** Convert a Node IncomingMessage into a Web-standard Request (body buffered). */
async function toWebRequest(nodeReq: IncomingMessage): Promise<Request> {
  const url = new URL(nodeReq.url ?? "/", "http://localhost");
  const method = nodeReq.method ?? "GET";

  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeReq.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value != null) {
      headers.set(key, value);
    }
  }

  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of nodeReq) chunks.push(chunk as Buffer);
    if (chunks.length > 0) body = Buffer.concat(chunks);
  }

  return new Request(url, { method, headers, body });
}

/** Write a Web-standard Response back onto a Node ServerResponse. */
async function writeNodeResponse(nodeRes: ServerResponse, response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  nodeRes.writeHead(response.status, headers);
  if (response.body) {
    nodeRes.end(Buffer.from(await response.arrayBuffer()));
  } else {
    nodeRes.end();
  }
}

/** Register an SSE client and stream real-time update events to it. */
function handleSSE(nodeReq: IncomingMessage, nodeRes: ServerResponse) {
  nodeRes.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  clients.add(nodeRes);
  nodeRes.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  nodeReq.on("close", () => {
    clients.delete(nodeRes);
  });
}

/** Create the HTTP server (not yet listening). */
function createServer(): Server {
  return createHttpServer(async (nodeReq, nodeRes) => {
    const url = new URL(nodeReq.url ?? "/", "http://localhost");

    // SSE is streamed directly to the Node response (see design D2)
    if (url.pathname === "/api/events") {
      handleSSE(nodeReq, nodeRes);
      return;
    }

    try {
      const request = await toWebRequest(nodeReq);
      const response = await handleRequest(request);
      await writeNodeResponse(nodeRes, response);
    } catch {
      if (!nodeRes.headersSent) nodeRes.writeHead(500);
      nodeRes.end("Internal Server Error");
    }
  });
}

/**
 * Bind the server to a port, falling forward to the next port when one is
 * already in use. Resolves with the port actually bound.
 */
function listenWithRetry(server: Server, port: number, maxAttempts = 10): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryListen = (candidate: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener("listening", onListening);
        if (err.code === "EADDRINUSE" && attempts < maxAttempts) {
          attempts++;
          console.log(`Port ${candidate} is in use, trying ${candidate + 1}...`);
          tryListen(candidate + 1);
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.removeListener("error", onError);
        resolve(candidate);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate);
    };
    tryListen(port);
  });
}

/** Route a Web-standard request and produce a Web-standard response. */
async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // GET /api/config - Get current workspace root path and mode
    if (path === "/api/config" && req.method === "GET") {
      return Response.json({ rootPath, mode: currentMode });
    }

    // POST /api/config - Set workspace root path
    if (path === "/api/config" && req.method === "POST") {
      const body = await req.json();
      if (body.rootPath && typeof body.rootPath === "string") {
        rootPath = body.rootPath;
        currentMode = await detectMode(rootPath);
        startWatcher();
        broadcastUpdate();
        return Response.json({ rootPath, mode: currentMode, success: true });
      }
      return Response.json({ error: "Invalid rootPath" }, { status: 400 });
    }

    // GET /api/repositories - List all repositories
    if (path === "/api/repositories") {
      const repos = await getRepositories();
      return Response.json(repos);
    }

    // GET /api/repositories/:name - Get features for a repository
    const repoMatch = path.match(/^\/api\/repositories\/([^/]+)$/);
    if (repoMatch) {
      const features = await getRepositoryData(repoMatch[1]);
      return Response.json(features);
    }

    // POST /api/subtask/toggle - Toggle Manual QA subtask completion
    if (path === "/api/subtask/toggle" && req.method === "POST") {
      const body = await req.json();
      if (!body.featurePath || !body.subtaskId) {
        return Response.json({ error: "Missing featurePath or subtaskId" }, { status: 400 });
      }
      const result = await toggleSubtask(body.featurePath, body.subtaskId);
      if (!result.success) {
        return Response.json({ error: result.error }, { status: 400 });
      }
      return Response.json({ success: true, completed: result.completed });
    }

    // POST /api/open/finder - Open path in Finder/Explorer
    if (path === "/api/open/finder" && req.method === "POST") {
      const body = await req.json();
      if (body.path && typeof body.path === "string") {
        try {
          const os = platform();
          let cmd: string[];
          if (os === "darwin") {
            cmd = ["open", body.path];
          } else if (os === "win32") {
            cmd = ["explorer", body.path];
          } else {
            cmd = ["xdg-open", body.path];
          }
          spawnDetached(cmd);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Failed to open directory" }, { status: 500 });
        }
      }
      return Response.json({ error: "Invalid path" }, { status: 400 });
    }

    // POST /api/open/vscode - Open path in VS Code
    if (path === "/api/open/vscode" && req.method === "POST") {
      const body = await req.json();
      if (body.path && typeof body.path === "string") {
        try {
          spawnDetached(["code", body.path]);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Failed to open VS Code" }, { status: 500 });
        }
      }
      return Response.json({ error: "Invalid path" }, { status: 400 });
    }

    // POST /api/open/terminal - Open path in Terminal
    if (path === "/api/open/terminal" && req.method === "POST") {
      const body = await req.json();
      if (body.path && typeof body.path === "string") {
        try {
          const os = platform();
          if (os === "darwin") {
            spawnDetached(["open", "-a", "Terminal", body.path]);
          } else if (os === "win32") {
            spawnDetached(["cmd", "/c", "start", "cmd", "/k", `cd /d "${body.path}"`]);
          } else {
            spawnDetached(["gnome-terminal", `--working-directory=${body.path}`]);
          }
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Failed to open Terminal" }, { status: 500 });
        }
      }
      return Response.json({ error: "Invalid path" }, { status: 400 });
    }

    // GET /api/artifact - Fetch artifact content (proposal, design, spec, plan)
    if (path === "/api/artifact" && req.method === "GET") {
      const featurePath = url.searchParams.get("path");
      const artifact = url.searchParams.get("artifact");
      const specName = url.searchParams.get("spec");

      if (!featurePath || !artifact) {
        return Response.json({ error: "Missing path or artifact" }, { status: 400 });
      }

      const artifactMap: Record<string, string> = {
        proposal: "proposal.md",
        design: "design.md",
        plan: "tasks.md",
      };

      try {
        // Handle specs specially
        if (artifact === "specs") {
          let specPath: string;
          if (specName === "_single") {
            specPath = join(featurePath, "spec.md");
          } else if (specName) {
            specPath = join(featurePath, "specs", specName, "spec.md");
          } else {
            return Response.json({ error: "Missing spec name" }, { status: 400 });
          }

          if (!(await fileExists(specPath))) {
            return Response.json({ error: "Spec not found" }, { status: 404 });
          }
          const content = await readFile(specPath, "utf-8");
          return Response.json({ content });
        }

        const filename = artifactMap[artifact];
        if (!filename) {
          return Response.json({ error: "Invalid artifact type" }, { status: 400 });
        }
        const artifactPath = join(featurePath, filename);
        if (!(await fileExists(artifactPath))) {
          return Response.json({ error: "Artifact not found" }, { status: 404 });
        }
        const content = await readFile(artifactPath, "utf-8");
        return Response.json({ content });
      } catch {
        return Response.json({ error: "Failed to read artifact" }, { status: 500 });
      }
    }

    // GET /api/browse - Browse directories for path selection
    if (path === "/api/browse") {
      const browseDir = url.searchParams.get("path") || "/";
      try {
        if (!(await dirExists(browseDir))) {
          return Response.json({ error: "Directory not found" }, { status: 404 });
        }
        const entries = await readdir(browseDir, { withFileTypes: true });
        const dirs = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith("."))
          .map((e) => ({ name: e.name, path: join(browseDir, e.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const parent = browseDir === "/" ? null : join(browseDir, "..");
        return Response.json({ current: browseDir, parent, directories: dirs });
      } catch {
        return Response.json({ error: "Cannot read directory" }, { status: 500 });
      }
    }

    // NOTE: GET /api/events (SSE) is handled directly in createServer() before
    // routing, so it can stream to the raw Node response (see design D2).

    // Static files
    const filePath = path === "/" ? "/index.html" : path;
    const staticPath = join(PUBLIC_DIR, filePath);

    try {
      if (await fileExists(staticPath)) {
        const data = await readFile(staticPath);
        return new Response(data, {
          headers: { "Content-Type": contentType(staticPath) },
        });
      }
    } catch {}

    return new Response("Not Found", { status: 404 });
}

// =============================================================================
// Server Startup
// =============================================================================

/** Start the Specboard server with the given options */
export async function startServer(options: ServerOptions = {}) {
  const port = options.port ?? DEFAULT_PORT;
  rootPath = options.rootPath ?? process.cwd();
  const shouldOpen = options.open ?? false;

  // Detect mode based on directory structure
  currentMode = await detectMode(rootPath);
  console.log(`Mode: ${currentMode}`);

  serverInstance = createServer();
  const boundPort = await listenWithRetry(serverInstance, port);

  const url = `http://localhost:${boundPort}`;
  console.log(`\nSpecboard running at: ${url}\n`);

  if (shouldOpen) {
    const os = platform();
    if (os === "darwin") {
      spawnDetached(["open", url]);
    } else if (os === "win32") {
      spawnDetached(["cmd", "/c", "start", url]);
    } else {
      spawnDetached(["xdg-open", url]);
    }
  }

  await startWatcher();

  return serverInstance;
}
