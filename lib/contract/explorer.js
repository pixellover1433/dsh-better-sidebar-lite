/**
 * Explorer models shared by host (producer) and client (consumer).
 * Pure types + one pure sort function; no Node/DOM/React imports.
 */
/**
 * Deterministic listing order: directories first, then locale-aware name
 * comparison, then full path as a stable tie-break. Pure and shared so host
 * and client tests pin the same order.
 */
export function compareEntries(a, b) {
    const aDir = a.kind === 'directory' ? 0 : 1;
    const bDir = b.kind === 'directory' ? 0 : 1;
    if (aDir !== bDir)
        return aDir - bDir;
    const byName = defaultCollator.compare(a.name, b.name);
    if (byName !== 0)
        return byName;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}
// Module-level collator: created once, shared by every listing.
const defaultCollator = new Intl.Collator(undefined, { sensitivity: 'base' });
//# sourceMappingURL=explorer.js.map