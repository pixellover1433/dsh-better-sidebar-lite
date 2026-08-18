/**
 * Open-file event contract (ADR-004): no editor consumes it yet, but the
 * emitter ships so future editors integrate without explorer changes.
 */
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
     * instead of its raw content. The git tab sets it for tracked status rows
     * (staged → base 'head', unstaged → base 'index'); the explorer and
     * untracked git rows leave it undefined so the editor shows raw content.
     */
    readonly diff?: {
        readonly base: 'index' | 'head';
        readonly root: string;
        readonly file: string;
    };
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