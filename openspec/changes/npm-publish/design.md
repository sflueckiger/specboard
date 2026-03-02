## Context

The package is ready for npm with CLI entry point (`cli.ts`), bin config, and files array. Need to add npm metadata and create .npmignore for clean publishing. User wants scoped package `@sflueckiger/specboard` with manual publishing workflow.

## Goals / Non-Goals

**Goals:**
- Publish as `@sflueckiger/specboard` to npm registry
- Include proper metadata (repository, homepage, keywords)
- Exclude development files from published package
- Manual `npm publish` workflow

**Non-Goals:**
- CI/CD automation for publishing
- Automated version bumping
- CHANGELOG generation

## Decisions

### 1. Package scope: `@sflueckiger/specboard`

**Choice**: Use scoped package under personal npm account.

**Rationale**:
- Avoids name conflicts with potential future `specboard` packages
- Clearly identifies ownership
- Usage: `bunx @sflueckiger/specboard` or `npm install -g @sflueckiger/specboard`

### 2. Package metadata fields

```json
{
  "name": "@sflueckiger/specboard",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/sflueckiger/specboard.git"
  },
  "homepage": "https://github.com/sflueckiger/specboard#readme",
  "bugs": {
    "url": "https://github.com/sflueckiger/specboard/issues"
  },
  "keywords": ["openspec", "dashboard", "kanban", "bun", "cli"],
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 3. Files to exclude via .npmignore

```
# Development
openspec/
assets/
CLAUDE.md
.gitignore

# Editor/IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db
```

The `files` array in package.json already limits what's included (`cli.ts`, `server.ts`, `public`), but .npmignore provides defense in depth.

### 4. Publish workflow

Manual publishing:
```bash
npm login  # one-time setup
npm publish --access public  # scoped packages default to private
```

Add `prepublishOnly` script for safety:
```json
{
  "scripts": {
    "prepublishOnly": "echo 'Publishing @sflueckiger/specboard...' && bun cli.ts --version"
  }
}
```

## Risks / Trade-offs

**[Scoped package longer to type]** → `bunx @sflueckiger/specboard` vs `bunx specboard`. Mitigation: Acceptable tradeoff for namespace clarity.

**[No automated releases]** → Must manually run `npm publish`. Mitigation: Simple workflow for a personal tool; can add CI later if needed.

**[Bun-only runtime]** → Package won't work with Node.js. Mitigation: `engines` field documents this; consider Node shim in future if demand exists.
