## ADDED Requirements

### Requirement: CLI entry point

The system SHALL provide an executable CLI entry point (`cli.ts`) that can be invoked via `bunx specboard`, `npx specboard`, or as a globally installed command `specboard`.

#### Scenario: Run via bunx
- **WHEN** user runs `bunx specboard`
- **THEN** Specboard server starts on default port 3456

#### Scenario: Run via global install
- **WHEN** user installs globally with `bun install -g specboard` and runs `specboard`
- **THEN** Specboard server starts on default port 3456

### Requirement: Root path argument

The CLI SHALL accept an optional positional argument specifying the root path to watch for OpenSpec changes.

#### Scenario: Path argument provided
- **WHEN** user runs `specboard /path/to/workspaces`
- **THEN** server watches `/path/to/workspaces` for repository/worktree/changes

#### Scenario: No path argument
- **WHEN** user runs `specboard` without a path argument
- **THEN** server watches the current working directory

### Requirement: Port flag

The CLI SHALL accept `--port` or `-p` flag to specify a custom port.

#### Scenario: Custom port specified
- **WHEN** user runs `specboard --port 8080`
- **THEN** server starts on port 8080

#### Scenario: Port flag with equals syntax
- **WHEN** user runs `specboard -p=9000`
- **THEN** server starts on port 9000

#### Scenario: Default port
- **WHEN** user runs `specboard` without port flag
- **THEN** server starts on port 3456

### Requirement: Open browser flag

The CLI SHALL accept `--open` or `-o` flag to automatically open the browser after server starts.

#### Scenario: Open flag provided
- **WHEN** user runs `specboard --open`
- **THEN** server starts AND default browser opens to the server URL

#### Scenario: Open flag not provided
- **WHEN** user runs `specboard` without `--open`
- **THEN** server starts without opening browser

### Requirement: Help flag

The CLI SHALL display usage information when `--help` or `-h` flag is provided.

#### Scenario: Help requested
- **WHEN** user runs `specboard --help`
- **THEN** CLI prints usage information including all available flags and arguments
- **THEN** CLI exits without starting the server

### Requirement: Version flag

The CLI SHALL display the version number when `--version` or `-v` flag is provided.

#### Scenario: Version requested
- **WHEN** user runs `specboard --version`
- **THEN** CLI prints the version from package.json
- **THEN** CLI exits without starting the server

### Requirement: Startup message

The CLI SHALL print the server URL on startup.

#### Scenario: Server starts successfully
- **WHEN** server starts on port 3456
- **THEN** CLI prints "Specboard running at: http://localhost:3456"

### Requirement: Package configuration

The package.json SHALL be configured for npm publishing with correct bin, files, and type fields.

#### Scenario: Package publishes correctly
- **WHEN** package is published to npm
- **THEN** only cli.ts, server.ts, and public/ directory are included
- **THEN** bin field points to cli.ts as "specboard" command
