/**
 * Specboard Server
 *
 * A Bun-based HTTP server that:
 * - Serves the static frontend files
 * - Provides REST API for reading OpenSpec data
 * - Watches for file changes and broadcasts updates via SSE
 * - Supports toggling Manual QA subtask completion
 */

import { watch, type FSWatcher } from "fs";
import { readdir, readFile, stat, access } from "fs/promises";
import { join } from "path";
import { homedir, platform } from "os";

// =============================================================================
// Configuration
// =============================================================================

const PORT = 3456;

// =============================================================================
// Application State
// =============================================================================

let rootPath = join(homedir(), "conductor", "workspaces");
let watcher: FSWatcher | null = null;
let clients: Set<ReadableStreamDefaultController> = new Set();

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

    await Bun.write(tasksPath, updatedLines.join("\n"));
    return { success: true, completed: newCompleted };
  } catch (err) {
    return { success: false, error: `File error: ${err}` };
  }
}

// =============================================================================
// Repository Scanning
// =============================================================================

/** Get all repositories from the root path */
async function getRepositories(): Promise<Repository[]> {
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

/** Get all features across all worktrees for a repository */
async function getFeatures(repoName: string): Promise<Feature[]> {
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
      client.enqueue(new TextEncoder().encode(data));
    } catch {
      clients.delete(client);
    }
  }
}

// =============================================================================
// HTTP Server & API Routes
// =============================================================================

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // GET /api/config - Get current workspace root path
    if (path === "/api/config" && req.method === "GET") {
      return Response.json({ rootPath });
    }

    // POST /api/config - Set workspace root path
    if (path === "/api/config" && req.method === "POST") {
      const body = await req.json();
      if (body.rootPath && typeof body.rootPath === "string") {
        rootPath = body.rootPath;
        startWatcher();
        broadcastUpdate();
        return Response.json({ rootPath, success: true });
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
          Bun.spawn(cmd);
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
          Bun.spawn(["code", body.path]);
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
            Bun.spawn(["open", "-a", "Terminal", body.path]);
          } else if (os === "win32") {
            Bun.spawn(["cmd", "/c", "start", "cmd", "/k", `cd /d "${body.path}"`]);
          } else {
            Bun.spawn(["gnome-terminal", `--working-directory=${body.path}`]);
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

    // GET /api/events - SSE endpoint for real-time updates
    if (path === "/api/events") {
      const stream = new ReadableStream({
        start(controller) {
          clients.add(controller);
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "connected" })}\n\n`
            )
          );
        },
        cancel() {
          // Client disconnected
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Static files
    let filePath = path === "/" ? "/index.html" : path;
    const staticPath = join(import.meta.dir, "public", filePath);

    try {
      const file = Bun.file(staticPath);
      if (await file.exists()) {
        return new Response(file);
      }
    } catch {}

    return new Response("Not Found", { status: 404 });
  },
});

// =============================================================================
// Startup
// =============================================================================

const url = `http://localhost:${PORT}`;
const shouldOpen = Bun.argv.includes("--open");

console.log(`\nSpecboard running at: ${url}\n`);

if (shouldOpen) {
  const os = platform();
  if (os === "darwin") {
    Bun.spawn(["open", url]);
  } else if (os === "win32") {
    Bun.spawn(["cmd", "/c", "start", url]);
  } else {
    Bun.spawn(["xdg-open", url]);
  }
}

startWatcher();
