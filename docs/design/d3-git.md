# D3 — Git Tab: Status & Commits

> Design doc for the **dsh-better-sidebar-lite** git tab. Feeds implementer subagents (host git service, client git tab, tests).
> Companion docs: **D1** (architecture/transport ownership), **D5** (RPC transport contract), **D6** (host services / git exec runner),
> **D7** (client UI), **D8** (tests). RPC vocabulary below is a **proposal**; D5 is authoritative on the final transport shape.

Every git behavior and command below was **empirically verified against `git 2.54` on this machine** during design
(probes captured `--porcelain=v1 -z` raw bytes and `git log` output). Where a format is subtle or historically mis-documented
(the porcelain rename field order), the verified behavior is stated as the contract.

## 1. Scope & goals

The git tab answers two questions for the *current workspace*:

1. **Changes** — what is modified/staged/untracked/index-conflicted right now, grouped, with per-file stage/unstage.
2. **Commits** — recent `HEAD` history, newest first, paged.

### Decision: scope (lite)
- **IN:** view (`changes` + `commits`), manual + event-driven refresh, and **stage / unstage** via git porcelain,
  because they are non-destructive, reversible, and cleanly supported by `git add` / `git restore --staged`.
- **OUT:** discard (destructive, irreversible), commit creation (needs message UI + full `git commit` surface), diff preview,
  amend/rebase/reset, rename write-side.
- `stage`/`unstage` operate on **paths** (the `changes` row). **No** commit action in v1 (a disabled placeholder communicates deferral).

**Decision: diff preview — OUT for v1.** No `git diff` is run in v1. It is a larger surface (multi-file set + caching + a readable renderer)
better treated as a separate v2 deliverable; `GitCommitStat` and a file-diff type are reserved so the data model does not churn later.
The lite tab shows only **status** and **log**.

## 2. Data model (src/contract)

Git types live in `src/contract/git.ts` (dependency-free, JSON-safe — no `Date` across RPC; timestamps are unix seconds).
The porcelain letter is the authoritative low-level datum. We keep the raw index/worktree letters **and** derive grouping on the client
(the letter stays future-proof). `untracked`, `unmerged`, `intentToAdd` are lifted to explicit booleans so grouping predicates are trivial.

```ts
export type GitStateLetter =
  | 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed' | 'unmerged'

export interface GitStatusFileEntry {
  /** Repo-relative path using POSIX '/' separators (even on Windows). */
  path: string
  /** Absolute path (host-computed, informational; reserved for open-in-editor later). */
  absolutePath: string
  /** Index delta letter, or null when unmodified in the index. */
  index: GitStateLetter | null
  /** Worktree delta letter, or null when unmodified in the worktree. */
  worktree: GitStateLetter | null
  /** True when this entry is untracked (porcelain '??'). */
  untracked: boolean
  /** True when untracked AND collapsed to a directory (porcelain shows 'dir/'). Trailing '/' already stripped. */
  untrackedDirectory: boolean
  /** Rename/copy source path, present when index or worktree is 'renamed'/'copied'. */
  originalPath?: string
  /** True when in a conflicted/unmerged state (any of UU/UD/DU/AA/DD). */
  unmerged: boolean
  /** True when intent-to-add; lite reserves, never true in v1 (file, not dir). */
  intentToAdd: boolean
}
```

**Parsing rule — a file may appear in BOTH index and worktree states** (e.g. `MM`). The entry is a **single flat row** with independent
`index`/`worktree` letters; grouping may place it in two groups. Null means "clean in that column", never "unknown".

```ts
export type GitChangeGroup = 'staged' | 'unmerged' | 'unstaged' | 'untracked'

export interface GitStatusResult {
  /** Repository root (absolute, host-normalized). */
  repositoryRoot: string
  /** Current branch name, or null when HEAD is detached. */
  branch: string | null
  /** Flat changed entries (safe to render directly). */
  entries: GitStatusFileEntry[]
  stagedCount: number; unstagedCount: number; untrackedCount: number; unmergedCount: number
}

export function gitGroupOf(entry: GitStatusFileEntry): readonly GitChangeGroup[] {
  const out: GitChangeGroup[] = []
  if (entry.unmerged) out.push('unmerged')
  if (!entry.untracked && entry.index !== null) out.push('staged')
  if (!entry.untracked && entry.worktree !== null) out.push('unstaged')
  if (entry.untracked) out.push('untracked')
  return out
}
```

