/**
 * Plugin-owned, transport-agnostic error model (ADR-002).
 *
 * IMPORTANT: dsh's RpcError is a CLOSED union and the browser caller parses
 * every response with serverResponseSchema.parse() over that union — a
 * non-dsh code in the RPC error slot makes the client parse THROW. Therefore
 * domain errors always travel in the RPC VALUE slot inside SidebarResult;
 * the RPC error slot is reserved for the connection layer itself.
 */
/** Discriminated error union; every branch is serializable (no classes). */
export type SidebarError = {
    code: 'not-found';
    message: string;
    path: string;
} | {
    code: 'permission-denied';
    message: string;
    path: string;
} | {
    code: 'not-directory';
    message: string;
    path: string;
} | {
    code: 'symlink-loop';
    message: string;
    path: string;
} | {
    code: 'path-too-long';
    message: string;
    path: string;
} | {
    code: 'invalid-root';
    message: string;
    path: string;
} | {
    code: 'outside-allowed-root';
    message: string;
    path: string;
} | {
    code: 'not-a-repo';
    message: string;
    path: string;
} | {
    code: 'git-missing';
    message: string;
} | {
    code: 'git-failed';
    message: string;
    stderrTail: string;
} | {
    code: 'timeout';
    message: string;
    command: 'status' | 'log';
} | {
    code: 'cancelled';
    message: string;
} | {
    code: 'param-invalid';
    message: string;
} | {
    code: 'internal';
    message: string;
};
export type SidebarErrorCode = SidebarError['code'];
/** Result envelope carried in the RPC value slot (ADR-002). */
export type SidebarResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: SidebarError;
};
/** Narrow helper: build a typed error branch. */
export declare function sidebarError(code: SidebarError['code'], message: string): Extract<SidebarError, {
    code: typeof code;
}>;
//# sourceMappingURL=errors.d.ts.map