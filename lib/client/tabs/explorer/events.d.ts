/**
 * Open-file event contract (ADR-004): no editor consumes it yet, but the
 * emitter ships so future editors integrate without explorer changes.
 */
/**
 * The `diff` payload a file opener may attach so the modal shows a git patch
 * (two-pane) instead of the file's raw content. A discriminated union keeps the
 * two diff sources distinct: a live working-tree status row diffs against the
 * index/HEAD, while an old commit's file diffs against that commit's parent(s).
 */
export type ExplorerOpenFileDiff = 
/** A tracked row from git status: working-tree vs index or index vs HEAD. */
{
    readonly kind: 'status';
    readonly base: 'index' | 'head';
    readonly root: string;
    readonly file: string;
}
/** A file from an old commit's detail: its diff as introduced by that commit. */
 | {
    readonly kind: 'commit';
    readonly root: string;
    readonly hash: string;
    readonly file: string;
};
export interface ExplorerOpenFileEvent {
    /** Absolute resolved path. */
    readonly path: string;
    /** Display name. */
    readonly name: string;
    /** Always 'file' — opening a directory expands, not opens. */
    readonly kind: 'file';
    readonly source: 'keyboard-enter' | 'double-click' | 'command';
    /** The tree root (a base for readers). */
    readonly rootPath: string;
    /**
     * Present only when the opener wants the modal to show the file's diff
     * instead of its raw content. Status rows (staged → kind 'status' base 'head',
     * unstaged → kind 'status' base 'index') and old-commit file rows (kind
     * 'commit') set it; the explorer and untracked git rows leave it undefined so
     * the editor shows raw content.
     */
    readonly diff?: ExplorerOpenFileDiff;
}
/** Subscribe face; also the type the dock wires into the tab factory. */
export interface ExplorerEvents {
    /** @returns disposer. */
    onOpenFile(listener: (e: ExplorerOpenFileEvent) => void): () => void;
}
/** Simple listener set; emitting with no listeners is a no-op. */
export declare class ExplorerOpenFileEmitter implements ExplorerEvents {
    private readonly listeners;
    onOpenFile(listener: (e: ExplorerOpenFileEvent) => void): () => void;
    /** @internal — the explorer tab emits; subscribers only read. */
    emit(event: ExplorerOpenFileEvent): void;
}
//# sourceMappingURL=events.d.ts.map