Edge cases the model must handle (parser contract in §5 guarantees these):
- `MM` → `index:modified`, `worktree:modified` → staged + unstaged.
- `AM` (new file staged then edited) → staged + unstaged.
- `D  f` → staged delete only (`worktree:null`). ` D f` → unstaged delete only.
- `UU path` → `unmerged:true`, `index:null`, `worktree:null` (conflict group only).
- `?? dir/` → `untracked:true`, `untrackedDirectory:true`, path `dir` (slash stripped).
- `R  dest` + continuation `orig` → `index:renamed`, `path: dest`, `originalPath: orig`.
- Ignored files (`!!`) are **not requested** in v1 (`--ignored` omitted).
### 2.3 Commit summary

```ts
export interface GitCommitSummary {
  /** Full 40-char (or 64-char sha256) hash. */
  hash: string
  /** Abbreviated hash as git reports it (default ~7+ chars). */
  shortHash: string
  /** First line of the commit message (never contains newlines). */
  subject: string
  authorName: string
  /** Null when the commit has no author email. */
  authorEmail: string | null
  /** Unix seconds. Convert to Date on the client for rendering. */
  authorTimestamp: number
  /** Parent count: 0 = root, 1 = normal, 2 = merge (>2 uncommon). */
  parents: number
}

export interface GitLogResult {
  /** Page of commits, newest first. */
  commits: GitCommitSummary[]
  /** True when more commits exist beyond this page (server requests limit+1). */
  hasMore: boolean
  /** Total commits analyzed so far (informational). */
  analyzed: number
}
```

**Decision: no per-commit stats in v1** (no `%numstat` / `--shortstat`). `GitCommitStat` is reserved but not emitted. `parents` is kept (drives a merge badge at zero cost).

## 3. Views

### 3.1 Changes tab — sections (in order, each omitted when count = 0)
1. **Index** (staged) — staged group.
2. **Conflicts** (unmerged) — unmerged group; force-rendered with a distinct error background when non-empty.
3. **Changes** (unstaged) — unstaged group.
4. **Untracked** — untracked group.

Each section header shows `<count> <title>` and an inline stage-all/unstage-all button when non-empty (maps to per-path calls, section 4).

Row content (per entry, in each group where it renders — a `MM` row renders in both staged and unstaged):

    [glyph] [filename: bold last segment; dimmed parent dir]   [action buttons on hover/focus]

- Glyph: small inline SVG or text letter per `GitStateLetter` (`icons.tsx`). Colors: added=green, modified=amber, deleted=red, renamed=cyan, unmerged=red-bold, untracked=muted.
- Filename: last segment bold, preceding segments dimmed; full path in `title` and `aria-label`.
- Action buttons per row: `stage` (when worktree delta) and `unstage` (when index delta). A `MM` shows both.
- Empty state: "No changes — the working tree is clean." (branch name shown).
- Not-a-repo / missing-git: full-tab error surface (section 6), not per-section.
- Row click (open file) is out of scope; rows are not links in v1 (no editor binding yet).

### 3.2 Commits tab
- Fixed-height list of `GitCommitSummary`, newest first.
- Row: `shortHash` (monospace) + merge badge when `parents > 1` + `subject` (1–2 lines, ellipsized) + `authorName` + **relative time**; absolute date in `title` and `<time dateTime>`.
- **Decision: paged, not infinite-scroll.** Initial page = config `maxLogEntries` (default **50**). A **Load more** button renders when `hasMore`, appending the next page (offset += page).
- Empty state: "No commits yet." (fresh repo). No commit selection/detail in v1.

## 4. Actions scope (the lite line)

