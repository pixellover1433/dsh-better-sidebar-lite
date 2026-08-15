# Clean-Code Review Findings - dsh-better-sidebar-lite

> Reviewer: clean-code review delegate. Scope: production code under src/ (contract, host, client),
> plus tests read for clarity. Authoritative references: architecture-brief.md, docs/adr/*.md,
> docs/design/*.md. Nothing here was modified - the owner applies fixes.
> Line numbers point at src/<path> unless noted.

## Summary of severities
- Blockers: 0
- Should-fix: 8
- Nits: 8

---

## SHOULD-FIX

### S1 - Git tab errors are never cleared on success; retry cannot recover a resolved error
src/client/tabs/git/git-tab.tsx:101-147, 168-206
refresh()/refreshStatus()/loadMore() call setStatusError/setLogError ONLY on failure; on success they set the value but never setStatusError(null)/setLogError(null). So once a not-a-repo, git-missing, or timeout error is set, a later successful fetch leaves the stale error in state:
- After a not-a-repo FullTabState (:168), the action={refresh} retry runs a success but statusError stays 'not-a-repo', so the component keeps returning FullTabState forever - recovering a freshly-created repo is impossible.
- After a timeout ErrorBanner (:194) that later succeeds, the banner persists beside good data.
The only place errors are cleared is the mount effect (:152-156), which reruns only on root change. Fix: clear the relevant error when a call succeeds (mirrors how setLoading(false) is unconditional). The retry-from-not-a-repo test (tests/client/tabs/git/git-tab.spec.tsx:172) only asserts a request fires; it never asserts the UI transitions back to loaded, so it does not catch this.

### S2 - Explorer panel ignores the active locale (hardcoded English)
src/client/tabs/explorer/ExplorerPanel.tsx:86
const t = (key: ExplorerKey): string => en[key] binds the panel to the English dictionary directly; it never uses the injected ctx.locale (unlike createGitTabDef, which passes a bound t into GitTab; src/client/tabs/git/tab-def.ts:22,28). The betterSidebar.explorer namespace IS registered with zh+en (src/client/index.ts:58) but the panel shows English in every locale. This contradicts ADR-003 (section 6) / D7 ("tab label and copy are locale-aware") and makes the zh dictionary effectively dead. Fix: bind ctx.locale.bind(NS) in createExplorerTabDef (src/client/tabs/explorer/tab-def.ts) and thread the bound t into ExplorerPanel, mirroring the git tab. (Secondary: the panel's hardcoded aria-label="Explorer" at :223 and 'Explorer - ' at :255 are also unlocalized.)

### S3 - not-a-repo SidebarError puts git's stderr in the path field
src/host/git.ts:42
case 'not-a-repo': return { code: 'not-a-repo', message: res.message, path: res.stderrTail ?? '' }
The contract SidebarError['not-a-repo'] field path is meant to hold the offending path (compare probe() at :61 which correctly sets path: cwd, and explorer's errPath). Here it is filled with res.stderrTail (git stderr text like "fatal: not a git repository ..."). The field is misused and the actual path is dropped. If a future consumer renders error.path it will paint stderr text. Fix: carry the path (cwd) and drop stderrTail from this branch (or move it to a distinct field).

### S4 - stage/unstage failures are swallowed with no user feedback
src/client/tabs/git/status-view.tsx:163-172
async function stagePaths(...){ const res = await rpc.call(gitStage, ...); if (res.ok) onChanged() } - when res.ok is false nothing happens: no error banner, no message, no console diagnostic. A failed git add / git restore --staged is invisible to the user. Per the ADR-002 error model the result can carry a typed SidebarError that is simply discarded here. Fix: surface the error (inline row/banner) or at least report it, and do not silently ignore.

### S5 - readlinkBestEffort swallows every readlink error, not just "vanished"
src/host/explorer.ts:138-144
The comment says a vanished symlink yields no target, but the catch returns undefined for ALL failures (e.g. EACCES on a symlink whose target is unreadable, ELOOP). Diagnostics are lost and every symlink renders as "no target". Fix: inspect err.code and only degrade on ENOENT; map other errors (the other paths already route through mapFSError).

### S6 - Cap defaults are duplicated across two modules (drift risk) + two dead members
src/contract/rpc.ts:39-50 (HOST_DEFAULTS) vs src/host/config.ts:59-70 (resolveConfig)
The same default numbers (maxEntriesPerListing 2000, maxLogEntries 100, maxStatusEntries 20000) are hardcoded in BOTH the contract HOST_DEFAULTS object and resolveConfig() defaults. Two sources of truth for one fact; a change to one silently desyncs the other. Additionally two members of HOST_DEFAULTS are never read anywhere in src:
- HOST_DEFAULTS.maxEntriesPerListing (rpc.ts:41) - host reads opts.maxEntries from config, never this.
- HOST_DEFAULTS.maxStatusEntries (rpc.ts:45) - host reads opts.maxStatusEntries from config, never this.
(Confirmed: only maxRequestPathLength, maxLogEntries (rpc.ts:77), totalListingPathBytes (explorer.ts:157) are consumed.) Fix: pick ONE home for the defaults and delete the dead members.

### S7 - prunePath is dead code; the ADR-004 "path-deleted, prune" contract is unwired
src/client/tabs/explorer/state.ts:209-247
prunePath is never called by any production module (grep: definition only). ADR-004 section 4 states non-root path-deleted should prune + toast, but no watcher/adapter ever detects a deleted path and invokes it. The method (and its subtree-focus logic) is shipped but unreachable. Either wire it (a refresh-time diff or a not-found signal) or delete it and document the deferral.

### S8 - Per-node loadError is stored but never displayed
src/client/tabs/explorer/state.ts:30,58,276
The NodeState.loadError: SidebarError field is written on a failed children list (:276) and cleared elsewhere, but no component ever reads it: ExplorerPanel.tsx and TreeNodeRow.tsx render the inline retry purely off loadState === 'error' (TreeNodeRow.tsx:49,90-98). The per-node error message/surface defined by the store is dropped - only a bare retry button appears. Either surface loadError (text/alert) or remove the field.

---

## NITS

### N1 - CloseIcon is unused
src/client/icons.tsx:52-54 - defined and exported but never imported anywhere in src. Dead export; delete or use.

### N2 - FsPort.realpath and FsPort.sep are declared + implemented but never used
src/host/port-fs.ts:25,34 and src/host/fs-node.ts:36,39 - realpath and sep have no consumers in src (only their definitions match). Part of the D6 (section 4.1) interface but effectively dead surface. Remove or justify.

### N3 - basename and the parent-of child-scan are duplicated
- basename implemented identically in src/client/tabs/explorer/state.ts:64-67 and src/client/tabs/explorer/ExplorerPanel.tsx:48-51.
- Child-scan for a path's parent is duplicated: ExplorerStore.parentOf (state.ts:317-322), ExplorerPanel.parentOf (:109-114), and findChildEntry (state.ts:309-315) all linear-scan nodes for the same "which node holds this child" question. Note ExplorerPanel.parentOf returns n.entry.path while the store version returns the map key p - same value today only because key===path; the logic should centralize on the store.

### N4 - Endpoint access is inconsistent: raw string vs Endpoints
src/client/tabs/explorer/ExplorerPanel.tsx:67 calls rpc.call('explorer/list', ...) with a raw literal; the git tab and status view use Endpoints.gitStatus (git-tab.tsx:109,127,142; status-view.tsx:165,170). Prefer the shared Endpoints constant everywhere for typo-proofing/consistency.

### N5 - elect is an unclear name
src/host/explorer.ts:147 - private elect(...) applies the caps; the name does not say what is elected or why. A name like applyCaps/trimToCaps reads better at this abstraction level.

### N6 - rpc-client collapses non-cancelled RPC error-slot failures into "host unavailable"
src/client/rpc-client.ts:52-54 - a returned RPC error like bad-request (malformed payload) is re-mapped through transportError to internal/'host unavailable', losing the true cause (and only logged to console). ADR-002-compatible, but the client cannot distinguish a payload rejection from a dead transport. Consider preserving bad-request vs transport separately.

### N7 - Two unbounded maps in ExplorerStore
src/client/tabs/explorer/state.ts:77-79 - the seqs map grows one entry per distinct path ever listed and is never pruned; controllers entries are cleared only in abortAll() (:324) on root reset, not after a completed listing. For long-lived docks that open many directories this is unbounded growth. Minor for lite, but consider pruning on completion.

### N8 - Dead locale keys / hardcoded a11y strings
- src/client/tabs/explorer/locales.ts:24-26 keys expand, collapse, openFile are never consumed (TreeNodeRow hardcodes aria-label={expanded ? 'collapse' : 'expand'} at TreeNodeRow.tsx:74), so those dictionary entries are dead and the row labels ignore locale.
- src/client/locales.ts:24-25 keys explorer.label/git.label are defined in the dock namespace but unused - tab labels come from each tab's own namespace via the registry.

---

## Convention / boundary checks (no finding)
- Contract purity (src/contract): verified dependency-free - type-only imports, no Node/DOM/React types, compiles identically in both halves.
- Host never touches React/DOM; client never touches fs/git: host imports only node + dsh host + contract; client imports only contract + dsh client + react. No node:fs / git spawn in client.
- Client talks to the channel only via the facade (rpc-client.ts); no ad-hoc connection.rpc.call in production code.
- ADR-002 error model: domain errors ride SidebarResult in the value slot; genuine cancellation maps to RPC cancelled. Implemented and covered by git-service tests.
- Endpoint vocabulary: ADR-002 lists explorer/list, git/status, git/log; git/stage and git/unstage are added, consistent with ADR-004's in-scope stage/unstage.
- Caps, locale namespaces (betterSidebar.dock|.explorer|.git), slot registration via ctx.slots.inject('shell.overlay', ...) (client/index.ts:68), and the single shell.overlay entry all follow the decisions.
## Fix status (owner pass)

All 8 should-fix items were fixed in the integration pass (commit pending):

- S1 fixed: git-tab clears statusError/logError on success; regression test added (recovery from not-a-repo).
- S2 fixed: ExplorerPanel now receives a ctx.locale-bound translate (tab-def binds and passes t).
- S3 fixed: not-a-repo SidebarError carries the requested root path (mapRunnerError takes root).
- S4 fixed: stage/unstage failures surface in a transient banner via onActionError; regression test added.
- S5 fixed: readlinkBestEffort degrades only on ENOENT; other errors fail the listing.
- S6 fixed: config.ts defaults now single-sourced from contract HOST_DEFAULTS (dead members now consumed).
- S7 fixed: loadList prunes a non-root path on not-found (ADR-004 path-deleted); parent stays expanded.
- S8 fixed: TreeNodeRow renders the stored loadError message beside the inline retry.
- N1 removed CloseIcon; N3 basename centralized in state.ts; N4 ExplorerPanel uses Endpoints.explorerList;
  N5 elect renamed to applyCaps; N6 bad-request maps to param-invalid; N7 controllers pruned after settle;
  N8 caret aria-labels localized (expand/collapse keys now consumed); dead dock-namespace keys removed.
