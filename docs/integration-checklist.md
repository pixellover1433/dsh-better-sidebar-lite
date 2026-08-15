# Integration checklist (owner: main agent after I2–I5 land)

## 1. Cross-agent seam verification
- [ ] src/client/tabs/explorer/locales.ts exports { NS, en, zh } — imported by client-core index.ts
- [ ] src/client/tabs/git/locales.ts exports { NS, en, zh }
- [ ] createExplorerTabDef(ctx, { rpc, emitter }) signature intact (stub signature preserved)
- [ ] createGitTabDef(ctx, { rpc }) signature intact
- [ ] DockRoot receives { rpc, tabs } props + global-standard props; provides DockContext
- [ ] details entry registered via ctx.slots.inject (declaration-owner is ui-layout) at priority -1 (shadows ui-conversation's DetailsPanel) — verify I3 used inject, not bare register; fix if needed
- [ ] ctx.betterSidebar provided via ctx.reflect.provide + declare module merge
- [ ] All three locale namespaces registered in apply (betterSidebar.dock / .explorer / .git)

## 2. Gates
- [ ] pnpm typecheck (host + client) — exit 0
- [ ] pnpm typecheck:tests — exit 0
- [ ] pnpm test — all projects green
- [ ] pnpm lint (oxlint) — decide whether to enforce; fix critical findings
- [ ] pnpm build — emits lib/host, lib/client, lib/contract with correct d.ts beside js; verify ./contract and ./client exports resolve

## 3. Product-proof (host, real fixtures)
- [ ] tests/host/git-service.spec.ts against real scripted repo (git 2.54 present)
- [ ] tests/host/plugin-wiring.spec.ts: value-slot SidebarResult + cancelled mapping
- [ ] tests/client/plugin-apply.spec.tsx: dock renders under SlotTestRuntime; ctx.betterSidebar live

## 4. Clean-code review pass (fresh subagent or self)
- [ ] No TODO/FIXME debt; no dead code; single responsibility per module
- [ ] README completed (install steps, extension guide, config reference, Model Experience, error codes)
- [ ] ADRs + design docs consistent with the shipped code (fix drift notes)

## 5. Final
- [ ] git commit with summary
- [ ] Goal status: complete only when all gates green