### Decision: view + refresh + **stage / unstage**; **discard OUT**; **commit creation OUT**
- **Stage / unstage — IN.** Non-destructive, reversible, 1:1 to clean porcelain: stage = `git add -u <p>` (tracked, incl. deletions) or `git add <p>` (untracked); unstage = `git restore --staged <p>` (git >= 2.23; revertible by re-adding). Small RPC surface (`git/stage`, `git/unstage` over paths).
- **Discard — OUT (destructive).** `git restore <p>` / `git checkout --` destroys worktree changes unrecoverably. Needs a confirm dialog and undo safety — disproportionate for v1. Deferred; no disabled button.
- **Commit creation — OUT.** Needs a message composer, author/config gaps, pre-commit hooks. The tab registry can later add a commit tab without touching this model.

| Action | In v1? | git command | Note |
|--------|--------|-------------|------|
| Refresh | yes | re-run status/log | no dedicated endpoint |
| Stage files | yes | `git add -u <p>` (tracked) / `git add <p>` (untracked) | use NEW path for renames |
| Unstage files | yes | `git restore --staged <p>` | use NEW path for renames |
| Stage all | yes | `git add -u` + `git add <untracked>` | section button |
| Unstage all | yes | `git restore --staged` per staged path | section button |
| Discard | no | - | destructive |
| Commit | no | - | deferred |

For a rename (index `R`), the path passed to stage/unstage is the **new/dest path** (git takes dest as identity). Re-stage of a rename is `git add -u dest`.

**Stale-state guard:** stage/unstage returns the **fresh full `GitStatusResult`** (server re-runs status) so the UI replaces state atomically — no client reconciliation. The client drops responses older than the latest request (section 8).
## 5. Git execution & the porcelain parser contract (exact)

### 5.1 Runner responsibility (interface; execution implementation lives in D6)

```ts
// src/contract/git-runner.ts
export interface GitRunner {
  /** Run git with fixed args in cwd. Resolves stdout, rejects with GitError. */
  run(root: string, args: readonly string[], opts?: { signal?: AbortSignal; timeoutMs?: number }): Promise<string>
}
```

- Implementation uses Node `child_process.execFile('git', args, { cwd: root })` (NO shell), with `timeoutMs` -> kill + reject `git-timeout`; with `AbortSignal` -> kill + reject `cancelled`; on `execFile` error with `err.code === 'ENOENT'` -> reject `git-not-found`. Windows: git resolves via PATH (present, 2.54).
- Paths are passed as separate argv entries (no shell interpolation), so leading-`-` filenames cannot be misread. Paths are repo-relative and absolute-safe because the host validates the root first (section 6).

### 5.2 Repo detection
```
git -C <root> rev-parse --is-inside-work-tree
```
- Inside repo: stdout `true`, exit 0 -> proceed.
- Not a repo: stderr `fatal: not a git repository (or any of the parent directories): .git`, exit 128 -> `GitError { code: 'not-a-repository', root }`. Detection uses exit code / `true` output only, never error-text parsing.
- This is the authoritative not-a-repo gate.

### 5.3 Branch (part of status)
```
git -C <root> symbolic-ref --short -q HEAD
```
- On a branch: stdout = branch name, exit 0. Detached HEAD: empty stdout, non-zero -> `branch: null`.

### 5.4 Status porcelain — the definitive `-z` parser contract
```
git -C <root> status --porcelain=v1 --untracked-files=normal --detect-renames -z
```
- `--porcelain=v1`: pin v1; `-z` -> NUL-terminated records, no quoting/padding.
- `--untracked-files=normal` (default): **collapses an untracked directory into one record** `?? dir/` (trailing slash signals a dir). Decision: keep collapsed for v1 (bounded list).
- `--detect-renames` (`-M`): force rename/copy detection regardless of user `status.renames` config for deterministic output and rename rendering.
- Parse stdout **as raw bytes, split on NUL (0x00)**, not on lines. Records are NUL-terminated; drop a trailing empty record.

