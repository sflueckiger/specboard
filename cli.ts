#!/usr/bin/env bun
/**
 * Specboard CLI
 *
 * Run Specboard from anywhere to monitor OpenSpec progress.
 */

import { startServer } from "./server";
import { resolve } from "path";

const pkg = await Bun.file(new URL("./package.json", import.meta.url)).json();

// =============================================================================
// Argument Parsing
// =============================================================================

const args = Bun.argv.slice(2);

function hasFlag(...flags: string[]): boolean {
  return args.some((arg) => flags.includes(arg) || flags.some((f) => arg.startsWith(`${f}=`)));
}

function getFlagValue(...flags: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // Check for --flag=value or -f=value syntax
    for (const flag of flags) {
      if (arg.startsWith(`${flag}=`)) {
        return arg.slice(flag.length + 1);
      }
    }
    // Check for --flag value or -f value syntax
    if (flags.includes(arg) && i + 1 < args.length && !args[i + 1].startsWith("-")) {
      return args[i + 1];
    }
  }
  return undefined;
}

function getPositionalArg(): string | undefined {
  // Find first argument that doesn't start with - and isn't a flag value
  const flagsWithValues = ["--port", "-p"];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      // Skip flag and its value if it takes one
      if (flagsWithValues.includes(arg) && i + 1 < args.length) {
        i++;
      }
      continue;
    }
    // Check if this is a value for the previous flag
    if (i > 0 && flagsWithValues.includes(args[i - 1])) {
      continue;
    }
    return arg;
  }
  return undefined;
}

// =============================================================================
// Help & Version
// =============================================================================

if (hasFlag("--help", "-h")) {
  console.log(`
Specboard v${pkg.version}

Monitor OpenSpec progress across workspaces.

Usage:
  specboard [path] [options]

Arguments:
  path          Root path to watch (default: current directory)

Options:
  -p, --port    Port to run on (default: 3456)
  -o, --open    Open browser after starting
  -h, --help    Show this help message
  -v, --version Show version number

Examples:
  specboard                     # Watch current directory on port 3456
  specboard ~/projects          # Watch ~/projects directory
  specboard --port 8080 --open  # Custom port, open browser
  specboard /path -p 9000 -o    # All options combined
`);
  process.exit(0);
}

if (hasFlag("--version", "-v")) {
  console.log(pkg.version);
  process.exit(0);
}

// =============================================================================
// Start Server
// =============================================================================

const portStr = getFlagValue("--port", "-p");
const port = portStr ? parseInt(portStr, 10) : undefined;

if (portStr && (isNaN(port!) || port! < 1 || port! > 65535)) {
  console.error(`Error: Invalid port number: ${portStr}`);
  process.exit(1);
}

const pathArg = getPositionalArg();
const rootPath = pathArg ? resolve(pathArg) : process.cwd();

startServer({
  port,
  rootPath,
  open: hasFlag("--open", "-o"),
});
