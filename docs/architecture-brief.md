# dsh-better-sidebar-lite — Architecture Brief

> Read this FIRST. It is the single source of truth for the project's constraints,
> environment facts, and the DeepSeek Harness (dsh) extension surfaces our plugin
> builds on. Subagents: verify anything you build on by reading the cited dsh files.

## 1. Mission

Build **dsh-better-sidebar-lite**: a plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) that extends its **web GUI** with a **sidebar docked on the RIGHT** of the app, containing **tabs**:

- **explorer** — a file-tree view of the current workspace (lazy-loaded directories, sort, refresh, selection)
- **git** — git changes (status) and commits (log); refresh; error states (not-a-repo, git missing)

Hard requirements from the project owner:
1. **Clean code, easily extensible** — adding tabs/features must be a first-class, documented extension point (a tab registry), and each module must have a single responsibility.
2. **Use subagents maximally** — the build is a team effort; every module is designed and reviewed by at least one dedicated subagent.
3. **NEVER install the plugin into the running dsh** (no cordis.yml edits in the checkout, no `dsh.client` seeding in apps/web) and **NEVER restart dsh web**.
4. Typecheck and tests must pass locally (see §3). README must document how a user would install the plugin later.

## 2. Environment

- **Workspace (this project):** the repo root (wherever it is cloned). Already scaffolded: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.host.json`, `tsconfig.client.json`, `vitest.config.ts` (projects: `host`=node env, `client`=jsdom env), `.gitignore`, `.editorconfig`, `src/client/css-modules.d.ts`. A git repo with the scaffold committed.
- **dsh checkout (READ-ONLY reference):** a sibling clone at `../deepseek-harness` (i.e. in the same parent directory as this repo) at branch state `0.1.0-rc.5`. Its packages are already built (`lib/` + `lib/types/*.d.ts` present). Never modify anything under it. **This repo is portable: no absolute path to the dsh checkout appears in any committed file** — paths resolve relative to the repo (`../deepseek-harness/...`) and `./node_modules/...`.
- **Toolchain:** Node v24.18.0, pnpm 11.21.0, TypeScript ^6.0.3, vitest ^4.1.8, react 18.2.0 (+@types/react ~18.3.1), @testing-library/react ^16.3.2, jsdom 29.1.1, oxlint ^1.78.0, tsx ^4.22.4. esbuild approved in `pnpm-workspace.yaml`.
- **Linking:** this repo consumes the dsh checkout purely through **relative `paths`/aliases** — `tsconfig.base.json` maps `@deepseek-ai/*` → `../deepseek-harness/packages/.../lib/types/index.d.ts` for build/typecheck, `tsconfig.vitest.json` maps them to `../deepseek-harness/.../src` for tests, and `vitest.config.ts` builds the runtime aliases the same way. Do not add `@deepseek-ai/*` to `dependencies`/`devDependencies` (pnpm would fetch stale registry versions). dsh provides them at runtime; we only consume types + (in tests) built JS.
- **Commands (from workspace root):** `pnpm typecheck` (tsc -p host + client, noEmit), `pnpm test` (vitest run), `pnpm build` (tsc -p host && tsc -p client → `lib/`), `pnpm lint` (oxlint).

## 3. Deliverable layout (planned)

```
src/
  contract/           shared, dependency-free types: RPC payloads/results, tree & git models, error codes
  host/               Node-side cordis plugin (the "server" half)
    index.ts          plugin entry: inject, config (Schema), apply → registers RPC channel + services
    ...               explorer service (file tree), git service (status/log), path safety
  client/             browser-side cordis plugin (the "web" half)
    index.ts          plugin entry: inject, apply → registers overlay slot entry + tab registry service
    ...               dock shell (resize/collapse), tab registry, explorer tab, git tab, locales, styles
tests/
  host/**/*.spec.ts   node-env unit tests (tree builder, git parser, path safety, rpc handlers)
  client/**/*.spec.ts[x] jsdom component tests + plugin apply tests
