## 1. Update package.json metadata

- [x] 1.1 Change package name to `@sflueckiger/specboard`
- [x] 1.2 Add `repository` field with GitHub URL
- [x] 1.3 Add `homepage` field
- [x] 1.4 Add `bugs` field with issues URL
- [x] 1.5 Add `keywords` array (openspec, dashboard, kanban, bun, cli)
- [x] 1.6 Add `engines` field specifying node >= 18
- [x] 1.7 Add `prepublishOnly` script

## 2. Create .npmignore

- [x] 2.1 Create `.npmignore` file excluding openspec/, assets/, CLAUDE.md, editor files

## 3. Update documentation

- [x] 3.1 Update README installation examples to use `@sflueckiger/specboard`

## 4. Verify and publish

- [x] 4.1 Run `npm pack` to verify package contents
- [x] 4.2 Manual QA: Check tarball only contains cli.ts, server.ts, public/, package.json, README.md
- [ ] 4.3 Run `npm login` (if not already logged in)
- [ ] 4.4 Run `npm publish --access public`
- [ ] 4.5 Manual QA: Test `bunx @sflueckiger/specboard --version` works
