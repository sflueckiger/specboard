## Why

The `cli-bundle` change prepared the package for npm distribution (`bin`, `files`, `type` fields), but the package isn't published yet. Publishing to npm enables `bunx specboard` and `npm install -g specboard` usage as documented in the README.

## What Changes

- Add `repository`, `homepage`, `bugs`, and `keywords` fields to package.json for npm listing
- Add `engines` field to specify Bun requirement
- Add `prepublishOnly` script to prevent accidental publishes without verification
- Create `.npmignore` to exclude development files (openspec/, assets/, etc.)
- Document the publish workflow in a CONTRIBUTING or release section

## Capabilities

### New Capabilities

None - this is a publishing/packaging change with no new runtime capabilities.

### Modified Capabilities

None - no behavioral changes.

## Impact

- **Modified files**: `package.json` (metadata fields)
- **New files**: `.npmignore`
- **External**: Requires npm account and `npm login`
- **Process**: Manual `npm publish` or future CI automation