Record grammar:
```
<record>  ::= <status-record> | <rename-continuation>
<status-record> ::= <XY> <space> <path>
<XY>      ::= <X-letter> <Y-letter>
<X-letter> ::= ' ' | 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?'
<Y-letter> ::= ' ' | 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?'
<space>   ::= 0x20 (only when the header is present)
<path>    ::= bytes, POSIX '/' separators, may contain spaces; NUL ends the record
<rename-continuation> ::= <path>   // bare path — NO '->' prefix in -z mode
```

**Verified rename field order (the gotcha).** For a rename/copy, `--porcelain=v1 -z` emits **TWO NUL records in DEST-THEN-SOURCE order**, contradicting the plain (non-`-z`) form. Empirically verified on git 2.54:

- plain: `R  aaa_src.txt -> zzz_dst.txt`   (source, then dest)
- `-z`:   `R  zzz_dst.txt<NUL>aaa_src.txt<NUL>`   (header + **dest**, then bare **source**)

So an 'R'/'C' in the X or Y column means: the current record path (with header) is the **destination**, and the **immediately following bare record** is the **source**. Parser must consume the continuation to build `{ path: dest, originalPath: src }`.

Parser exact contract:
```ts
export function parsePorcelainStatusZ(stdout: Uint8Array): { entries: GitStatusFileEntry[] }
// split on NUL -> records; for each record (skip a trailing empty record):
//   if len >= 3 and record[0] and record[1] are status letters and record[2] === 0x20 ->
//     XY = [record[0], record[1]]; path = record.slice(3)
//     untracked when X === '?' && Y === '?': untracked = true; untrackedDirectory = path.endsWith('/'); path = stripSlash(path)
//     unmerged when X === 'U' || Y === 'U' (UU/UD/DU/AA/DD): unmerged = true; index = worktree = null
//     if X or Y is 'R' or 'C': consume the NEXT record as originalPath (rename/copy dest-first pair)
//     index = X === ' ' ? null : LETTER_MAP[X]; worktree = Y === ' ' ? null : LETTER_MAP[Y]
//   else if a bare path AND we are expecting a rename continuation -> it was already consumed; skip
//   else -> log and continue (never crash on a malformed record)
```

LETTER_MAP: 'A'->added, 'M'->modified, 'D'->deleted, 'R'->renamed, 'C'->copied, 'T'->type-changed, 'U'->unmerged.

| XY | index | worktree | flags |
|----|-------|----------|-------|
| `??` | null | null | untracked:true; untrackedDirectory if path ends '/' |
| `A ` | added | null | staged new |
| `M ` | modified | null | staged |
| ` M` | null | modified | unstaged |
| `MM` | modified | modified | staged + unstaged |
| `D ` | deleted | null | staged delete |
| ` D` | null | deleted | unstaged delete |
| `R `/`RR` | renamed | (per column) | + originalPath via dest-first pair |
| `C `/`CC` | copied | (per column) | + originalPath via dest-first pair |
| `T `/`TT` | type-changed | (per column) | - |
| `UU`/`UD`/`DU`/`AA`/`DD` | null | null | unmerged:true |

Worktree letter 'A'-in-Y appears only for intent-to-add; ignore for v1. Unknown combos -> index/worktree null, keep path, log.

### 5.5 Log (paged)
```
git -C <root> log -n <limit+1> --skip=<offset> --pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%s
```
- One commit per output LINE (git adds LF after each `format:` entry). Parse: split stdout on LF, drop a final empty line, split each line on `%x1f` (0x1F unit separator) into 7 fields: H, h, an, ae, at, P, s.
- `%s` = subject = FIRST LINE of the message, so it never contains LF — line-splitting is safe. `%an`/`%ae` may contain spaces (fine) but not LF.
- `parents` = number of space-separated tokens in `%P` (0/1/2+).
- `authorEmail` empty string -> null.
- **Paging:** request `limit+1`; if `limit+1` records returned, drop the (limit+1)-th and set `hasMore:true`; else `hasMore:false`. Client offset advances by `limit` (not limit+1) so pages align. Merges included. No `--name-only`.
- **Pagination: offset-based, server-stateless.** Deterministic under a stable refset; the client invalidates its commit view on refresh (section 8).

