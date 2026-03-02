## ADDED Requirements

### Requirement: Package metadata for npm registry

The package.json SHALL contain valid npm registry metadata including repository URL, homepage, bugs URL, and keywords.

#### Scenario: Package displays correctly on npm

- **WHEN** package is published to npm
- **THEN** the npm page shows repository link to github.com/sflueckiger/specboard
- **THEN** the npm page shows relevant keywords (openspec, dashboard, kanban, bun, cli)

### Requirement: Scoped package name

The package SHALL be published under the `@sflueckiger` npm scope.

#### Scenario: Install via scoped name

- **WHEN** user runs `npm install -g @sflueckiger/specboard`
- **THEN** the package installs successfully
- **THEN** the `specboard` command is available globally

#### Scenario: Run via bunx with scope

- **WHEN** user runs `bunx @sflueckiger/specboard`
- **THEN** Specboard starts without requiring global installation

### Requirement: Clean published package

The published package SHALL only contain runtime files (cli.ts, server.ts, public/).

#### Scenario: Development files excluded

- **WHEN** package is published
- **THEN** openspec/, assets/, CLAUDE.md are NOT included in the tarball
