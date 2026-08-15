# ADR-001 — Architecture & module layout

Status: accepted · Source designs: D1 (architecture), D2–D8

## Decisions

1. **Three compile units, one import DAG.** `src/contract` (dependency-free, compiled by BOTH tsconfigs), `src/host` (Node; imports contract + dsh host types + node builtins), `src/client` (browser; imports contract + dsh client types + react). Contract imports nothing from host/client.
2. **Mount surface:** ONE `details` slot entry at `priority: -1` (kind single, scope session — verified in ui-layout). The frame's right column is the only space-reserving right seat; registering into it shadows ui-conversation's DetailsPanel (the sanctioned single-seat takeover — registering at the occupied default priority would throw). Explorer and git are TABS inside the dock via the tab registry — never separate slots. The entry stays mounted across open/close (the column keeps the subtree mounted at 0 width).
3. **Dock geometry:** the dock IS the details column — AppFrame owns the grid track, the drag handle (clamp [300, 520], default 360), the column border, and narrow-viewport concession (auto-close). The dock fills the column and drives only open/close via `ctx.layout` (`openDetails`/`closeDetails`); when the column is closed (blank session, narrow viewport, collapsed) the dock floats absolute at the right edge — a 320px panel while open-with-no-column, a 56px tab rail while collapsed — and docks back in-flow once the column opens. Open/closed preference persists to localStorage `dsh.betterSidebar.dock`; the width lives in the layout store and is not persisted.
4. **Transport:** generic Connection RPC channel `/better-sidebar`, `authority: 'loopback'` (strongest offered to a browser caller — the trust boundary). Host registers inside `ctx.inject(['connection'])` wrapped in `ctx.effect` (gateway pattern). Client talks ONLY through a `BetterSidebarRpc` facade (`src/client/rpc-client.ts`) — no ad-hoc `connection.rpc.call`.
5. **Service surface:** `ctx.betterSidebar = { rpc, tabs, explorer }" client-only, provided via `ctx.reflect.provide` + `declare module '@deepseek-ai/cordis'` (mirror of ui-layout's ctx.layout). NO host service — host surface is exactly the channel + Config.
6. **Package exports** (fixed): `.` → lib/host, `./client` → lib/client, `./contract` → lib/contract; `types` point at tsc-emitted `.d.ts` beside the `.js` (NOT lib/types/** — that layout is tsdown-specific).
7. **Built-in tabs register through the same public API a third party uses** (proves the extension point end-to-end): explorer order 10, git order 20.

## Open questions resolved later
- Details-column coexistence: the dock owns the details column (ADR-003; the built-in tool-details viewer is replaced — documented consequence of the takeover). NARROW_BREAKPOINT 900: superseded by AppFrame's concession chain. Persistence: localStorage (ADR-003).