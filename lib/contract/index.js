/**
 * Shared, dependency-free contract: the single source of truth for RPC
 * payloads, models, and error codes between the host and client halves
 * (ADR-001). No Node, DOM, or React types — both tsconfigs compile it.
 */
export * from "./versions.js";
export * from "./errors.js";
export * from "./explorer.js";
export * from "./git.js";
export * from "./settings.js";
export * from "./rpc.js";
//# sourceMappingURL=index.js.map