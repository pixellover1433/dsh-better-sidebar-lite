/**
 * Resolve the directory the tabs should show.
 * @returns absolute path, or undefined when no workspace exists (empty state).
 */
export function resolveRoot(sessions, workspaces) {
    const active = sessions.current === undefined ? undefined : sessions.byId[sessions.current];
    if (active?.cwd !== undefined)
        return active.cwd;
    if (workspaces.items.length === 1)
        return workspaces.items[0]?.path;
    if (workspaces.recentWorkspaceId !== undefined) {
        const recent = workspaces.items.find(w => w.workspaceId === workspaces.recentWorkspaceId);
        if (recent !== undefined)
            return recent.path;
    }
    return undefined;
}
//# sourceMappingURL=workspace-root.js.map