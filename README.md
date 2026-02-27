# Specboard

A web-based dashboard for monitoring [OpenSpec](https://github.com/org/openspec) progress across multiple workspaces. Track features, tasks, and artifacts with a real-time kanban-style interface.

![Specboard Screenshot](screenshot.png)

## Features

- **Live Kanban View**: See all active features as swimlanes with tasks organized in Todo/In Progress/Done columns
- **Real-time Updates**: File changes are detected automatically via filesystem watching
- **Artifact Viewer**: Browse proposal, specification, design, and plan documents with collapsible sections
- **Interactive Manual QA**: Toggle completion status for "Manual QA" subtasks directly from the UI
- **Quick Actions**: Open worktrees in Finder, VS Code, or Terminal with one click
- **Persistent Navigation**: URL-based routing preserves your location across page refreshes
- **Multi-Repository Support**: Switch between different repositories and worktrees

## Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0 or later)
- VS Code with `code` CLI (optional, for "Open in VS Code" feature)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/specboard.git
cd specboard

# No dependencies to install - Bun handles everything!
```

## Usage

### Start the Server

```bash
# Production mode
bun run start

# Development mode (with hot reload)
bun run dev
```

The dashboard will be available at `http://localhost:3456`

### Configure Your Workspace Path

1. Click "Change Path" in the header
2. Navigate to your workspaces root directory
3. Click "Select This Directory"

### Expected Directory Structure

Specboard expects an OpenSpec-compatible directory structure:

```
workspaces/
├── repository-name/
│   ├── worktree-1/
│   │   └── openspec/
│   │       └── changes/
│   │           ├── feature-name/
│   │           │   ├── proposal.md      # Feature proposal
│   │           │   ├── design.md        # Technical design
│   │           │   ├── spec.md          # Specification (or specs/ dir)
│   │           │   └── tasks.md         # Implementation tasks
│   │           └── archive/             # Completed features
│   └── worktree-2/
│       └── ...
└── another-repo/
    └── ...
```

### Task File Format

The `tasks.md` file should follow this format:

```markdown
## 1. Task Title

- [x] 1.1 Completed subtask description
- [ ] 1.2 Pending subtask description
- [ ] 1.3 Manual QA: This subtask can be toggled from the UI

## 2. Another Task

- [ ] 2.1 Subtask description
```

Tasks with "Manual QA" prefix in their subtask titles become interactive checkboxes in the dashboard.

## Views

### Live View

The default view showing all active features as horizontal swimlanes. Each feature displays:

- Feature name and available artifacts (Proposal, Spec, Design, Plan)
- Worktree name with quick-action buttons
- Kanban board with tasks in Todo/In Progress/Done columns
- Task cards with progress indicators

Click on a task card to view its subtasks in a sidebar panel.

### Features View

A list-based view for browsing features and their artifacts:

- Click a feature to view its documents
- Switch between Proposal, Specification, Design, and Plan tabs
- Design documents are split into collapsible sections by H2 headers
- Plan documents show tasks with interactive subtask checkboxes

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get current workspace root path |
| `/api/config` | POST | Set workspace root path |
| `/api/repositories` | GET | List all repositories |
| `/api/repositories/:name` | GET | Get features for a repository |
| `/api/artifact` | GET | Fetch artifact content (proposal, design, spec, plan) |
| `/api/subtask/toggle` | POST | Toggle a Manual QA subtask completion |
| `/api/open/finder` | POST | Open path in Finder/Explorer |
| `/api/open/vscode` | POST | Open path in VS Code |
| `/api/open/terminal` | POST | Open path in Terminal |
| `/api/browse` | GET | Browse directories for path selection |
| `/api/events` | GET | SSE endpoint for real-time updates |

## Configuration

Settings are persisted in browser localStorage:

- `specboard_rootPath`: Workspace root directory
- `specboard_repo`: Last selected repository

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/) - Fast JavaScript runtime with built-in bundler
- **Backend**: TypeScript with Bun's native HTTP server
- **Frontend**: Vanilla JavaScript (no build step required)
- **Styling**: CSS with CSS custom properties
- **Icons**: [Lucide](https://lucide.dev/)
- **Fonts**: [Source Code Pro](https://fonts.google.com/specimen/Source+Code+Pro)
- **Markdown**: [marked.js](https://marked.js.org/)

## Development

The project requires no build step. Edit files directly and use `bun run dev` for hot reloading.

### Project Structure

```
specboard/
├── server.ts          # Bun HTTP server with API routes
├── public/
│   ├── index.html     # Single-page app shell
│   ├── app.js         # Frontend application logic
│   └── styles.css     # All styles
├── package.json       # Project metadata and scripts
└── README.md          # This file
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