## 6. Error states -> typed codes -> UI

### 6.1 Typed error union (src/contract/git-rpc.ts)
```ts
export type GitErrorCode =
  | 'not-a-repository' // rev-parse failed: root is not inside a git work tree
  | 'git-not-found'    // execFile('git') rejected with ENOENT
  | 'git-timeout'      // command exceeded the gitTimeoutMs config
  | 'invalid-path'     // root failed validation (not absolute / not a dir / outside allowlist)
  | 'bad-arg'          // payload rejected before invoking git (empty/weird path)
  | 'internal'         // unexpected (parse assumption broke, etc.)

export interface GitError {
  code: GitErrorCode
  /** Human-readable; no absolute paths or boundary secrets embedded. */
  message: string
  root?: string   // offending root for invalid-path / not-a-repository
  path?: string   // specific path rejected for invalid-path / bad-arg
}
```
### 6.2 Transport mapping (proposal — D5 finalizes)

The generic RPC handler must return dsh `RpcResult` whose error branch uses the **closed** `RpcErrorCode` union; we cannot mint new codes into it. To keep our typed `GitError` end-to-end, recommend a **nested envelope in the success value**:

```ts
// Host handler returns RpcResult<GitRpcEnvelope<T>> — always ok:true at the transport level.
export type GitRpcEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: GitError }
```
- The dsh `RpcResult.ok` slot is reserved for transport-level failures (auth, cancellation, connection). Domain errors ride the `value` as `GitRpcEnvelope`, so `GitError.code` narrows via `switch` on both sides.
- *Flag for D5:* if D5 prefers folding our codes into dsh `RpcError` (e.g. via `internal` + extended details), only the transport seam changes; the `GitError` union in section 6.1 stays the stable contract.

### 6.3 Per-code UI behavior
| Code | UI |
|------|----|
| `not-a-repository` | Full-tab empty state: "Not a Git repository" + root path (dimmed) + Refresh retry. Non-fatal. |
| `git-not-found` | Full-tab error: "Git not found on PATH" + Refresh retry. |
| `git-timeout` | Banner/error on current tab + Retry. |
| `invalid-path` | Full-tab error: rejected root + Refresh. |
| `bad-arg` | Row-level/transient; show on the affected action; recover by re-running status. |
| `internal` | Generic error surface + Refresh; log details to console. |

All error surfaces include a Refresh affordance and never blank the shell. Loading state per tab is a lightweight spinner; switching tabs cancels in-flight requests.

## 7. Refresh triggers

### Decision: manual + tab activation + workspace change. No polling.
- **Manual:** Refresh button in each tab header (always visible).
- **On tab activation:** when the git tab becomes active, re-request `status` (cheap) and, if stale/empty, `log`. Covers out-of-band file edits without a timer.
- **On workspace change:** the client derives the workspace root from the active session/workspaces state (`WorkspaceView.path`). When that root changes, invalidate cached status/log and re-request for the new root. Also refresh when a workspaces/session list change alters the derived root.
- **No polling.** No timers; avoids background RPC churn and stale partials. (A future fs-watch mode is out of scope.)
- **Post-action refresh:** after stage/unstage, the fresh status comes back in the response; no extra fetch.

## 8. Concurrency & stale-response guard (coordinated with D5)
- Every `git/status`, `git/log`, `git/stage`, `git/unstage` RPC carries the current `root` and a client-minted **epoch/requestId**.
- The client keeps the latest in-flight epoch per query kind; a response older than the current epoch is **dropped**. A stage/unstage response carries its own epoch and replaces ALL cached git state atomically.
- On refresh/root change, bump the epoch for both status and log.