docs/
  architecture-brief.md   this file
  design/*.md             design docs (subagents produce these)
  adr/*.md                consolidated decisions (owner consolidates)
README.md               install/usage guide + architecture summary + Model Experience section
```

**Package exports** (already declared in package.json): `.` (host entry), `./client` (client entry), `./contract` (shared types).

## 4. DSH extension surfaces we build on (verified facts)

### 4.1 Client slot system
- Slot registry package: `packages/client/ui-slots` (`@deepseek-ai/dsh-client-ui-slots`). One `register` API on `ctx.slots`: `ctx.slots.register({ name, id?, children?, store?, inject?, locale?, order? }, Component)` returns a disposer. `ctx.slots.inject(slotName, factory)` re-registers after the declaring slot is restored.
- The runtime's built-in `root` slot is occupied by the layout plugin AppFrame (`packages/client/ui-layout/src/client/index.ts`) which declares four child slots:
  - `'sidebar'`: kind **single**, scope root — occupied by ui-sidebar's SidebarRoot.
  - `'conversation'`: kind **single**, scope session-maybe — occupied by ui-conversation's ConversationRoot.
  - `'details'`: kind **single**, scope session — occupied by ui-conversation's DetailsPanel (tool details).
  - `'details'`: kind **single**, scope **session** — **the right column**: shown when the layout opens it, resized by AppFrame's drag handle (clamp [300, 520], default 360), closed outside a current non-blank session. OCCUPIED by ui-conversation's DetailsPanel — registering here replaces the column and takes its seats with it. **This is where our right-docked sidebar registers** (priority -1 shadows the incumbent; see AppFrame.tsx `detailsCol`). `'shell.overlay'` (kind list, scope root) is the frame-wide floating layer — the additive seat for badges/toasts, not a space-reserving column.
- Slot types: `PropsRuntime`, `PropsRenderSlots`, `PropsStore`, business props from `inject` factory. Session-standard props (`useSession`, `sessionId`, `useProjection`) and global-standard props (`useSessions`, `useWorkspaces`) are merged by `@deepseek-ai/dsh-client-runtime/client` (see `packages/client/runtime/src/client/index.ts` declare-module blocks).
- Client plugin shape (copy `packages/client/ui-jobs` or `ui-goal`): `inject` array (e.g. `['sessions','slots','locale']`), `apply(ctx: ClientContext)` using `ctx.effect(() => {...; return disposer}, 'label')` for every registration; locale dictionaries via `ctx.locale.register(NS, { zh, en })` + `declare module '@deepseek-ai/dsh-client-locale/client' { interface LocaleNamespaceMap { '<ns>': Keys } }`.
- Test runtime available: `@deepseek-ai/dsh-client-test-runtime/client` (package `packages/test-support/client-runtime`). Real plugin apply tests in dsh use it (see `packages/client/ui-jobs/tests/browser-plugin.client.spec.ts`).

### 4.2 Client→host RPC (generic logical channel) — the transport for explorer/git data
- Shared contract `packages/client/connection/src/rpc.ts` (exported from `@deepseek-ai/dsh-client-connection` main entry):
  - Host: `ctx.connection.rpc.handle(channel, handler, { authority })` where `handler: (endpoint, payload, signal) => Promise<RpcResult<unknown>>`; `authority: 'trusted-host' | 'loopback'`; returns async disposer.
  - Client: `ctx.connection.rpc.call(channel, endpoint, payload, signal?) => Promise<RpcResult<unknown>>`.
- `RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError }`; `RpcError` is a discriminated union keyed by `code` (see `packages/host/apiproxy/src/api/rpc.ts`; import from `@deepseek-ai/dsh-host-apiproxy/api`). Unknown-error handling: `{ code: 'bad-request'|'cancelled'|..., message, details }`. Plugins may define their own error codes — keep them in our contract module and map to this shape.
- Host plugin pattern (copy `packages/api/gateway/src/index.ts` ~line 104): `ctx.inject(['connection'], (connectionCtx) => connectionCtx.connection.rpc.handle('/better-sidebar', handler, { authority: 'loopback' }))` — note the inject-then-register pattern; also register a disposer via `ctx.effect` so unload cleans up.
- On the HOST, `ctx.connection` is provided by the client-connection plugin (`packages/client/connection/src/index.ts`, `inject = ['webServer']`, provides `ctx.connection` incl. `rpc`).
- **Design decision already made:** use the generic RPC channel `/better-sidebar` (NOT typert/remote services) — self-contained, no generated artifacts needed. Endpoint vocabulary (names are yours to finalize): `explorer/list`, `git/status`, `git/log`, plus any you justify. All payload/result types live in `src/contract`.

### 4.3 Client data sources (for the "current workspace")
- `ctx.workspaces` (interface `IWorkspaces` in `packages/client/runtime/src/client/contract/workspaces.ts`), global hook `useWorkspaces` → `WorkspaceListState` (see `packages/client/runtime/src/client/workspaces/service.ts`). Workspace entities (`WorkspaceView` in `packages/client/connection/src/client/api.ts`) carry canonical `path` — the client sends the current workspace's path (or a chosen root) to the host RPC. Session selection: `useSessions` → `SessionListState`; the active session's workspace is reachable through the sessions service (`ctx.sessions`).
- Design question for the explorer tab: what root does the tree show — the active session's workspace path, the "current" workspace from `useWorkspaces`, or a user-chosen root? Decide in the design phase and document.

### 4.4 Host side (filesystem + git)
- Host code may use Node built-ins directly (`node:fs/promises`, `node:child_process`) — keep the plugin self-contained ("lite"). dsh's own fs abstraction (`@deepseek-ai/dsh-fs-*`, packages under `packages/fs/`) and bash service exist but add dependency surface; only use them if a design doc justifies it (e.g. sandboxing policy).
- Git invocation: `child_process.execFile('git', args, { cwd })` with strict, fixed argument lists (no shell interpolation). Parsing: `git status --porcelain=v1 -z` (machine-readable, NUL-separated), `git log --format=...` for commits. Windows: `git` resolves via PATH (git 2.54 present on this machine). Not-a-repo must surface as a typed error code, not a crash.
- Path safety: host must validate that any path in a payload is absolute, exists, is a directory; no escaping the configured root (config field, default: allow any absolute dir the host process can read — document the trust boundary and the `authority: 'loopback'` fence).
- Host plugin config: use cordis config (Schema — dsh uses `@deepseek-ai/schemastery`; see a config plugin reference, e.g. `packages/client-connection`'s `ConnectionConfig` for the shape: `export const Config = Schema.object({...})` and `export const inject`). Suggested config: `allowedRoots` (optional allowlist), `gitTimeoutMs`, `maxTreeDepth`/lazy depth, `maxLogEntries`.

### 4.5 UI conventions to match (visual consistency)
- CSS modules (`*.module.css`) — dsh convention (`packages/client/ui-sidebar/src/client/SidebarRoot.module.css` etc.). No CSS-in-JS.
- Theme: dsh web has a theme system (`@deepseek-ai/dsh-client-ui-theme`); tokens are exposed as CSS variables on `body` (see ui-layout theme-presenter). For "lite", use a small set of CSS variables with sensible dark/light defaults and document that host theme tokens can be adopted later. Prefer `color-scheme` + semantic tokens.
- Accessibility: keyboard focus, aria labels, aria-expanded for tree nodes, tab semantics (role=tablist/tab/tabpanel).
- Icons: no icon library in dsh — dsh uses inline SVG or text glyphs (check ui-sidebar's rail icons). Keep icons as tiny inline SVG components in our own `icons.tsx`.

## 5. Design questions to resolve in the design phase (one doc each — see assignment)

1. **D1 Architecture**: module boundaries & data flow; the dock as the frame's right `details` column (grid reserves space — no overlay, no overlap; open/close via `ctx.layout`, native drag resize, narrow viewports handled by AppFrame's concession chain); how the tab registry service is exposed (`ctx.betterSidebar`?); package export surface; error-code vocabulary shared between halves.
2. **D2 Explorer**: tree model (nodes, lazy children, load states), sorting (dirs-first, locale-aware), refresh semantics, selection & expansion state, root selection (see 4.3), open-file event (future editors — just an event today), ignore rules (node_modules? .git?), virtualization? (lite → no), error/empty states.
3. **D3 Git**: status model (staged/unstaged/untracked, per-file), commit log model, refresh, auto-refresh triggers (workspace change?), view-only vs actions (stage/unstage/discard — decide scope; lite default: view + refresh + maybe stage/unstage), diff preview (in-scope? lite: line counts/delta summary; full diff = deferred), not-a-repo and git-missing states.
4. **D4 Tab registry**: the extension point — registration API, ordering, badge support?, active-tab persistence, dispose semantics, interplay with locale, minimal working example for a third-party tab.
5. **D5 Transport contract**: full RPC surface (endpoints, request/response types, error codes, cancellation/abort, timeout), validation approach for payloads (manual guards vs schemastery — dsh uses schemastery on host; decide), concurrency (refresh races: stale response guard).
6. **D6 Host services**: explorer listing implementation (fs/promises readdir with dirent types; symlink policy; hidden-file policy; root validation; depth/entry caps; error mapping), git runner (execFile wrapper with timeout+abort, env, cwd, NUL parsing details incl. rename `X -> Y`, unmerged states, submodule entries), unit-test strategy with real temp dirs + a real git repo fixture.
7. **D7 Client UI**: dock shell component tree (details-column occupant), open/close via `ctx.layout`, tab bar + panels, styles/theme tokens, a11y, empty/loading/error surfaces, keyboard shortcuts (Ctrl/Cmd+Shift+B toggle), locale dictionaries (en + zh as in dsh).
8. **D8 Testing**: tier map (host unit, client component, plugin apply, contract snapshot?), fixtures (temp-dir trees, scripted git repo), which dsh test-runtime pieces to reuse vs hand-roll, coverage expectations (pragmatic — not the 100% dsh gate), CI-less local commands.

## 6. Working conventions for subagents

- Workspace root: this repo (wherever cloned); dsh checkout: sibling `../deepseek-harness` (read-only).
- Design agents: write ONE file `docs/design/<id>.md`; be concrete (API sketches in TS, file paths, edge-case lists); cite dsh files you verified; do NOT write production code.
- Implementers: follow the design docs; every module ships with its tests; run `pnpm typecheck` and the relevant `pnpm test` filters before reporting done; never touch `../deepseek-harness`.
- Clean-code rules (from the clean-code skill): smallest slice, no speculative abstraction, single responsibility, no unused imports/vars (tsc strict enforces), no TODO debt, verify claims by running commands.
- Every doc ends with "Open questions" if any remain.## 7. Test-toolchain lessons (learned while proving the scaffold — READ BEFORE WRITING TESTS)

1. **dsh built `lib/*.js` is a custom module-loader bundle** (`window.__ModuleLoader__.load`) for the web shell — it CANNOT run under vitest/node. Tests must import dsh **source**.
2. **vitest `projects` mode does NOT inherit root `resolve.alias`/plugins** — the alias map lives in EACH project block of `vitest.config.ts` (already done; generated from the dsh repo's own tsconfig paths map, stored in `docs/dsh-paths-entries.json`).
3. **tsc typechecks our code against the built `.d.ts` artifacts** via `paths` in `tsconfig.base.json` (skipLibCheck covers the transitive closure). Tests are typechecked separately by `tsconfig.tests.json` (`pnpm typecheck:tests`).
4. **SlotMap declaration merging**: to use a slot key like `'details'`, import `type {} from '@deepseek-ai/dsh-client-ui-layout/client'` (the declare-module block lives in the `/client` entry — the bare entry does NOT merge it).
5. TS 6: no `baseUrl` (deprecated); `paths` are tsconfig-relative.
6. Proof-of-toolchain tests: `tests/client/test-runtime-probe.spec.tsx` (real SlotTestRuntime + overlay entry) and the toolchain specs in both projects — keep them passing. Our plugin-apply spec mounts the real entry into a session-scoped `details` declaration.