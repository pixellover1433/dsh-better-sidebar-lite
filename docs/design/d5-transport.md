# D5 — Transport Contract: RPC Surface & Validation

> **Status:** Design for implementer subagents. Self-sufficient; implementers do not see this session.
> **Scope:** The complete /better-sidebar RPC surface — endpoints, request/response types, error codes, validation strategy, cancellation, timeouts, concurrency, size caps, and transport-error surfacing.
> **Verified dsh facts cited throughout** (paths under ../deepseek-harness\): packages/client/connection/src/rpc.ts, packages/client/connection/src/rpc-host.ts, packages/host/apiproxy/src/api/rpc.ts, packages/client/connection/src/index.ts (ConnectionConfig, Config), packages/host/apiproxy/src/api/workspace.ts (WorkspaceView.path).

---

## 1. Overview & design decisions

The plugin talks to a **host** (Node cordis plugin) from a **client** (browser cordis plugin) over dsh's **generic logical RPC channel** — NOT typert/remote services (self-contained, no generated artifacts). The channel is already decided (architecture brief §4.2): /better-sidebar.

**Decision (transport core):** every call is a unary request/response through ctx.connection.rpc.call(channel, endpoint, payload, signal?: AbortSignal) (client) → ctx.connection.rpc.handle(channel, handler, { authority: 'loopback' }) (host). The host handler signature is (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>> (verified rpc.ts).

**Decision (authority):** authority: 'loopback'. This pins the channel to loopback-only via the browser-trust fence (verified rpc-host.ts register / createSharedFetchHandler). Our host reads the filesystem and runs git; a non-loopback caller must never reach it. The host is not a typed NetworkService; it is only reachable through Connection.

**Decision (endpoint vocabulary):** exactly four endpoints — explorer/list, git/status, git/log, system/health. The first three satisfy D2 (explorer tree) and D3 (git status/log). system/health is a cheap, deterministic host-alive probe for the transport-error surface (§8). No session/workspace or mutation endpoints for lite — this version is read-only. Future actions (stage/unstage, discard) become new endpoints under the same channel.

**Decision (result envelope):** the host returns dsh's RpcResult<unknown> ({ ok:true; value:T } | { ok:false; error:RpcError }) (verified rpc.ts). Domain errors surface through dsh RpcError; our fine-grained BetterSidebarErrorCode is carried inside details (§2.3). The client contract layer rehydrates our typed BetterSidebarResult<T> from the dsh result, so client code never imports the host-apiproxy error union.

---

## 2. Endpoint table & types

All request/response payload types live in src/contract (the contract entry, exported from package export ./contract).

### 2.1 The four endpoints

| Endpoint | Request | Response (value on ok) | Purpose |
|---|---|---|---|
| explorer/list | ExplorerListRequest | ExplorerListResponse | One directory's child entries (dirs + files), for lazy tree building. |
| git/status | GitStatusRequest | GitStatusResponse | Git working-tree status (porcelain v1 -z parsed). |
| git/log | GitLogRequest | GitLogResponse | Commit log (head, paginated). |
| system/health | HealthRequest | HealthResponse | Host liveness + version probe. |

Endpoint strings are channel-relative with / separators; each segment is validated by dsh against /^[A-Za-z0-9_$.-]+$/ (verified rpc-host.ts endpointFromPath). Our names comply.

### 2.2 Core envelope types (contract)

Indented code blocks are used throughout (valid markdown, no fences).

    // src/contract/types/result.ts
    import type { RpcResult as DshRpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

    /** Our own typed success/failure result. The client works ONLY with this type;
     *  the host maps it onto dsh RpcResult<unknown> (see §2.3). */
    export type BetterSidebarResult<T> =
      | { ok: true; value: T }
      | { ok: false; error: BetterSidebarError }

    // src/contract/types/error.ts
    import type { RpcErrorCode as DshRpcErrorCode } from '@deepseek-ai/dsh-host-apiproxy/api'

    /** Plugin-owned error codes. NOT dsh RpcErrorCode members (closed union, see rpc.ts).
     *  Carried inside dsh error.details. */
    export type BetterSidebarErrorCode =
      | 'cancelled' | 'bad-request' | 'not-found' | 'not-a-directory'
      | 'permission-denied' | 'too-large' | 'path-exceeds-limit' | 'path-not-absolute'
      | 'outside-allowed-root' | 'not-a-repo' | 'git-missing' | 'git-failed'
      | 'git-timeout' | 'timeout' | 'host-unavailable' | 'internal'

    export interface BetterSidebarErrorDetailsMap {
      'cancelled': {}; 'bad-request': { issues: string[] }
      'not-found': { path: string }; 'not-a-directory': { path: string }
      'permission-denied': { path: string; cause?: string }
      'too-large': { what: 'entries' | 'path'; limit: number; actual: number; path?: string }
      'path-exceeds-limit': { path: string; actualLength: number; limit: number }
      'path-not-absolute': { path: string }; 'outside-allowed-root': { path: string }
      'not-a-repo': { dir: string }; 'git-missing': { dir: string }
      'git-failed': { dir: string; exitCode: number; stderr: string }
      'git-timeout': { dir: string; elapsedMs: number; timeoutMs: number }
      'timeout': { endpoint: string; elapsedMs: number; timeoutMs: number }
      'host-unavailable': {}; 'internal': {}
    }

    export type BetterSidebarErrorDetail = BetterSidebarErrorDetailsMap[BetterSidebarErrorCode]
    export interface BetterSidebarError {
      readonly code: BetterSidebarErrorCode
      readonly message: string
      readonly details: BetterSidebarErrorDetail
    }

### 2.3 Mapping BetterSidebarError ↔ dsh RpcError

**Decision (mapping):** the host returns dsh's RpcError with a *chosen* dsh code for the transport gateway, and embeds the whole BetterSidebarError inside details.

    // src/contract/types/error.ts (host-side helper)
    import type { RpcError, RpcErrorCode } from '@deepseek-ai/dsh-host-apiproxy/api'

    /** dsh code chosen per our code. Most map to 'internal'; two get a real seam. */
    function toDshCode(code: BetterSidebarErrorCode): RpcErrorCode {
      switch (code) {
        case 'bad-request': return 'bad-request'   // validation -> schema-style bad-request
        case 'cancelled':   return 'cancelled'     // abort -> dsh dedicated code
        default:            return 'internal'      // closed-union catch-all, detail-carried
      }
    }

    /** Host: wrap a BetterSidebarError into the dsh RpcError the gateway returns. */
    export function toDshError(e: BetterSidebarError): RpcError {
      const code = toDshCode(e.code)
      const details = {
        ...(code === 'bad-request' ? { issues: [] } : {}),
        ...e.details,
        __betterSidebar: e, // self-describing raw record -> lossless client rehydrate
      }
      return { code, message: e.message, details: details as RpcError['details'] }
    }

    // src/contract/types/result.ts (CLIENT-side, dependency-free)
    import type { RpcResult as DshRpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

    /** Client rehydrate: unpack a dsh RpcResult into our typed result. */
    export function fromDshResult<T>(r: DshRpcResult<unknown>): BetterSidebarResult<T> {
      if (r.ok) return { ok: true, value: r.value as T }
      const embedded = (r.error.details as { __betterSidebar?: BetterSidebarError }).__betterSidebar
      if (embedded) return { ok: false, error: embedded }
      return { ok: false, error: { code: 'internal', message: r.error.message, details: {} as never } }
    }

**Mapping justification** (why internal for the catch-all):
- dsh's RpcErrorCode is a **closed** union (RpcErrorDetailsMap keys). We cannot add our codes without cross-package type surgery on host-apiproxy; the brief explicitly says keep them in our contract module and map to this shape.
- Only bad-request and cancelled have real semantic seams in dsh's union; we reuse them where they are true.
- Everything else uses the catch-all internal and is recovered client-side from details.__betterSidebar. The client stays fully typed against OUR codes and never couples to host-apiproxy's union.

---

## 3. Payload validation strategy

**Decision: manual runtime guards (type predicates) shared in src/contract, NOT schemastery on the host.**
1. Works on the client too, dependency-free (no schemastery in the browser bundle).
2. The client is the caller and must build valid payloads — shared guards give fast local feedback and one source of truth.
3. No codegen / no Schema-to-TS drift; guards sit beside the types.
4. The host still runs a final server-side guard pass (shared code), so there is no trust gap.

**Decision (guard style):** one small hand-rolled predicate plus a typed validate() helper per request type, uniform across endpoints.

    // src/contract/validate.ts
    export type Validator<T> = (x: unknown) => x is T
    export const isJsonObject = (x: unknown): x is Record<string, unknown> =>
      typeof x === 'object' && x !== null && !Array.isArray(x)
    export const isString  = (x: unknown): x is string  => typeof x === 'string'
    export const isNumber  = (x: unknown): x is number  => typeof x === 'number' && Number.isFinite(x)
    export const isBoolean = (x: unknown): x is boolean => typeof x === 'boolean'
    export const isNull    = (x: unknown): x is null    => x === null
    export const isUndefined = (x: unknown): x is undefined => x === undefined

    export const isArray = <T = unknown>(itemGuard?: Validator<T>) =>
      (x: unknown): x is T[] => Array.isArray(x) && (itemGuard === undefined || x.every(itemGuard))

    /** Object guard: required keys present+valid; unknown keys allowed (forward-compatible). */
    export function makeObjectGuard(fields: Record<string, Validator<unknown>>): Validator<Record<string, unknown>> {
      return (x): x is Record<string, unknown> => {
        if (!isJsonObject(x)) return false
        for (const key of Object.keys(fields)) {
          if (!(key in x)) return false
          if (!fields[key](x[key])) return false
        }
        return true
      }
    }

    export function optional<T>(guard: Validator<T>): Validator<T | undefined> {
      return (x): x is T | undefined => isUndefined(x) || guard(x)
    }

    /** Per-endpoint helper: typed value on success, issue list on failure. */
    export function validate<T>(value: unknown, guard: Validator<T>, label: string):
      { ok: true; value: T } | { ok: false; issues: string[] } {
      if (guard(value)) return { ok: true, value }
      return { ok: false, issues: [label + ': failed guard'] }
    }

**Where the guards run:**
- **Client sender:** before each rpc.call, run the request guard; local failure is a client-only error treated as bad-request in the UI (never hits the wire).
- **Host handler:** after receiving a payload, run the same guard; failure returns BetterSidebarError { code:'bad-request', details:{issues} } (mapped to dsh bad-request). Server never trusts the wire.

**Bad-request vs protocol:** the dsh transport *envelope* (the ClientRequest message shape, rpcId/method) is already validated by Connection before our handler runs (clientRequestSchema.safeParse, verified rpc-host.ts). We only validate the payload slot; a malformed envelope is rejected by Connection itself.

---

## 4. Cancellation

**Decision (contract):** one flow — client AbortSignal → rpc.call signal → host handler signal (the underlying HTTP request.signal, verified rpc-host.ts rpcFetchHandler). The host **cooperatively** observes the signal.

**Server-side rules (host handler contract):**
1. Check signal.aborted before and between every await.
2. Forward the signal INTO long operations:
   - **git:** execFile('git', args, { cwd, signal, timeout: gitTimeoutMs }) — Node kills the child on signal/timeout (D6 owns runner internals; this doc fixes that signal and timeout must be forwarded).
   - **fs:** fs.promises.readdir/stat/lstat have no native abort; check signal.aborted post-await and every FS_ABORT_CHECK_INTERVAL iterations in bounded loops (§7).
3. On observed abort, stop promptly and **return** BetterSidebarError { code:'cancelled' } (maps to dsh cancelled). Return over throw so the RpcResult stays well-formed.
4. **Read-only means abort is safe:** we never mutate state; in-flight data already fetched is discarded by the client generation guard (§6).

---

## 5. Timeouts

**Decision:** the host owns authoritative timeouts via config; the client applies a conservative expectation to fail fast on a stalled link.

    // src/host/config.ts — mirrors ConnectionConfig's Schema.object shape (index.ts:64)
    import { Schema } from '@deepseek-ai/schemastery'

    export interface BetterSidebarConfig {
      timeoutMs: number; gitTimeoutMs: number; allowedRoots?: string[]
      maxTreeEntriesPerDir: number; maxStatusEntries: number; maxLogEntries: number; maxPathLength: number
    }
    export const Config = Schema.object({
      timeoutMs: Schema.number().default(10000).min(100),
      gitTimeoutMs: Schema.number().default(30000).min(100),
      allowedRoots: Schema.array(Schema.string()).default([]),
      maxTreeEntriesPerDir: Schema.natural().default(500).min(1),
      maxStatusEntries: Schema.natural().default(1000).min(1),
      maxLogEntries: Schema.natural().default(200).min(1),
      maxPathLength: Schema.natural().default(2048).min(1),
    })

**Host enforcement:** non-git endpoints race the handler against timeoutMs; git endpoints pass timeout: gitTimeoutMs to execFile (Node kills the child, satisfying timeout and abort). Expiry returns git-timeout (git) or timeout (other).

**Client expectation:** if no response within CLIENT_RESPONSE_TIMEOUT_MS (10 000 ms, > host default so the host stays authoritative), the client treats it as a transport failure (host-unavailable) to avoid a hanging spinner. Local safety valve only.

---

## 6. Concurrency & staleness (refresh races)

**Decision: the client cancels a superseded request; the host is stateless.** No response versioning, no server-side sequencing.

Rationale: refresh operations (expand dir, workspace switch, git refresh) are idempotent, read-only, last-write-wins. Two client mechanisms:

1. **Per-request AbortController.** Each refresh owns an AbortSignal; a newer request for the same *domain* aborts the previous one, which flows to the host as the signal (host returns cancelled or kills the git child).
2. **Generation guard.** A monotonic generation per domain lets the client discard any response that is no longer current — covers races where the abort did not propagate in time.

    // src/client/services/refresh-guard.ts
    export class RequestGuard {
      private seq = 0
      private readonly controllers = new Map<string, AbortController>()
      begin(domain: string): { signal: AbortSignal; token: number } {
        this.controllers.get(domain)?.abort()
        const ctrl = new AbortController()
        this.controllers.set(domain, ctrl)
        return { signal: ctrl.signal, token: ++this.seq }
      }
      isCurrent(domain: string, token: number): boolean {
        const ctrl = this.controllers.get(domain)
        return ctrl !== undefined && token === this.seq
      }
      release(domain: string, token: number): void {
        if (this.isCurrent(domain, token)) this.controllers.delete(domain)
      }
    }

**Decision (explorer root param):** each explorer/list request carries the *absolute root path* to list (D2's chosen root — active session workspace or user choice, pinned via WorkspaceView.path, verified in workspace.ts). The host is stateless and lists exactly the requested directory. On workspace switch the client aborts prior explorer requests and issues fresh ones.

**Decision (git):** git/status and git/log take the repository root; the host runs git in that cwd. A refresh aborts the previous git request.

---

## 7. Size caps & path guards

    // src/contract/caps.ts — single source; host config sets them, client reflects optimistic caps
    export const DEFAULT_MAX_TREE_ENTRIES_PER_DIR = 500
    export const DEFAULT_MAX_STATUS_ENTRIES = 1000
    export const DEFAULT_MAX_LOG_ENTRIES = 200
    export const DEFAULT_MAX_PATH_LENGTH = 2048
    export const DEFAULT_TIMEOUT_MS = 10000
    export const DEFAULT_GIT_TIMEOUT_MS = 30000
    export const FS_ABORT_CHECK_INTERVAL = 64       // signal check spacing in fs loops
    export const CLIENT_RESPONSE_TIMEOUT_MS = 10000 // local client safety valve

**Enforcement points:**
- **Path length:** host rejects any request path with length > maxPathLength → path-exceeds-limit (plus path-not-absolute / outside-allowed-root per D6 path-safety).
- **Explorer listing:** host truncates children at maxTreeEntriesPerDir and sets truncated:true — a large directory surfaces a 'too many entries' UI hint, not an error (lite has no pagination).
- **Git status/log:** host truncates items at the cap; responses carry truncated, the client shows 'showing first N'.

---

## 8. Transport errors (network down / host restart)

**Decision:** transport failures must surface as a **distinct UI-visible state**, separate from domain errors.

**Detection on the client:**
- rpc.call rejects on a dead transport. Our wrapper maps a rejected/caught call into BetterSidebarResult { ok:false, error:{ code:'host-unavailable' } } rather than a raw exception.
- A timeout with no response (CLIENT_RESPONSE_TIMEOUT_MS) is a transport failure, not a domain timeout.
- Optional system/health probe ({ ok:true, version, pid }, very short host timeout) drives 'reconnecting' and re-arms after a detected restart.

    // src/client/services/transport.ts
    import type { BetterSidebarResult } from '../../contract/types/result'
    async function safeCall<T>(p: Promise<BetterSidebarResult<T>>): Promise<BetterSidebarResult<T>> {
      try { return await p }
      catch { return { ok: false, error: { code: 'host-unavailable', message: 'host unavailable', details: {} } } }
    }

The client routes error.code === 'host-unavailable' | 'cancelled' | 'timeout' to an explicit error-state owner (D7 owns the component). The refresh guard (§6) aborts outstanding transports and re-issues on health restore.

---

## 9. Planned file layout & endpoint registry

    src/
      contract/
        index.ts         // public contract entry (package export './contract')
        caps.ts          // size/timeout constants
        validate.ts      // validator primitives + validate() helper
        endpoints.ts     // endpoint string constants + request-guard registry table
        request.ts       // endpoint request types + guards
        response.ts      // endpoint response value types + guards
        types/
          result.ts      // BetterSidebarResult, fromDshResult (client)
          error.ts       // BetterSidebarErrorCode, details, toDshError (host-only helper)
      host/
        rpc-handler.ts   // dispatch, guards, dsh mapping, timeouts, signal
        ...
      client/
        services/transport.ts     // safeCall + host-unavailable mapping
        services/refresh-guard.ts // RequestGuard
        ...

    // src/contract/endpoints.ts — the registry drives the host dispatcher (extensible)
    export const CHANNEL = '/better-sidebar'
    export type EndpointName = 'explorer/list' | 'git/status' | 'git/log' | 'system/health'

    export function parseRequest<E extends EndpointName>(endpoint: E, payload: unknown):
      { ok: true; value: RequestOf<E> } | { ok: false; error: BetterSidebarError } {
      const guard = requestGuardOf(endpoint)
      const result = validate(payload, guard, endpoint)
      if (result.ok) return result
      return { ok: false, error: { code: 'bad-request', message: 'invalid request for ' + endpoint, details: { issues: result.issues } } }
    }

### 9.1 Per-endpoint request/response sketches

    // explorer/list
    export interface ExplorerListRequest { path: string; sort: 'default' | 'name-asc' | 'name-desc' }
    export interface ExplorerListResponse {
      path: string; parentPath: string | null; entries: ExplorerEntry[]; truncated: boolean
    }
    export interface ExplorerEntry { name: string; path: string; isDirectory: boolean; isSymlink: boolean }

    // git/status
    export interface GitStatusRequest { root: string }
    export interface GitStatusResponse {
      root: string; branch: string | null; entries: GitStatusEntry[]; truncated: boolean
    }
    export interface GitStatusEntry {
      path: string; originalPath: string | null; indexStatus: string; worktreeStatus: string
    }

    // git/log
    export interface GitLogRequest { root: string; limit: number; offset: number }
    export interface GitLogResponse { root: string; entries: GitCommit[]; truncated: boolean }
    export interface GitCommit {
      hash: string; shortHash: string; subject: string; authorName: string
      authorEmail: string; authorTimestamp: string; bodyPreview: string | null
    }

    // system/health
    export interface HealthRequest {}
    export interface HealthResponse { ok: true; version: string; pid: number }

### 9.2 Host handler skeleton (behavior contract)

    // src/host/rpc-handler.ts
    export async function betterSidebarHandler(endpoint, payload, signal) {
      const parsed = parseRequest(endpoint, payload)
      if (!parsed.ok) return toDshError(parsed.error)
      try {
        const value = await withTimeout(dispatch(endpoint, parsed.value, signal), timeoutFor(endpoint, config), signal)
        return { ok: true, value }
      } catch (e) {
        return toDshError(toBetterSidebarError(e))
      }
    }

**Host handler must:** validate the request (shared guards) → bad-request; forward signal to every long op and to execFile for git; observe signal.aborted between awaits → cancelled; apply timeoutMs / gitTimeoutMs → timeout / git-timeout; catch and map thrown errors → typed BetterSidebarError; **never throw from the handler** (a throw breaks the gateway with HTTP 500 — verified rpc-host.ts catch → 500).

---

## 10. Edge-case list

- Dead transport mid-request: rpc.call rejects → host-unavailable (distinct from domain errors).
- Host restarted between calls: next call rejects → host-unavailable; health probe re-arms; cached tree/git invalidated only after a health failure.
- Abort after host committed a read: harmless — data discarded by the generation guard.
- Rename X -> Y: GitStatusEntry.originalPath set; both porcelain columns populated (D6 parser detail).
- Untracked/staged/unstaged transitions: carried purely by porcelain XY columns.
- Detached HEAD: branch null; git/log still works (HEAD ref).
- Directory capped: truncated:true (not an error).
- Path is a file: not-a-directory. Path missing: not-found. Permission denied: permission-denied.
- Symlink behavior: isSymlink flag surfaced; host does not follow symlinks out of the listed dir by default (D6 owns the policy).
- Non-absolute / over-long / out-of-root path: path-not-absolute / path-exceeds-limit / outside-allowed-root.
- Not a git repo: not-a-repo (explicit typed code, never a crash). git missing: git-missing. git non-zero exit: git-failed with exitCode+stderr. git exceeds timeout: git-timeout.
- Unknown endpoint on our channel: Connection returns 404 before our handler; client treats as bad-request.
- Handlers must never throw (the dsh gateway would 500 the HTTP layer).

---

## 11. Open questions

1. Does git/log need an optional path filter or branch/revision base? D3 does not specify; adding fields later is compatible (guards ignore unknown keys). Default: none in lite.
2. Does the explorer wish to show entry sizes / modified times? ExplorerEntry currently has none; D6 must confirm whether lite shows them (adding fields is client-compatible but the host must then read them).
3. Transport-error surface: full-screen reconnect overlay vs inline per-tab banner? D5 defines the *state*; the visual owner is D7. Recommendation: inline banner + slim dock-level offline indicator.
4. Should system/health ship at all, or is a rejected rpc.call enough? This doc recommends it for deterministic re-arm; a leaner alternative drops it. Open until D1/D7 weigh in on reconnect UX.
