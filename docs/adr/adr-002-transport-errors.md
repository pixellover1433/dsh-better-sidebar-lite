# ADR-002 — Transport & error model

Status: accepted · Source designs: D5 (transport), D6 (host) · Supersedes D1 §7 error-in-error-slot sketch

## Decisions

1. **Endpoints** (channel `/better-sidebar`): `explorer/list`, `git/status`, `git/log`. No `system/health` in v1 (transport failures already surface as `host-unavailable` on the client). Unknown endpoint → RPC error `bad-request`.
2. **Domain errors ride in the VALUE slot** (critical, verified): dsh's `RpcError` is a CLOSED union and the browser caller parses every response with `serverResponseSchema.parse()` (packages/client/connection/src/client/rpc.ts:42) — a plugin code in the error slot makes the client parse THROW. Therefore:
   - Handler returns `RpcResult<SidebarResult<T>>`; business failure = `{ ok: true, value: { ok: false, error: SidebarError } }`.
   - Genuine caller cancellation maps to the RPC error slot `{ code: 'cancelled' }`.
   - The client facade rehydrates `SidebarResult<T>` (never imports the host-apiproxy error union).
3. **Validation:** hand-rolled type-predicate guards in `src/contract/rpc.ts` (`isExplorerListRequest`, `isGitStatusRequest`, `isGitLogRequest`), shared by both halves; invalid payload → RPC error `bad-request` (host) / no request sent (client).
4. **Cancellation & staleness:** client passes its `AbortSignal` to `rpc.call`; superseded requests are aborted via per-domain `AbortController`; host checks `signal.aborted` between awaits and forwards `{ signal, timeout }` to `execFile`. Host is stateless (no versioning).
5. **Timeouts:** host-authoritative via Config (`gitTimeoutMs` default 15000, clamp [100, 120000]); client wraps with a local safety valve and maps rejected calls to `{ code: 'host-unavailable' }` — hmm, that code is NOT in the contract union; use `internal` with message 'host unavailable'. (See note below.)
6. **Caps** (contract `HOST_DEFAULTS`, all Config-overridable): maxEntriesPerListing 2000, maxLogEntries 100, maxStatusEntries 20000, maxRequestPathLength 4096, totalListingPathBytes 1 MiB. (D5's smaller numbers rejected — host implementation authority is D6.)
7. **SidebarError codes** (contract/errors.ts): not-found, permission-denied, not-directory, symlink-loop, path-too-long, invalid-root, outside-allowed-root, git-missing, not-a-repo, git-failed, timeout, cancelled, param-invalid, internal.

## Client-side transport failure
A rejected `rpc.call` (dead transport, HTTP error) is mapped by the facade to `{ ok: false, error: { code: 'internal', message: 'host unavailable' } }`; the UI treats it as a distinct retryable surface (documented in README).