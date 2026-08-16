/**
 * Plugin-owned, transport-agnostic error model (ADR-002).
 *
 * IMPORTANT: dsh's RpcError is a CLOSED union and the browser caller parses
 * every response with serverResponseSchema.parse() over that union — a
 * non-dsh code in the RPC error slot makes the client parse THROW. Therefore
 * domain errors always travel in the RPC VALUE slot inside SidebarResult;
 * the RPC error slot is reserved for the connection layer itself.
 */
/** Narrow helper: build a typed error branch. */
export function sidebarError(code, message) {
    return { code, message };
}
//# sourceMappingURL=errors.js.map