## 9. Accessibility & list rendering
- **Long paths / ellipsis:** filename cell uses `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0` inside a flex row with `flex:1 1 auto; width:0` so the action-button cluster never pushes a path off-canvas. Full path in `title` AND `aria-label`.
- **Last-segment emphasis:** render the final path segment in a bold span, parent dir(s) dimmed inline, ellipsized.
- **Per-row actions:** real `<button>` with accessible name from the path, e.g. `aria-label="Stage src/lib/mod.ts"`. Cluster shows on hover/focus.
- **Status glyph:** decorative `aria-hidden` SVG/text; an additional visually-hidden span carries the state word for screen readers.
- **Sections:** each group is a `<section>` with `aria-labelledby` header; conflicts section uses a distinct background and a role=alert-style notice.
- **Commits:** `<time dateTime={iso} title={absolute}>` renders relative text; hash in a monospaced span; merge commit badge.
- **Keyboard:** rows/buttons tab-focusable; loading/error regions `aria-live="polite"`.
- **Not virtualized (lite).** Bound sizes: untracked dirs collapsed (section 5); a config `maxStatusEntries` cap (default 1000) truncates with a shown overflow note.
- Keep original path byte order; ellipsis truncates the tail after the last segment so the usable filename stays visible.

## 10. File layout (planned additions under src)

```
src/contract/
  git.ts          // GitStatusFileEntry, GitStatusResult, gitGroupOf, GitCommitSummary, GitLogResult
  git-rpc.ts      // GitRpcEnvelope, GitError, GitErrorCode + endpoint payload/result types
  git-runner.ts   // GitRunner interface only (impl in host via D6)
src/host/
  git/
    repo.ts       // isWorkTree(root) via rev-parse; branch via symbolic-ref
    status.ts     // runStatus(root) + parsePorcelainStatusZ(...)
    log.ts        // runLog(root, {limit, offset}) + parseLog(...)
    actions.ts    // stagePaths(root, paths), unstagePaths(root, paths)
    errors.ts     // map execFile/ENOENT/timeout -> GitError (D6 owns low-level map)
  services/git.ts // orchestration used by the RPC handler (D6)
src/client/
  git/
    ChangesTab.tsx  // grouped changes list
    CommitsTab.tsx  // paged commits list
    GitTab.tsx      // tab switcher (changes|commits) inside the git tab (or D4 owns tabs)
    useGitRpc.ts    // client hook: unwrap RpcResult<GitRpcEnvelope>, epoch guard
    gitModel.ts     // groupBy(gitStatusResult) -> sections; counts
    git.module.css
    icons.tsx       // GitGlyph + status glyphs (inline SVG)
  locales.ts        // en + zh dictionary for the git tab namespace
```

**Endpoint vocabulary proposal (pending D5):** `git/status`, `git/log`, `git/stage`, `git/unstage`. Payload/result types in `src/contract/git-rpc.ts`.

## 11. Approved defaults (config finalized by D6 with cordis Schema)
- `gitTimeoutMs` default **8000**.
- `maxLogEntries` (page size) default **50**.
- `maxStatusEntries` render cap default **1000** (truncate + overflow note).
- Untracked collapse ON (no per-file untracked expansion in v1).
- `allowedRoots` allowlist reconciles with D6 path safety; when unset, any absolute directory the host can read is allowed (trust boundary = `authority: loopback`).

## 12. Open questions

1. **Transport:** confirm the nested `GitRpcEnvelope` scheme (section 6.2) vs. folding our codes into dsh `RpcError`. D5 decides; the `GitError` union is stable either way.
2. **Root selection source:** confirm the exact workspace-root source (active session workspace `path` vs. `recentWorkspaceId`). The workspace-change refresh trigger depends on it (D1/D7).
3. **Offset paging drift:** deterministic only under a stable refset; new commits between pages can re-read. Acceptable for lite (invalidate on refresh); confirm D5 client-invalidation rule.
4. **`--detect-renames` cost:** on very large repos rename detection over the worktree can be slow. If heavy in practice, fall back to `--no-renames` (delete+add) keeping the parser rename branch for the future. Implementation note, not a blocker.
5. **Rename row dual-group (`RR`) rendering:** default is per-column (stage worktree via dest, unstage index via dest). Confirm D7 wants a single row or split glyphs.

**No further open questions.**
