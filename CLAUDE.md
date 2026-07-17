# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Specboard is a web-based monitoring tool for tracking OpenSpec progress across workspaces. It displays worktrees, changes, and task completion status in a swimlane-style interface with real-time updates via Server-Sent Events.

## Commands

```bash
# Start server (port 3456)
bun run start

# Start with hot reload for development
bun run dev

# Build the published artifact (dist/cli.js) — plain Node-compatible JS
bun run build
```

## Architecture

**Runtime**: Node.js 18+ or Bun. The backend uses only standard-library HTTP/fs/child_process APIs, so it runs on either runtime. In development Bun runs the TypeScript directly (no build step); for publishing, `bun run build` bundles `cli.ts` (and its `server.ts` import) into `dist/cli.js`, which is what `npx @sflueckiger/specboard` executes.

**Entry point** (`cli.ts`):
- Parses CLI args (path, `--port`, `--open`, `--help`, `--version`) and calls `startServer()`

**Server** (`server.ts`):
- Node `http` server with a Web `Request`/`Response` adapter; serves static files from `public/`
- REST API endpoints for repositories, worktrees, and directory browsing
- SSE endpoint (`/api/events`) for real-time file change notifications (streamed directly to the Node response)
- Watches configured root path for `.md` file changes

**Frontend** (`public/`):
- Vanilla JS single-page app
- Renders features as horizontal swimlanes with 3-column kanban boards (Todo, In Progress, Done)
- Task cards contain subtasks and move through columns based on subtask completion

**Data Model**:
- Scans `{rootPath}/{repo}/{worktree}/openspec/changes/` directories
- Parses `tasks.md` for numbered tasks (`1.`, `2.`) and subtasks (`1.1`, `1.2` or indented checkboxes)
- Task status: todo (0 subtasks done) → in_progress (some done) → done (all done)
- Detects artifact presence: `proposal.md`, `design.md`, `specs/` directory

## API Endpoints

- `GET /api/config` - Current root path
- `POST /api/config` - Update root path (restarts watcher)
- `GET /api/repositories` - List all repositories
- `GET /api/repositories/:name` - Get worktrees and changes for a repository
- `GET /api/browse?path=` - Directory browser for path selection
- `GET /api/events` - SSE stream for real-time updates
