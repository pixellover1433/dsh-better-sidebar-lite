/**
 * Open-file event contract (ADR-004): no editor consumes it yet, but the
 * emitter ships so future editors integrate without explorer changes.
 */
/** Simple listener set; emitting with no listeners is a no-op. */
export class ExplorerOpenFileEmitter {
    listeners = new Set();
    onOpenFile(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    /** @internal — the explorer tab emits; subscribers only read. */
    emit(event) {
        for (const listener of Array.from(this.listeners))
            listener(event);
    }
}
//# sourceMappingURL=events.js.map