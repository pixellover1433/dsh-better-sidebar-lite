# D6 — Host Services: Explorer & Git Implementation Design

> Assignee: design subagent D6. Feeds the implementer subagent(s) for the host half
> (src/host/**) of lite. Self-sufficient: an implementer who reads
> only this file + the architecture brief can build the host services and their tests.
>
> Companion docs: docs/architecture-brief.md (source of truth), docs/design/d1-architecture.md,
> docs/design/d5-transport-contract.md. This doc owns the HOST-SIDE implementation design of those
> contracts: how the explorer listing and the git status/log are produced, parsed, error-mapped.

---

## 1. Scope and decisions at a glance

This doc resolves topic D6 (host services). It does NOT design the tree model, the client UI, or the
transport vocabulary (those are D2/D7/D5).

| # | Question | Decision |
|---|----------|----------|
| 1 | Explorer listing primitive | node:fs/promises.readdir(dir, { withFileTypes: true }) |
| 2 | Symlink policy | Report a symlink entry as its own kind; do NOT follow for dir/file type detection; visible by default (only .git / node_modules hidden). |
| 3 | Hidden-file policy | Hide ONLY the configured hidePatterns basenames (default [.git, node_modules]). No .gitignore semantics (that is git's job, surfaced via the git tab). Dotfiles other than .git are shown. |
| 4 | Sorting | Directories first, then files; each group name-sorted locale-aware (Intl.Collator). Symlink-to-dir sorts with files (we do not follow). |
| 5 | Caps | maxEntriesPerListing=2000 (config); exceeding sets truncated:true and drops the name-sorted tail. Cumulative path-length guard per listing (section 4.5). |
| 6 | Root validation | Absolute required; if allowedRoots configured & non-empty, root MUST be inside one (case-insensitive on Windows). Otherwise any absolute existing dir the host can read is allowed (trust boundary + authority:loopback fence). |
| 7 | FS error mapping | ENOENT->not-found, EACCES->permission-denied, ENOTDIR->not-directory, ELOOP->symlink-loop, else->internal (typed codes in our contract, 3.6). |
| 8 | Git runner | child_process.execFile(git, args, { cwd, timeout, signal, env }) — no shell. Configurable executable name (tests point it at scripted real git). |
| 9 | git status | git status --porcelain=v1 -z --untracked-files=all (section 5.3 for huge-tree rationale + config override). |
| 10 | git log | git log -n <cap> --format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e — %x1f/%x1e verified on git 2.54 (since >=1.8.5). |
| 11 | Rename parsing | porcelain -z rename is XY<space>newPath<NUL>origPath<NUL> — new path first, then original (verified, 5.3). |
| 12 | Response grouping | status value carries staged, unstaged, untracked, conflicted arrays (3.4) plus truncated. |
| 13 | Transport error shape | Because dsh RpcError is a CLOSED union (2.2), typed codes CANNOT ride the RPC error slot. The RPC value slot carries a module-level SidebarResult<T> whose error discriminates our typed codes. Pure transport cancellation maps to the RPC error slot (code cancelled). |
| 14 | Service classes | ExplorerService, GitService are plain TS classes with constructor-injected deps (path ops, git exec fn). Cordis-free, so directly unit-testable. |
| 15 | Plugin wiring | src/host/index.ts: Config (schemastery), inject=['connection'], lazy ctx.inject(['connection'], ...) -> rpc.handle('/better-sidebar', dispatch, { authority:'loopback' }), wrapped in ctx.effect disposers. |

---

## 2. Verified dsh facts this design builds on

### 2.1 RPC host contract (read: packages/client/connection/src/rpc.ts, src/rpc-host.ts, tests/node-half.host.spec.ts)

- Host: ctx.connection.rpc.handle(channel, handler, { authority }) -> () => Promise<void> disposer.
- handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>.
- Channel must match /^\/[A-Za-z0-9._~-]+$/ (/better-sidebar is valid). Endpoint = path segments after channel, each matching /^[A-Za-z0-9_$.-]+$/; multi-segment endpoints work (explorer/list).
- request.signal: the carrier passes the fetch Request signal through; abort cancels handler work (rpcFetchHandler calls handler(endpoint, payload, request.signal)).
- Client: ctx.connection.rpc.call(channel, endpoint, payload, signal?) => Promise<RpcResult<unknown>> (packages/client/connection/src/client/rpc.ts).
- Gateway reference pattern (packages/api/gateway/src/index.ts:104): ctx.inject(['connection'], (connectionCtx) => { ... rpc.handle(...) }).

### 2.2 CRITICAL constraint: dsh RpcError is a CLOSED union

- RpcError = distributive union over the FIXED RpcErrorDetailsMap keys (packages/host/apiproxy/src/api/rpc.ts). RpcErrorCode is closed; no extensible branch for arbitrary plugin codes.
- The client parses host responses with serverResponseSchema -> rpcErrorSchema (a discriminatedUnion('code', [...]) of exactly those fixed branches) and calls serverResponseSchema.parse(...) (packages/client/connection/src/client/rpc.ts). If the host returns an error code absent from that union, the client .parse() THROWS and the typed error is lost.
- Consequence (Decision 13): our typed error codes MUST NOT go in the RPC error.code. They travel inside the RPC success value slot, as the error branch of a module-level SidebarResult<T> (a closed union, 3.6). Where a failure is genuinely a transport cancellation, we DO map to the RPC error slot as code:'cancelled'.
- This is the single most important discovery of this doc; D5 (transport) must agree. If D5 chose plugin codes on the RPC error slot, D6 OVERRIDES it.

### 2.3 dsh already models directory listings — reuse the shape, not the service

- DirectoryEntry { name, path, hidden } and DirectoryListing (packages/host/apiproxy/src/api/host.ts, packages/host/directory-picker/src/index.ts).
- dsh directoryPicker browse backend already does one-level listing with truncated and a closed error code directory-unreadable.
- Decision: for the explorer tab we do NOT depend on directoryPicker (brief mandates self-contained node:fs/promises; lite keeps surface minimal). We MIRROR the DirectoryEntry/DirectoryListing conventions (absolute path never joined by client, hidden boolean, truncated) so our semantics align with dsh's browsing UI.

### 2.4 Host plugin config pattern

- packages/client/connection/src/index.ts: import z from '@deepseek-ai/schemastery'; export interface ConnectionConfig {...}; export const Config: z<ConnectionConfig> = z.object({...}); export const inject = ['webServer']; export function apply(ctx: Context, config?: ConnectionConfig): void.
- We mirror exactly: export const Config: z<BetterSidebarConfig> = z.object({...}) with defaults applied by the Loader.

### 2.5 Environment (verified)

- git 2.54.0.windows.1 on this machine; %x1f/%x1e format escapes work (verified live, 5.3); porcelain -z record layout verified live (5.3).
- Node v24: readdir withFileTypes returns Dirent[]; execFile accepts { signal } (AbortSignal, Node >=15.6).
- Junctioned packages available: @deepseek-ai/schemastery, @deepseek-ai/dsh-host-apiproxy, @deepseek-ai/dsh-client-connection.

---

## 3. Contract types (src/contract)

All transport payload types live in src/contract (shared, dependency-free, importable from both halves). D5 owns the envelope; this doc fixes the VALUES those endpoints carry.

/* src/contract/explorer.ts */
interface ExplorerEntry {
  /** Base name shown in the tree row. */
  name: string
  /** Absolute host path (client never joins). */
  path: string
  /** Derived kind for rendering + lazy-load. Symlinks NOT followed (4.3). */
  kind: 'file' | 'directory' | 'symlink'
  /** True when basename matches a hidePattern. Client still decides visibility. */
  hidden: boolean
  /** Present when kind==='symlink'; the link target verbatim (never resolved). */
  linkTarget?: string
}
interface ExplorerListRequest { path: string }
interface ExplorerListResult {
  path: string          /* echo */
  entries: ExplorerEntry[]
  truncated: boolean    /* cut at maxEntriesPerListing (name-sorted tail absent) */
}

/* src/contract/git.ts */
interface GitStatusEntry {
  xy: string            /* porcelain XY pair, e.g. ' M','??','R ' */
  path: string          /* path as git reported (repo-relative by default; D5 picks orientation) */
  originalPath?: string /* renames/copies (R|C) */
  submodule?: boolean   /* x==='S'||y==='S' */
  staged: boolean
  unstaged: boolean
  untracked: boolean
  conflicted: boolean
}
interface GitStatusResult {
  staged: GitStatusEntry[]
  unstaged: GitStatusEntry[]
  untracked: GitStatusEntry[]
  conflicted: GitStatusEntry[]
  truncated: boolean
  head?: string
}
interface GitLogRequest { path: string; limit?: number }
interface GitLogEntry {
  hash: string          /* full */
  shortHash: string     /* 7-char */
  authorName: string
  authorEmail: string
  authoredAtISO: string /* author date, strict ISO from %aI */
  subject: string
}
interface GitLogResult { entries: GitLogEntry[]; head?: string; truncated: boolean }
type GitStatusRequest = { path: string }

### 3.6 Contract error model (side-safe)

/* src/contract/error.ts — OUR closed, transport-safe result union. */
/* MUST NOT be placed in the RPC error.code slot (dsh RpcError is closed; 2.2). */
type SidebarError =
  | { code: 'not-found';            message: string; path: string }
  | { code: 'permission-denied';    message: string; path: string }
  | { code: 'not-directory';        message: string; path: string }
  | { code: 'symlink-loop';         message: string; path: string }
  | { code: 'path-too-long';        message: string; path: string }
  | { code: 'invalid-root';         message: string; path: string }
  | { code: 'outside-allowed-root'; message: string; path: string }
  | { code: 'git-missing';          message: string }
  | { code: 'not-a-repo';           message: string; path: string }
  | { code: 'git-failed';           message: string; stderrTail: string }
  | { code: 'timeout';              message: string; command: 'status'|'log' }
  | { code: 'cancelled';            message: string }
  | { code: 'param-invalid';        message: string }
  | { code: 'internal';             message: string }
type SidebarErrorCode = SidebarError['code']
type SidebarResult<T> = { ok: true; value: T } | { ok: false; error: SidebarError }

> RPC mapping rule (Decision 13):
> - caller aborted (SidebarError.cancelled) -> return RPC error branch { code:'cancelled' }.
> - any other failure -> ALWAYS succeed at the RPC layer (ok:true) and carry the SidebarResult in
>   value, so the client's single closed serverResponseSchema.parse never throws and always finds
>   the typed error.
> This mirrors dsh: business methods never throw business errors; the RPC value IS the result.

---

## 4. ExplorerService (src/host/explorer.ts)

One sentence: list one directory level from an absolute host path with type-safe symlink handling,
sorting, hiding, caps, root-guarded validation.

### 4.1 Consumed interface (src/host/port-fs.ts)

import type { Dirent, Stats } from 'node:fs'
interface FsPort {
  readdir(path: string, opts: { withFileTypes: true }): Promise<Dirent[]>
  stat(path: string, opts?: { throwIfNoEntry?: false }): Promise<Stats | undefined>
  readlink(path: string): Promise<string>
  realpath(path: string): Promise<string>
  isAbsolute(path: string): boolean
  resolve(...parts: string[]): string
  sep: string
  isInside(child: string, base: string): boolean  /* OS-aware containment */
}

Constructor injection: new ExplorerService(fs: FsPort, opts: {...}). No cordis/cwd globals — the real
adapter fs-node.ts wraps node:fs/promises + node:path; tests inject an in-memory fake or a
temp-dir-backed adapter.

### 4.2 Public API

export class ExplorerService {
  constructor(
    private fs: FsPort,
    private opts: {
      maxEntries: number             /* default 2000 */
      hidePatterns: readonly string[]/* default ['.git','node_modules'] */
      collator?: Intl.Collator       /* default new Intl.Collator(undefined,{sensitivity:'base'}) */
    },
  ) {}
  list(request: ExplorerListRequest): Promise<ExplorerListResult>
}

### 4.3 Algorithm

1. Validate root (assertListableRoot, 4.6). Reject before IO: param-invalid if not absolute;
   not-found/not-directory/permission-denied from stat; outside-allowed-root when allowedRoots set.
2. readdir with { withFileTypes: true }.
3. Map each Dirent:
   - isDirectory() -> kind:'directory'
   - isFile() -> kind:'file'
   - isSymbolicLink() -> kind:'symlink', linkTarget=readlink verbatim (NEVER resolved)
   - other (fifo/socket/block/char) -> kind:'file' (inert)
   - hidden = opts.hidePatterns.includes(basename)
4. Sort (compareEntries): kind==='directory' before others; within group collator.compare(a.name,b.name);
   path as final tie-break.
5. Cap: if sorted.length > maxEntries, slice to maxEntries, truncated=true.
6. Cumulative length guard (4.5): while emitting, accumulate name.length+path.length; over budget, stop,
   truncated=true.
7. Return ExplorerListResult.

### 4.4 Entry-shape mapping table

| Dirent predicate | kind | lazy in tree | sort group | linkTarget |
|---|---|---|---|---|
| isDirectory() | directory | yes | dirs | - |
| isFile() | file | no | files | - |
| isSymbolicLink() | symlink | no (v1) | files | readlink (unresolved) |
| other | file (inert) | no | files | - |

Symlink policy (Decision 2): never stat a symlink for type detection (can loop). Symlinks are leaves in
v1; rendering shows an indicator. (Expansion is an Open question.)

### 4.5 Caps and guards (constants)

const HOST_DEFAULTS = {
  maxEntriesPerListing: 2000,       /* per-level cap */
  maxLogEntries: 100,               /* git log -n cap */
  maxStatusEntries: 20000,          /* status cap */
  maxRequestPathLength: 4096,       /* reject implausibly long payload paths pre-fs */
  totalListingPathBytes: 1024 * 1024, /* cumulative name+path guard */
} as const

Early reject: request.path.length > maxRequestPathLength -> param-invalid, before fs.

### 4.6 Root validation + allowedRoots

function assertListableRoot(fs: FsPort, candidate: string, allowedRoots: readonly string[]|undefined): string {
  if (!fs.isAbsolute(candidate)) throw S('param-invalid', 'path must be absolute', { path: candidate })
  if (candidate.length > HOST_DEFAULTS.maxRequestPathLength) throw S('param-invalid', 'path too long', { path: candidate })
  const root = fs.resolve(candidate)                      /* resolve once ('.','..', redundant sep) */
  if (allowedRoots !== undefined && allowedRoots.length > 0) {
    const inside = allowedRoots.some(base => fs.isInside(root, base))
    if (!inside) throw S('outside-allowed-root', root + ' is outside configured allowed roots', { path: root })
  }
  /* allowedRoots validated absolute at Config load (section 6); here containment only. */
  const st = await fs.stat(root, { throwIfNoEntry: false })
  if (st === undefined) throw S('not-found', 'path does not exist', { path: root })
  if (!st.isDirectory()) throw S('not-directory', 'expected a directory', { path: root })
  return root
}

Case-insensitive containment (Decision 6): FsPort.isInside is OS-aware. Windows: compare
child.toLowerCase() prefix against base.toLowerCase(). Rule: child===base OR
child.toLowerCase().startsWith(base.toLowerCase() + baseSep). POSIX: exact case. The real adapter
normalizes separators first. Tests run on win32 to cover case folding.

### 4.7 FS error -> SidebarError map

function mapFSError(err: unknown, path: string): SidebarError {
  const e = err as NodeJS.ErrnoException
  switch (e.code) {
    case 'ENOENT': return S('not-found', e.message, { path })
    case 'EACCES':
    case 'EPERM':  return S('permission-denied', e.message, { path })
    case 'ENOTDIR': return S('not-directory', e.message, { path })
    case 'ELOOP':  return S('symlink-loop', e.message, { path })
    default:       return S('internal', e?.message ?? String(err))
  }
}

---

## 5. GitService + runner (src/host/git.ts, src/host/git-runner.ts)

One-sentence jobs: run git fixed-args, timeout+abort-aware, shell-free and return typed results
(git-runner.ts); translate into status/log models (git.ts).

### 5.1 GitRunner (the execFile wrapper)

export interface GitRunnerOptions { executable?: string; timeoutMs: number }
export type RunGitOk = { ok: true; stdout: Buffer; stderr: string }
export type RunGitResult =
  | RunGitOk
  | { ok: false; kind:'git-missing'|'timeout'|'not-a-repo'|'cancelled'|'git-failed'; message: string; stderrTail?: string }
export class GitRunner { constructor(opts: GitRunnerOptions) {} run(args: string[], cwd: string, signal?: AbortSignal): Promise<RunGitResult> }

Real implementation (promisified):
  execFile(executable, args, {
    cwd, env: { ...process.env }, timeout: opts.timeoutMs, signal, maxBuffer: 16*1024*1024,
  }, callback)
Wrap in a promise; classify (5.2).

- Fixed args, no shell: args built as string[] literals; never shell-interpolate user text.
- env passthrough is a single seam (env factory) so a future security review can narrow it.

### 5.2 Error classification (order matters)

function classify(err, stderr, externalAborted): RunGitResult {
  if (externalAborted) return { ok:false, kind:'cancelled' }
  if (isAbortError(err)) return { ok:false, kind:'cancelled' }
  if (e.code==='ENOENT' || e.code==='EACCES' || /git: not found/i) return { ok:false, kind:'git-missing' }
  if (isTimeoutError(err) || e.killed===true) return { ok:false, kind:'timeout' }
  if (isExitError(err) && /not a git repository/i.test(stderr)) return { ok:false, kind:'not-a-repo' }
  return { ok:false, kind:'git-failed', stderrTail: tail(stderr) }
}

- Timeout vs abort: external signal aborts -> cancelled (not user-visible; tab closed/refresh
  superseded). Config timeoutMs expires with no external abort -> timeout. Track externalAborted by
  wiring signal.addEventListener('abort',...) in the executor; execFile errors for both are
  AbortError/killed:true, so the flag is the reliable distinguisher.
- stderr tail capped at STDERR_TAIL = 2048 chars; never surface full stderr (may carry secrets).

### 5.3 Commands

Status: git status --porcelain=v1 -z --untracked-files=all
- -z: machine-readable, NUL-delimited, disables C-quoting. Verified on 2.54.
- --untracked-files=all: deterministic per-file output. --untracked-files=normal collapses an
  all-untracked dir to '?? newdir/' (verified live: '?? ' + 'newdir/' + NUL; trailing slash = dir),
  ambiguous for which files changed. normal is faster on huge untracked trees.
- Config override (Decision 9): untrackedFiles 'all'|'normal' default 'all'. Parser handles both
  (path/ trailing-slash form in normal). No auto-retry in v1; document the lever.

Log: git log -n <cap> --format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e
- Verified on git 2.54 (5.3); %x1f/%x1e since >=1.8.5.
- cap = max(1, min(request.limit ?? maxLogEntries, maxLogEntries)).
- One commit per record; fields \x1f, records \x1e.
- Edge: a subject containing \x1e breaks that record (rare). Accepted for lite (Open question 3).

rev-parse probe (Decision 11): before status/log, run git rev-parse --is-inside-work-tree (with
--abbrev-ref HEAD --short for head). Turns wrong paths / non-repos into the clean not-a-repo typed
error, and yields head. Cheap, outside hot path, aborted with same signal.

### 5.4 porcelain v1 -z parser contract (src/host/git-status-parser.ts)

Verified layout. ONLY NUL is a record separator; paths may contain spaces but never NUL; nested
untracked paths may contain '/'; never split on '/' or space — only NUL.

record := XY SP path NUL [ origPath NUL ]   /* extra NUL pair for R|C */
XY     := two ASCII status chars            /* index then worktree, e.g. ' M','??','R ' */
SP     := 0x20                              /* literal space between XY and path */

function parsePorcelainV1Z(buf: Uint8Array): GitStatusEntry[] {
  const entries = []
  let i = 0
  while (i + 4 <= buf.length) {
    const x = char(buf[i]); const y = char(buf[i+1]); const sp = buf[i+2]
    if (sp !== 0x20) break                     /* malformed; stop */
    const from = i + 3; let end = from
    while (end < buf.length && buf[end] !== 0) end++  /* read until NUL */
    const path = utf8(buf.subarray(from, end)); i = end + 1
    const code = xyCode(x + y)
    let originalPath
    if (code === 'renamed' || code === 'copied') {
      let o = i; while (o < buf.length && buf[o] !== 0) o++
      originalPath = utf8(buf.subarray(i, o)); i = o + 1
    }
    entries.push(toEntry(x + y, path, originalPath))
  }
  return entries
}

XY -> parse + grouping table:

| XY | meaning | staged | unstaged | untracked | conflicted | original? |
|----|---------|:-:|:-:|:-:|:-:|---|
| 'M ' | staged modified | Y | | | | |
| ' M' | unstaged modified | | Y | | | |
| 'MM' | both | Y | Y | | | |
| 'A ' / ' A' | added | Y | Y | | | |
| 'D ' / ' D' | deleted | Y | Y | | | |
| 'R ' (+RM,RD) | rename | Y | Y | | | Y |
| 'C ' | copy | Y | | | | Y |
| 'T ' / ' T' | typechange | Y | Y | | | |
| '??' | untracked | | | Y | | |
| 'UU' 'DD' 'AU' 'UD' 'UA' 'DU' 'AA' | unmerged | | | | Y | |
| 'A?' / ' ?' | intent-to-add | Y | | Y | | |

Empty status -> all arrays empty (UI: "no changes").
Submodule: S./.S/SS etc. -> submodule=true when x==='S'||y==='S'; do NOT diff contents (lite).
Decoding: UTF-8 via Buffer.toString('utf8'); -z does not C-quote, do not unquote. Non-UTF8 filenames
-> lossy decode (Open question 4).

### 5.5 GitService (src/host/git.ts)

export class GitService {
  constructor(runner: GitRunner, opts: { maxLogEntries: number; maxStatusEntries: number; untrackedFiles:'all'|'normal' }) {}
  status(request: GitStatusRequest, signal?: AbortSignal): Promise<SidebarResult<GitStatusResult>>
  log(request: GitLogRequest, signal?: AbortSignal): Promise<SidebarResult<GitLogResult>>
}

- status: rev-parse probe -> head; run status; parse; group staged/unstaged/untracked/conflicted;
  truncated if count reached cap.
- log: probe; run log capped; parse.
- not-a-repo/git-missing/timeout/cancelled map straight to SidebarError (D3 renders).
- Cwd orientation: use request.path as cwd; git walks up to repo root, so a subdir works. (Absolute
  vs repo-relative reporting is D5's call; default repo-relative.)

---

## 6. Plugin wiring (src/host/index.ts)

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

export const name = 'better-sidebar-host'
export interface BetterSidebarConfig {
  allowedRoots?: string[]
  gitTimeoutMs?: number
  maxEntriesPerListing?: number
  maxLogEntries?: number
  maxStatusEntries?: number
  untrackedFiles?: 'all' | 'normal'
  hidePatterns?: string[]
  gitExecutable?: string   /* test-only override */
}
export const Config: z<BetterSidebarConfig> = z.object({
  allowedRoots: z.array(String).default([]),
  gitTimeoutMs: z.natural().min(100).max(120_000).default(15_000),
  maxEntriesPerListing: z.natural().min(1).max(50_000).default(2_000),
  maxLogEntries: z.natural().min(1).max(5_000).default(100),
  maxStatusEntries: z.natural().min(1).max(50_000).default(20_000),
  untrackedFiles: z.union([z.literal('all'), z.literal('normal')]).default('all'),
  hidePatterns: z.array(String).default(['.git', 'node_modules']),
  gitExecutable: String().optional(),
})
export const inject = ['connection']
const CHANNEL = '/better-sidebar'

export function apply(ctx: Context, config?: BetterSidebarConfig): void {
  const cfg = resolveConfig(config)              /* Loader applies defaults; tests may omit */
  if ((cfg.allowedRoots ?? []).some(r => !isAbsolute(r))) {
    throw new Error('better-sidebar: allowedRoots entries must be absolute paths')
  }
  const explorer = new ExplorerService(fsNode, { maxEntries: cfg.maxEntriesPerListing, hidePatterns: cfg.hidePatterns })
  const runner = new GitRunner({ executable: cfg.gitExecutable ?? 'git', timeoutMs: cfg.gitTimeoutMs })
  const git = new GitService(runner, { maxLogEntries: cfg.maxLogEntries, maxStatusEntries: cfg.maxStatusEntries, untrackedFiles: cfg.untrackedFiles })

  const dispatch = (endpoint, payload, signal) => {
    const h = dispatchers[endpoint]
    if (!h) return toRpcResult({ ok:false, error:{ code:'param-invalid', message: 'unknown endpoint '+endpoint } })
    return h(payload, signal, explorer, git)
  }

  ctx.inject(['connection'], (connectionCtx) => {
    ctx.effect(() => {
      const dispose = connectionCtx.connection.rpc.handle(CHANNEL, dispatch, { authority: 'loopback' })
      return () => { void dispose() }
    }, 'better-sidebar: rpc channel')
  })
}

- Dispatch table (6.1) maps endpoint -> handler; unknown -> bad-request/param-invalid.
- Validate with pure guards in src/contract/guards.ts (isExplorerListRequest, isGitStatusRequest,
  isGitLogRequest). Decision 16: hand-rolled guards, not schemastery-on-the-wire (dependency-free,
  zero runtime schema cost, shared between halves, testable). D5 may prefer schemastery; if so it
  must emit the same guards as a shared asset.
- ctx.effect as disposer (Decision 15): every registration is an effect so unload tears down.

### 6.1 Endpoint dispatch table

| endpoint | payload guard | handler | returns (value slot) | RPC error slot |
|---|---|---|---|---|
| explorer/list | isExplorerListRequest | explorer.list | SidebarResult<ExplorerListResult> | cancelled on abort |
| git/status | isGitStatusRequest | git.status | SidebarResult<GitStatusResult> | cancelled on abort |
| git/log | isGitLogRequest | git.log | SidebarResult<GitLogResult> | cancelled on abort |
| unknown | - | - | - | bad-request |

### 6.2 toRpcResult

function toRpcResult(sr: SidebarResult<unknown>): RpcResult<unknown> {
  if (sr.ok) return { ok: true, value: sr.value }
  if (sr.error.code === 'cancelled') return { ok:false, error: { code:'cancelled', message: sr.error.message, details:{} } }
  return { ok: true, value: sr }   /* business failure: succeed at transport, typed error in value (2.2) */
}

---

## 7. Unit-test strategy (tests/host/)

Vitest host project runs node-env specs at tests/host/**/*.spec.ts (vitest.config.ts).

### 7.1 Explorer tests (fake FsPort + thin real-fs adapter test)

- Pure-logic tests (sorting, caps, hiding, root validation, error mapping) use an in-memory FsPort
  fake — deterministic, no EACCES-platform flakiness.
- A thin fs-node.spec.ts exercises the real adapter against a mkdtemp tree in beforeAll/afterAll:
  create files/dirs/symlink; assert listing.
- Windows: a FILE symlink works without admin; a DIR symlink may need admin — so create file symlinks
  in the real-fs spec; test dir-symlink policy via the fake.
- Cover: dirs-first + locale sort; .git/node_modules hidden, .env not; symlink reported symlink +
  linkTarget not followed; cap -> truncated; root validation branches (relative->param-invalid,
  missing->not-found, file->not-directory, exclusion->outside-allowed-root, Windows case-insensitive
  containment); error map branches (ENOENT/EACCES/ENOTDIR/ELOOP via fake).

### 7.2 Git runner + parser tests

- scripted real git repo fixture (tests/host/fixtures/scripted-git.ts): mkdtemp -> git init -q ->
  git config user.* -> scenario (commits, staged rename, unstaged mod, staged add, untracked file,
  untracked collapsible dir, two-branch merge forcing an unmerged UU). This sequence already proved
  correct on this machine (2.54); reuse it.
- Parser: rename has originalPath; unmerged -> conflicted; normal yields '?? dir/' (trailing slash)
  while all yields each file; empty -> empty arrays.
- Runner errors: nonexistent executable -> git-missing; empty temp dir -> not-a-repo; aborted signal
  -> cancelled; timeoutMs shorter than a scripted slow command -> timeout.

### 7.3 Plugin wiring test

- Call apply on a real cordis Context with a fake connection service (ctx.provide('connection', ...),
  mirroring packages/client/connection/tests/node-half.host.spec.ts:263-278), capture the registered
  handler, drive it with a well-formed ClientRequest, assert SidebarResult sits in the value slot
  (Decision 13) and cancellation maps to RPC cancelled.

### 7.4 Scope of coverage

Decision 17 (pragmatic, not the dsh 100% gate): hit every error-mapping branch, both parser path
forms (rename/unmerged/submodule/untracked), and root-validation branches. Do not chase a blanket
gate (matches D8).

---

## 8. Planned file layout (under src/host/)

src/host/
  index.ts               plugin entry: Config, inject, apply, dispatch table, toRpcResult
  explorer.ts            ExplorerService + compareEntries + assertListableRoot + mapFSError
  fs-node.ts             FsPort adapter (node:fs/promises + node:path)
  port-fs.ts             FsPort interface
  git.ts                 GitService (status/log orchestration + grouping)
  git-runner.ts          GitRunner (execFile wrapper, classification)
  git-status-parser.ts   pure porcelain v1 -z parser
src/contract/
  index.ts               barrel re-exports
  explorer.ts            ExplorerListRequest/Result, ExplorerEntry
  git.ts                 GitStatus/Log requests+results, GitStatusEntry, GitLogEntry
  error.ts               SidebarError/SidebarResult/SidebarErrorCode
  guards.ts              isExplorerListRequest / isGitStatusRequest / isGitLogRequest
tests/host/
  explorer.spec.ts
  fs-node.spec.ts
  git-runner.spec.ts
  git-status-parser.spec.ts
  git.spec.ts            GitService over a scripted real repo
  fixtures/scripted-git.ts   creates a temp git repo with a chosen scenario
  index.spec.ts          apply/wire

---

## 9. Open questions

1. Symlink-to-directory lazy expansion — we do NOT follow symlinks for type detection (prevents
   loops), so symlinks are tree leaves in v1. A common UX wants to expand a symlinked folder.
   Options: (a) never expand (v1, chosen), (b) resolve with an ELOOP/depth cap and expand when the
   target is a real dir. If D2 wants (b), ExplorerEntry needs resolvedKind?: 'dir'|'file' and a
   realpath call guarded. Confirm with D2.
2. --untracked-files default — default 'all' for parser determinism, config override to 'normal'. If
   the git tab must handle repos with hundreds of thousands of untracked files, 'all' can still be
   slow; a future default flip or an expand-untracked affordance. Confirm which D3 wants first.
3. Subject containing 0x1e/0x1f breaks that log record. Acceptable for lite? git has no built-in
   escaping for %x delimiters. Recommend accepting negligible risk; flag for D5.
4. Non-UTF8 filename bytes in status — accepted; git reports raw bytes. Future: lossy decode. OK?
5. RPC-error-slot override vs D5 — this doc mandates typed errors in the value slot because dsh
   RpcError is closed (2.2). If D5 decided otherwise, D6 overrides. Flag for team confirmation.
