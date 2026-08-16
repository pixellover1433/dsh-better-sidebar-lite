/** Thrown synchronously by register() on a duplicate id. */
export class TabRegisterError extends Error {
    id;
    constructor(id) {
        super(`better-sidebar: tab '${id}' is already registered`);
        this.id = id;
        this.name = 'TabRegisterError';
    }
}
//# sourceMappingURL=contract.js.map