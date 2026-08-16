/**
 * React context the dock provides around every tab panel (ADR-003): tabs
 * consume session/workspace hooks and the RPC facade through useDock() —
 * the framework-free test seam.
 */
import { createContext, useContext } from 'react';
export const DockContext = createContext(undefined);
/** Read the dock-provided context; throws outside a mounted dock. */
export function useDock() {
    const value = useContext(DockContext);
    if (value === undefined)
        throw new Error('useDock: no DockContext provider (tab rendered outside the dock)');
    return value;
}
//# sourceMappingURL=context.js.map