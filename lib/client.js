window.__ModuleLoader__.load({
	id: "dsh-better-sidebar-lite",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/contract/versions.ts
var CHANNEL = "/better-sidebar";

// src/client/rpc-client.ts
function transportError(cause) {
  console.error("better-sidebar: host transport failure", cause);
  return { code: "internal", message: "host unavailable" };
}
function createBetterSidebarRpc(connection) {
  return new BetterSidebarRpcClient(connection);
}
var BetterSidebarRpcClient = class {
  constructor(connection) {
    __publicField(this, "connection", connection);
  }
  async call(endpoint, payload, opts) {
    let result;
    try {
      result = await this.connection.rpc.call(CHANNEL, endpoint, payload, opts?.signal);
    } catch (error) {
      if (opts?.signal?.aborted === true) return { ok: false, error: { code: "cancelled", message: "request superseded" } };
      return { ok: false, error: transportError(error instanceof Error ? error.message : String(error)) };
    }
    if (!result.ok) {
      if (result.error.code === "cancelled") return { ok: false, error: { code: "cancelled", message: result.error.message } };
      if (result.error.code === "bad-request") {
        console.warn("better-sidebar: bad-request", endpoint, JSON.stringify(payload), result.error.message);
        return { ok: false, error: { code: "param-invalid", message: result.error.message } };
      }
      return { ok: false, error: transportError(result.error.message) };
    }
    return result.value;
  }
};

// src/client/tab-registry/contract.ts
var TabRegisterError = class extends Error {
  constructor(id) {
    super(`better-sidebar: tab '${id}' is already registered`);
    __publicField(this, "id", id);
    this.name = "TabRegisterError";
  }
};

// src/client/tab-registry/service.ts
var ACTIVE_STORAGE_KEY = "dsh.betterSidebar.activeTab";
var DEFAULT_ORDER = 1e3;
function readPersistedActive() {
  if (typeof localStorage === "undefined") return void 0;
  try {
    const raw = localStorage.getItem(ACTIVE_STORAGE_KEY);
    return raw === null || raw === "" ? void 0 : raw;
  } catch {
    return void 0;
  }
}
function writePersistedActive(id) {
  if (typeof localStorage === "undefined") return;
  try {
    if (id === void 0) localStorage.removeItem(ACTIVE_STORAGE_KEY);
    else localStorage.setItem(ACTIVE_STORAGE_KEY, id);
  } catch {
  }
}
function byOrder(a, b) {
  const ao = a.def.order ?? DEFAULT_ORDER;
  const bo = b.def.order ?? DEFAULT_ORDER;
  if (ao !== bo) return ao - bo;
  return a.registrationIndex - b.registrationIndex;
}
var TabRegistryService = class {
  constructor() {
    __publicField(this, "entries", /* @__PURE__ */ new Map());
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    /** Desired active id from storage; settled against live entries lazily. */
    __publicField(this, "desiredActive", readPersistedActive());
    __publicField(this, "activeId");
    __publicField(this, "nextRegistrationIndex", 0);
  }
  get active() {
    return this.activeId;
  }
  register(def) {
    if (this.entries.has(def.id)) throw new TabRegisterError(def.id);
    this.entries.set(def.id, { def, registrationIndex: this.nextRegistrationIndex++ });
    this.persistActive();
    writePersistedActive(this.activeId);
    this.notify();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.unregister(def.id);
    };
  }
  unregister(id) {
    if (!this.entries.delete(id)) return;
    this.persistActive();
    writePersistedActive(this.activeId);
    this.notify();
  }
  select(id) {
    if (!this.entries.has(id)) return false;
    this.activeId = id;
    this.desiredActive = id;
    writePersistedActive(id);
    this.notify();
    return true;
  }
  ids() {
    return [...this.entries.values()].sort(byOrder).map((e) => e.def.id);
  }
  get(id) {
    return this.entries.get(id)?.def;
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  /**
   * Keep the active tab valid. With an explicit (or restored) preference the
   * desired id wins once registered; without one, the active tab follows
   * sort order at every structural change, so a later-registered tab with a
   * lower order takes over the default (explorer beats git regardless of
   * registration order).
   */
  persistActive() {
    if (this.entries.size === 0) {
      this.activeId = void 0;
      return;
    }
    if (this.desiredActive !== void 0) {
      if (this.entries.has(this.desiredActive)) {
        this.activeId = this.desiredActive;
        return;
      }
      if (this.activeId !== void 0 && this.entries.has(this.activeId)) return;
    }
    this.activeId = [...this.entries.values()].sort(byOrder)[0]?.def.id;
  }
  notify() {
    for (const fn of Array.from(this.listeners)) fn();
  }
};

// src/client/tabs/explorer/events.ts
var ExplorerOpenFileEmitter = class {
  constructor() {
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
  }
  onOpenFile(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** @internal — the explorer tab emits; subscribers only read. */
  emit(event) {
    for (const listener of Array.from(this.listeners)) listener(event);
  }
};

// src/client/dock/dock.tsx
var import_react3 = require("react");

// src/client/dock/context.ts
var import_react = require("react");
var DockContext = (0, import_react.createContext)(void 0);
function useDock() {
  const value = (0, import_react.useContext)(DockContext);
  if (value === void 0) throw new Error("useDock: no DockContext provider (tab rendered outside the dock)");
  return value;
}

// src/client/tabbar/tablist.tsx
var import_react2 = require("react");

// bsd-css:./tablist.module.css
var cssText = ".bsd-aZEaXa-list {\n  border-bottom: 1px solid var(--bsd-border);\n  background: var(--bsd-bg);\n  flex-direction: row;\n  align-items: stretch;\n  gap: 2px;\n  padding: 0 8px;\n  display: flex;\n}\n\n.bsd-aZEaXa-tabInactive, .bsd-aZEaXa-tabActive {\n  color: var(--bsd-text);\n  font: inherit;\n  cursor: pointer;\n  background: none;\n  border: none;\n  border-bottom: 2px solid #0000;\n  align-items: center;\n  gap: 6px;\n  padding: 8px 10px;\n  display: inline-flex;\n}\n\n.bsd-aZEaXa-tabInactive {\n  color: var(--bsd-muted);\n}\n\n.bsd-aZEaXa-tabActive {\n  color: var(--bsd-accent);\n  border-bottom-color: var(--bsd-accent);\n  font-weight: 600;\n}\n\n.bsd-aZEaXa-label {\n  white-space: nowrap;\n}\n";
var styleId = "bsd-css-227c6b2c";
if (typeof document !== "undefined" && document.getElementById(styleId) === null) {
  const el = document.createElement("style");
  el.id = styleId;
  el.setAttribute("data-plugin", "dsh-better-sidebar-lite");
  el.textContent = cssText;
  document.head.append(el);
}
var tablist_default = { "label": "bsd-aZEaXa-label", "tabInactive": "bsd-aZEaXa-tabInactive", "tabActive": "bsd-aZEaXa-tabActive", "list": "bsd-aZEaXa-list" };

// src/client/tabbar/tablist.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var tabPanelId = (id) => `bsd-panel-${id}`;
var tabButtonId = (id) => `bsd-tab-${id}`;
function TabList({ tabs, activeId, onSelect, label }) {
  const buttons = (0, import_react2.useRef)(/* @__PURE__ */ new Map());
  const focusTab = (index) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (next === void 0) return;
    buttons.current.get(next.id)?.focus();
    onSelect(next.id);
  };
  const onKeyDown = (e) => {
    const index = tabs.findIndex((t) => t.id === activeId);
    if (index === -1) return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(tabs.length - 1);
        break;
      default:
        break;
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "tablist", "aria-label": label, className: tablist_default.list, onKeyDown, children: tabs.map((t) => {
    const selected = t.id === activeId;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        ref: (node) => {
          if (node) buttons.current.set(t.id, node);
          else buttons.current.delete(t.id);
        },
        role: "tab",
        id: tabButtonId(t.id),
        "aria-selected": selected,
        "aria-controls": tabPanelId(t.id),
        tabIndex: selected ? 0 : -1,
        className: selected ? tablist_default.tabActive : tablist_default.tabInactive,
        onClick: () => onSelect(t.id),
        children: [
          t.icon,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: tablist_default.label, children: t.label })
        ]
      },
      t.id
    );
  }) });
}

// src/client/tabbar/tabpanel.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function TabPanel({ id, labelledBy, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { id, role: "tabpanel", "aria-labelledby": labelledBy, tabIndex: 0, className: "bsd-tabpanel", children });
}

// src/client/icons.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function base({ size = 16, ...rest }) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...rest
  };
}
function FolderIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { ...base(props), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M1.5 4.5a1 1 0 0 1 1-1h3.2l1.6 1.6h5.2a1 1 0 0 1 1 1v5.4a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-7z" }) });
}
function FileIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { ...base(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M3.5 1.5h5.6l3.4 3.4v9.6h-9z" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M9 1.5v3.4h3.4" })
  ] });
}
function SymlinkIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { ...base(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M3 3h5.5l2 2.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M8.5 5.5L13 12" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M9 12h4" })
  ] });
}
function GitBranchIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { ...base(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "4.5", cy: "4", r: "1.6" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "4.5", cy: "12", r: "1.6" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "11.5", cy: "6", r: "1.6" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M4.5 5.6v4.8" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M6.1 6.3c2.6-.4 5.4.5 5.4 2.6" })
  ] });
}
function ChevronRightIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { ...base(props), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M6 3.5L10.5 8L6 12.5" }) });
}
function ChevronDownIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { ...base(props), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M3.5 6L8 10.5L12.5 6" }) });
}
function RefreshIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { ...base(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M13.5 1.8v2.6h-2.6" })
  ] });
}
function CollapseIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { ...base(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M11 3.5V12.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M5 4l4 4l-4 4" })
  ] });
}
function ExpandIcon(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { ...base(props), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M5 3.5v9" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M11 4l-4 4l4 4" })
  ] });
}

// bsd-css:./dock.module.css
var cssText2 = ':root {\n  color-scheme: light;\n  --bsd-bg: #fff;\n  --bsd-bg-raised: #f6f8fa;\n  --bsd-bg-hover: #0000000a;\n  --bsd-rail-bg: #f6f8fa;\n  --bsd-border: #0000001f;\n  --bsd-text: #1f2328;\n  --bsd-fg: #1f2328;\n  --bsd-fg-strong: #161b22;\n  --bsd-fg-muted: #656d76;\n  --bsd-muted: #656d76;\n  --bsd-accent: #0969da;\n  --bsd-danger: #cf222e;\n  --bsd-focus: #0969da;\n  --bsd-hover: #0000000f;\n  --bsd-selected: #0969da1f;\n  --bsd-banner-bg: #0969da1a;\n  --bsd-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\n}\n\nbody[data-ds-dark-theme] {\n  color-scheme: dark;\n  --bsd-bg: #0d1117;\n  --bsd-bg-raised: #161b22;\n  --bsd-bg-hover: #ffffff14;\n  --bsd-rail-bg: #161b22;\n  --bsd-border: #ffffff26;\n  --bsd-text: #e6edf3;\n  --bsd-fg: #e6edf3;\n  --bsd-fg-strong: #f0f6fc;\n  --bsd-fg-muted: #8b949e;\n  --bsd-muted: #8b949e;\n  --bsd-accent: #4493f8;\n  --bsd-danger: #f85149;\n  --bsd-focus: #4493f8;\n  --bsd-hover: #ffffff14;\n  --bsd-selected: #4493f833;\n  --bsd-banner-bg: #f851491f;\n  --bsd-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\n}\n\n.bsd-v2wPsa-root {\n  background: var(--bsd-bg);\n  flex-direction: column;\n  height: 100%;\n  display: flex;\n}\n\n.bsd-v2wPsa-rootFloating {\n  background: var(--bsd-bg);\n  border-left: 1px solid var(--bsd-border);\n  z-index: 30;\n  flex-direction: column;\n  width: 320px;\n  display: flex;\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  right: 0;\n  box-shadow: -4px 0 12px #0000000f;\n}\n\n.bsd-v2wPsa-header {\n  border-bottom: 1px solid var(--bsd-border);\n  background: var(--bsd-bg);\n  flex: none;\n  align-items: center;\n  gap: 4px;\n  padding: 6px 8px 6px 12px;\n  display: flex;\n}\n\n.bsd-v2wPsa-title {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--bsd-text);\n  flex: auto;\n  font-size: 13px;\n  font-weight: 600;\n  overflow: hidden;\n}\n\n.bsd-v2wPsa-iconButton {\n  width: 28px;\n  height: 28px;\n  color: var(--bsd-muted);\n  cursor: pointer;\n  background: none;\n  border: none;\n  border-radius: 6px;\n  justify-content: center;\n  align-items: center;\n  display: inline-flex;\n}\n\n.bsd-v2wPsa-iconButton:hover {\n  background: var(--bsd-bg-hover);\n  color: var(--bsd-text);\n}\n\n.bsd-v2wPsa-body {\n  background: var(--bsd-bg);\n  flex: auto;\n  min-height: 0;\n  overflow: auto;\n}\n\n.bsd-v2wPsa-empty {\n  color: var(--bsd-muted);\n  text-align: center;\n  padding: 24px 16px;\n  font-size: 13px;\n  display: block;\n}\n';
var styleId2 = "bsd-css-740fea66";
if (typeof document !== "undefined" && document.getElementById(styleId2) === null) {
  const el = document.createElement("style");
  el.id = styleId2;
  el.setAttribute("data-plugin", "dsh-better-sidebar-lite");
  el.textContent = cssText2;
  document.head.append(el);
}
var dock_default = { "rootFloating": "bsd-v2wPsa-rootFloating", "header": "bsd-v2wPsa-header", "title": "bsd-v2wPsa-title", "iconButton": "bsd-v2wPsa-iconButton", "body": "bsd-v2wPsa-body", "empty": "bsd-v2wPsa-empty", "root": "bsd-v2wPsa-root" };

// src/client/dock/dock.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var TOGGLE_EVENT = "better-sidebar:toggle";
var DOCK_STORAGE_KEY = "dsh.betterSidebar.dock";
function useTabs(tabs) {
  const cached = (0, import_react3.useRef)(void 0);
  const getSnapshot = (0, import_react3.useCallback)(() => {
    const ids = tabs.ids();
    const active = tabs.active;
    const prev = cached.current;
    if (prev !== void 0 && prev.active === active && prev.ids.length === ids.length && ids.every((id, i) => prev.ids[i] === id)) {
      return prev;
    }
    const next = Object.freeze({ ids, active });
    cached.current = next;
    return next;
  }, [tabs]);
  return (0, import_react3.useSyncExternalStore)((fn) => tabs.subscribe(fn), getSnapshot);
}
function readInitialOpen() {
  if (typeof localStorage === "undefined") return true;
  try {
    const raw = localStorage.getItem(DOCK_STORAGE_KEY);
    if (raw === null) return true;
    const parsed = JSON.parse(raw);
    return parsed.open !== false;
  } catch {
    return true;
  }
}
function persistOpen(open) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify({ open }));
  } catch {
  }
}
function DockRoot({ useSessions, useWorkspaces, rpc, tabs, t, layout }) {
  const snapshot = useTabs(tabs);
  const rootRef = (0, import_react3.useRef)(null);
  const [columnOpen, setColumnOpen] = (0, import_react3.useState)(true);
  (0, import_react3.useEffect)(() => {
    const el = rootRef.current?.parentElement?.parentElement;
    if (el === void 0 || el === null || typeof ResizeObserver === "undefined") return;
    const read = () => {
      setColumnOpen(el.getBoundingClientRect().width > 0);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [open, setOpen] = (0, import_react3.useState)(true);
  const openRef = (0, import_react3.useRef)(true);
  const seeded = (0, import_react3.useRef)(false);
  (0, import_react3.useEffect)(() => {
    if (seeded.current) return;
    seeded.current = true;
    const initial = readInitialOpen();
    openRef.current = initial;
    setOpen(initial);
    persistOpen(initial);
    if (initial) layout.openDetails();
  }, [layout]);
  const applyOpen = (0, import_react3.useCallback)((next) => {
    openRef.current = next;
    setOpen(next);
    persistOpen(next);
    if (next) {
      layout.openDetails();
    } else {
      layout.closeDetails();
    }
  }, [layout]);
  (0, import_react3.useEffect)(() => {
    const onToggle = () => {
      applyOpen(!openRef.current);
    };
    window.addEventListener(TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_EVENT, onToggle);
  }, [applyOpen]);
  const defs = snapshot.ids.map((id) => tabs.get(id)).filter((def) => def !== void 0);
  const labelOf = (def) => typeof def.label === "function" ? def.label() : def.label;
  const listTabs = defs.map((def) => ({ id: def.id, label: labelOf(def), icon: def.icon }));
  const active = snapshot.active;
  const activeDef = active === void 0 ? void 0 : tabs.get(active);
  const contextValue = { rpc, useSessions, useWorkspaces };
  const floating = open && !columnOpen;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(DockContext.Provider, { value: contextValue, children: open ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "div",
    {
      ref: rootRef,
      className: floating ? dock_default.rootFloating : dock_default.root,
      "data-floating": floating || void 0,
      "data-open": true,
      role: "region",
      "aria-label": t("dock.title"),
      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        DockBody,
        {
          onCollapse: () => applyOpen(false),
          tabs: listTabs,
          activeId: active,
          onSelect: (id) => {
            tabs.select(id);
          },
          t,
          activePanel: activeDef?.renderPanel() ?? null
        }
      )
    }
  ) : null });
}
function DockBody({
  onCollapse,
  tabs,
  activeId,
  onSelect,
  t,
  activePanel
}) {
  const active = tabs.find((tab) => tab.id === activeId);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: dock_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: dock_default.title, children: t("dock.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: dock_default.iconButton, "aria-label": t("toggle.collapse"), title: t("toggle.collapse"), onClick: onCollapse, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CollapseIcon, { size: 16 }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      TabList,
      {
        tabs,
        activeId,
        onSelect: (id) => onSelect(id),
        label: t("tablist.label")
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: dock_default.body, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TabPanel, { id: active ? tabPanelId(active.id) : "", labelledBy: active ? tabButtonId(active.id) : "", children: activePanel === null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: dock_default.empty, children: t("empty.title") }) : activePanel }) })
  ] });
}
function createDockEntry(services) {
  const DockEntry = (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    DockRoot,
    {
      useSessions: props.useSessions,
      useWorkspaces: props.useWorkspaces,
      rpc: services.rpc,
      tabs: services.tabs,
      t: services.t,
      layout: services.layout
    }
  );
  return DockEntry;
}

// bsd-css:./footer-toggle.module.css
var cssText3 = ':root {\n  color-scheme: light;\n  --bsd-bg: #fff;\n  --bsd-bg-raised: #f6f8fa;\n  --bsd-bg-hover: #0000000a;\n  --bsd-rail-bg: #f6f8fa;\n  --bsd-border: #0000001f;\n  --bsd-text: #1f2328;\n  --bsd-fg: #1f2328;\n  --bsd-fg-strong: #161b22;\n  --bsd-fg-muted: #656d76;\n  --bsd-muted: #656d76;\n  --bsd-accent: #0969da;\n  --bsd-danger: #cf222e;\n  --bsd-focus: #0969da;\n  --bsd-hover: #0000000f;\n  --bsd-selected: #0969da1f;\n  --bsd-banner-bg: #0969da1a;\n  --bsd-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\n}\n\nbody[data-ds-dark-theme] {\n  color-scheme: dark;\n  --bsd-bg: #0d1117;\n  --bsd-bg-raised: #161b22;\n  --bsd-bg-hover: #ffffff14;\n  --bsd-rail-bg: #161b22;\n  --bsd-border: #ffffff26;\n  --bsd-text: #e6edf3;\n  --bsd-fg: #e6edf3;\n  --bsd-fg-strong: #f0f6fc;\n  --bsd-fg-muted: #8b949e;\n  --bsd-muted: #8b949e;\n  --bsd-accent: #4493f8;\n  --bsd-danger: #f85149;\n  --bsd-focus: #4493f8;\n  --bsd-hover: #ffffff14;\n  --bsd-selected: #4493f833;\n  --bsd-banner-bg: #f851491f;\n  --bsd-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\n}\n\n.bsd-KQo-TG-button {\n  box-sizing: border-box;\n  cursor: pointer;\n  color: var(--dsw-alias-label-primary);\n  background: none;\n  border: none;\n  flex: none;\n  align-items: center;\n  gap: 8px;\n  font-family: inherit;\n  font-size: 14px;\n  line-height: 22px;\n  display: flex;\n  overflow: hidden;\n}\n\n.bsd-KQo-TG-button:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.bsd-KQo-TG-wide {\n  border-radius: 12px;\n  width: calc(100% + 8px);\n  height: 34px;\n  margin: 4px -4px;\n  padding: 6px 2px 6px 10px;\n}\n\n.bsd-KQo-TG-rail {\n  border-radius: 50%;\n  justify-content: center;\n  gap: 0;\n  width: 36px;\n  height: 36px;\n  margin: 8px 0 10px;\n  padding: 0;\n}\n\n.bsd-KQo-TG-label {\n  white-space: nowrap;\n  overflow: hidden;\n}\n';
var styleId3 = "bsd-css-3147cf1a";
if (typeof document !== "undefined" && document.getElementById(styleId3) === null) {
  const el = document.createElement("style");
  el.id = styleId3;
  el.setAttribute("data-plugin", "dsh-better-sidebar-lite");
  el.textContent = cssText3;
  document.head.append(el);
}
var footer_toggle_default = { "wide": "bsd-KQo-TG-wide", "button": "bsd-KQo-TG-button", "label": "bsd-KQo-TG-label", "rail": "bsd-KQo-TG-rail" };

// src/client/dock/footer-toggle.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function createSidebarToggleAction(t) {
  const SidebarToggleAction = (props) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "button",
    {
      type: "button",
      className: props.wide ? footer_toggle_default.wide : footer_toggle_default.rail,
      "aria-label": t("toggle.sidebar"),
      title: t("toggle.sidebar"),
      onClick: () => {
        window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ExpandIcon, { size: props.wide ? 16 : 18 }),
        props.wide && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: footer_toggle_default.label, children: t("toggle.sidebar") })
      ]
    }
  );
  return SidebarToggleAction;
}

// src/client/tabs/explorer/tab-def.ts
var import_react5 = require("react");

// src/client/tabs/explorer/ExplorerPanel.tsx
var import_react4 = require("react");

// src/client/workspace-root.ts
function resolveRoot(sessions, workspaces) {
  const active = sessions.current === void 0 ? void 0 : sessions.byId[sessions.current];
  if (active?.cwd !== void 0) return active.cwd;
  if (workspaces.items.length === 1) return workspaces.items[0]?.path;
  if (workspaces.recentWorkspaceId !== void 0) {
    const recent = workspaces.items.find((w) => w.workspaceId === workspaces.recentWorkspaceId);
    if (recent !== void 0) return recent.path;
  }
  return void 0;
}

// src/contract/rpc.ts
var Endpoints = {
  explorerList: "explorer/list",
  gitStatus: "git/status",
  gitLog: "git/log",
  gitStage: "git/stage",
  gitUnstage: "git/unstage",
  gitCommitDetail: "git/commit-detail",
  gitCommit: "git/commit",
  gitDiscard: "git/discard"
};
var HOST_DEFAULTS = {
  /** Per-level listing cap. */
  maxEntriesPerListing: 2e3,
  /** git log -n cap. */
  maxLogEntries: 100,
  /** git status entry cap. */
  maxStatusEntries: 2e4,
  /** Reject implausibly long payload paths before touching the filesystem. */
  maxRequestPathLength: 4096,
  /** Cumulative name+path byte budget for one listing. */
  totalListingPathBytes: 1024 * 1024
};

// src/client/tabs/explorer/state.ts
function clearError(n) {
  const { loadError: _drop, ...rest } = n;
  void _drop;
  return rest;
}
function basename(p) {
  const parts = p.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? p;
}
function rootEntry(path) {
  return { name: basename(path), path, kind: "directory", hidden: false };
}
var ExplorerStore = class {
  constructor(loader) {
    __publicField(this, "loader", loader);
    __publicField(this, "state");
    /** Monotonic request seq per path; a response applies only to its latest seq. */
    __publicField(this, "seqs", /* @__PURE__ */ new Map());
    /** Per-path AbortController to cancel superseded listings at the transport. */
    __publicField(this, "controllers", /* @__PURE__ */ new Map());
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    this.state = {
      root: void 0,
      surface: { phase: "no-workspace" },
      nodes: {},
      selectedPath: void 0,
      focusedPath: void 0,
      rootGen: 0
    };
  }
  snapshot() {
    return this.state;
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  // ---- actions ----
  /**
   * Replace the tree root and reset all tree state. Undefined means "no
   * workspace" (empty state). Bumps rootGen so any in-flight results from the
   * previous tree are discarded. Does not list — call loadRoot().
   */
  setRoot(path) {
    this.abortAll();
    const rootGen = this.state.rootGen + 1;
    if (path === void 0) {
      this.state = {
        root: void 0,
        surface: { phase: "no-workspace" },
        nodes: {},
        selectedPath: void 0,
        focusedPath: void 0,
        rootGen
      };
      this.emit();
      return;
    }
    const node = { entry: rootEntry(path), expanded: false, loadState: "idle" };
    this.state = {
      root: path,
      surface: { phase: "loading" },
      nodes: { [path]: node },
      selectedPath: void 0,
      focusedPath: void 0,
      rootGen
    };
    this.emit();
  }
  /** List the root directory, driving the surface through loading/loaded/root-error. */
  async loadRoot() {
    const root = this.state.root;
    if (root === void 0) return;
    if (this.state.nodes[root] === void 0) this.ensureNode(rootEntry(root));
    this.applyNode(root, (n) => ({ ...clearError(n), loadState: "loading" }));
    this.state = { ...this.state, surface: { phase: "loading" } };
    this.emit();
    await this.loadList(root, true);
  }
  /** Expand a directory, lazily listing it once if its children are not yet loaded. */
  async expand(path) {
    const existing = this.state.nodes[path];
    const entry = existing?.entry ?? this.findChildEntry(path);
    if (entry === void 0 || entry.kind !== "directory") return;
    if (existing?.children !== void 0) {
      if (existing.expanded !== true) this.applyNode(path, (n) => ({ ...n, expanded: true }));
      return;
    }
    if (existing?.expanded === true && existing.loadState === "loading") return;
    if (existing === void 0) this.ensureNode(entry);
    this.applyNode(path, (n) => ({ ...clearError(n), loadState: "loading", expanded: true }));
    await this.loadList(path, false);
  }
  /** Collapse a directory; children remain loaded for synchronous re-open. */
  collapse(path) {
    const node = this.state.nodes[path];
    if (node === void 0 || !node.expanded) return;
    this.applyNode(path, (n) => ({ ...n, expanded: false }));
  }
  /** Toggle expansion of a directory row (works for not-yet-loaded children). */
  toggle(path) {
    const existing = this.state.nodes[path];
    const entry = existing?.entry ?? this.findChildEntry(path);
    if (entry === void 0 || entry.kind !== "directory") return;
    if (existing?.expanded === true) this.collapse(path);
    else void this.expand(path);
  }
  /**
   * Manual refresh: re-list the root and every currently-loaded directory in
   * place (diff-in-place per D2 §5.2). Keeps expansion/selection.
   */
  async refresh() {
    const root = this.state.root;
    const loadedDirs = Object.values(this.state.nodes).filter((n) => n.children !== void 0 && n.entry.kind === "directory").map((n) => n.entry.path);
    const jobs = [];
    if (root !== void 0 && loadedDirs.includes(root)) jobs.push(this.loadList(root, true));
    for (const p of loadedDirs) {
      if (p !== root) jobs.push(this.loadList(p, false));
    }
    await Promise.all(jobs);
  }
  /** Select a path (single-select); passes through undefined to clear. */
  select(path) {
    if (path === this.state.selectedPath) return;
    this.state = { ...this.state, selectedPath: path };
    this.emit();
  }
  /** Move keyboard focus to a path (kept separate from selection). */
  focus(path) {
    if (path === this.state.focusedPath) return;
    this.state = { ...this.state, focusedPath: path };
    this.emit();
  }
  /**
   * Prune a node and its whole subtree (D2 §8 non-root path-deleted). Removes
   * it from the parent's children and from the node map; a pruned selection
   * clears, and focus moves to the pruned node's parent.
   */
  prunePath(path) {
    const state = this.state;
    if (state.nodes[path] === void 0 || path === state.root) return;
    const toRemove = /* @__PURE__ */ new Set();
    const collect = (p) => {
      if (toRemove.has(p)) return;
      toRemove.add(p);
      const n = state.nodes[p];
      if (n?.children !== void 0) for (const c of n.children) collect(c.path);
    };
    collect(path);
    const nodes = {};
    for (const [p, n] of Object.entries(state.nodes)) {
      if (toRemove.has(p)) continue;
      if (n.children !== void 0) {
        const kept = n.children.filter((c) => !toRemove.has(c.path));
        if (kept.length !== n.children.length) {
          nodes[p] = { ...n, children: kept };
          continue;
        }
      }
      nodes[p] = n;
    }
    const selectedPath = state.selectedPath !== void 0 && toRemove.has(state.selectedPath) ? void 0 : state.selectedPath;
    let focusedPath = state.focusedPath;
    if (focusedPath !== void 0 && toRemove.has(focusedPath)) {
      let ancestor = this.parentOf(state.nodes, focusedPath);
      while (ancestor !== void 0 && toRemove.has(ancestor)) {
        ancestor = this.parentOf(state.nodes, ancestor);
      }
      focusedPath = ancestor;
    }
    this.state = { ...state, nodes, selectedPath, focusedPath };
    this.emit();
  }
  // ---- internals ----
  async loadList(path, isRoot) {
    const gen = this.state.rootGen;
    const seq = this.seqFor(path);
    this.controllers.get(path)?.abort();
    const controller = new AbortController();
    this.controllers.set(path, controller);
    this.applyNode(path, (n) => ({ ...clearError(n), loadState: "loading" }));
    if (isRoot) {
      this.state = { ...this.state, surface: { phase: "loading" } };
      this.emit();
    }
    const result = await this.loader(path, controller.signal);
    if (controller.signal.aborted) return;
    if (gen !== this.state.rootGen) return;
    if (seq !== this.seqs.get(path)) return;
    const node = this.state.nodes[path];
    if (node === void 0) return;
    this.controllers.delete(path);
    if (!isRoot && !result.ok && result.error.code === "not-found") {
      this.prunePath(path);
      return;
    }
    const next = result.ok ? { ...clearError(node), loadState: "loaded", children: result.value.entries } : { ...node, loadState: "error", loadError: result.error };
    const surface = isRoot ? result.ok ? { phase: "loaded" } : { phase: "root-error", error: result.error } : this.state.surface;
    this.state = {
      ...this.state,
      nodes: { ...this.state.nodes, [path]: next },
      ...isRoot ? { surface } : {}
    };
    this.emit();
  }
  seqFor(path) {
    const next = (this.seqs.get(path) ?? 0) + 1;
    this.seqs.set(path, next);
    return next;
  }
  applyNode(path, update) {
    const node = this.state.nodes[path];
    if (node === void 0) return;
    const updated = update(node);
    this.state = { ...this.state, nodes: { ...this.state.nodes, [path]: updated } };
    this.emit();
  }
  ensureNode(entry) {
    if (this.state.nodes[entry.path] !== void 0) return;
    const node = { entry, expanded: false, loadState: "idle" };
    this.state = { ...this.state, nodes: { ...this.state.nodes, [entry.path]: node } };
    this.emit();
  }
  findChildEntry(path) {
    for (const n of Object.values(this.state.nodes)) {
      const found = n.children?.find((c) => c.path === path);
      if (found !== void 0) return found;
    }
    return void 0;
  }
  parentOf(nodes, path) {
    for (const [p, n] of Object.entries(nodes)) {
      if (n.children?.some((c) => c.path === path)) return p;
    }
    return void 0;
  }
  abortAll() {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
  emit() {
    for (const fn of Array.from(this.listeners)) fn();
  }
};

// bsd-css:./ExplorerPanel.module.css
var cssText4 = ".bsd-bZtlRa-panel {\n  height: 100%;\n  color: var(--bsd-fg, #d7d7d9);\n  background: var(--bsd-bg, #1e1f22);\n  flex-direction: column;\n  font-size: 13px;\n  line-height: 1.5;\n  display: flex;\n  overflow: hidden;\n}\n\n.bsd-bZtlRa-panelHead {\n  border-bottom: 1px solid var(--bsd-border, #80808040);\n  background: var(--bsd-bg-raised, #26272b);\n  justify-content: space-between;\n  align-items: center;\n  padding: 6px 10px;\n  display: flex;\n}\n\n.bsd-bZtlRa-title {\n  color: var(--bsd-fg-strong, #f0f0f2);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-weight: 600;\n  overflow: hidden;\n}\n\n.bsd-bZtlRa-refresh {\n  width: 24px;\n  height: 24px;\n  color: var(--bsd-fg-muted, #a6a6ab);\n  cursor: pointer;\n  background: none;\n  border: none;\n  border-radius: 4px;\n  justify-content: center;\n  align-items: center;\n  padding: 0;\n  display: inline-flex;\n}\n\n.bsd-bZtlRa-refresh:hover {\n  color: var(--bsd-fg-strong, #f0f0f2);\n  background: var(--bsd-hover, #8080802e);\n}\n\n.bsd-bZtlRa-refresh:focus-visible {\n  outline: 2px solid var(--bsd-focus, #4a9eff);\n  outline-offset: -1px;\n}\n\n.bsd-bZtlRa-srOnly {\n  clip: rect(0 0 0 0);\n  white-space: nowrap;\n  border: 0;\n  width: 1px;\n  height: 1px;\n  margin: -1px;\n  padding: 0;\n  position: absolute;\n  overflow: hidden;\n}\n\n.bsd-bZtlRa-surface, .bsd-bZtlRa-surfaceLoading {\n  color: var(--bsd-fg-muted, #a6a6ab);\n  padding: 16px 14px;\n}\n\n.bsd-bZtlRa-surfaceTitle {\n  color: var(--bsd-fg-strong, #f0f0f2);\n  margin-bottom: 6px;\n  font-weight: 600;\n}\n\n.bsd-bZtlRa-surfaceHint {\n  margin-bottom: 10px;\n  font-size: 12px;\n}\n\n.bsd-bZtlRa-surfaceLoading {\n  font-style: italic;\n}\n\n.bsd-bZtlRa-retry {\n  border: 1px solid var(--bsd-border, #80808066);\n  color: var(--bsd-fg, #d7d7d9);\n  background: var(--bsd-bg-raised, #26272b);\n  cursor: pointer;\n  border-radius: 4px;\n  align-items: center;\n  padding: 3px 10px;\n  font-size: 12px;\n  display: inline-flex;\n}\n\n.bsd-bZtlRa-retry:hover {\n  background: var(--bsd-hover, #8080802e);\n}\n\n.bsd-bZtlRa-retry:focus-visible {\n  outline: 2px solid var(--bsd-focus, #4a9eff);\n  outline-offset: -1px;\n}\n\n.bsd-bZtlRa-tree {\n  flex: 1;\n  padding: 4px 0;\n  overflow-y: auto;\n}\n\n.bsd-bZtlRa-row {\n  height: 24px;\n  color: var(--bsd-fg, #d7d7d9);\n  white-space: nowrap;\n  cursor: default;\n  user-select: none;\n  align-items: center;\n  gap: 4px;\n  padding-right: 8px;\n  display: flex;\n}\n\n.bsd-bZtlRa-row:hover {\n  background: var(--bsd-hover, #80808024);\n}\n\n.bsd-bZtlRa-rowSelected {\n  background: var(--bsd-selected, #4a9eff47);\n}\n\n.bsd-bZtlRa-rowFocused {\n  outline: 1px solid var(--bsd-focus, #4a9eff);\n  outline-offset: -1px;\n}\n\n.bsd-bZtlRa-caret {\n  width: 16px;\n  height: 16px;\n  color: var(--bsd-fg-muted, #a6a6ab);\n  cursor: pointer;\n  background: none;\n  border: none;\n  border-radius: 3px;\n  flex: none;\n  justify-content: center;\n  align-items: center;\n  padding: 0;\n  display: inline-flex;\n}\n\n.bsd-bZtlRa-caret:hover {\n  color: var(--bsd-fg-strong, #f0f0f2);\n  background: var(--bsd-hover, #8080802e);\n}\n\n.bsd-bZtlRa-caretPlaceholder {\n  cursor: default;\n}\n\n.bsd-bZtlRa-caretPlaceholder:hover {\n  background: none;\n}\n\n.bsd-bZtlRa-icon {\n  color: var(--bsd-accent, #b48ead);\n  flex: none;\n  align-items: center;\n  display: inline-flex;\n}\n\n.bsd-bZtlRa-name {\n  text-overflow: ellipsis;\n  overflow: hidden;\n}\n\n.bsd-bZtlRa-symlinkTarget {\n  color: var(--bsd-fg-muted, #8a8a90);\n  text-overflow: ellipsis;\n  flex: none;\n  max-width: 140px;\n  margin-left: auto;\n  padding-left: 8px;\n  font-size: 11px;\n  overflow: hidden;\n}\n\n.bsd-bZtlRa-retryInline {\n  flex: none;\n  margin-left: auto;\n}\n\n.bsd-bZtlRa-inlineError {\n  color: var(--bsd-danger, #c0392b);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  max-width: 180px;\n  margin-left: 6px;\n  font-size: 11px;\n  overflow: hidden;\n}\n";
var styleId4 = "bsd-css-25a25d5c";
if (typeof document !== "undefined" && document.getElementById(styleId4) === null) {
  const el = document.createElement("style");
  el.id = styleId4;
  el.setAttribute("data-plugin", "dsh-better-sidebar-lite");
  el.textContent = cssText4;
  document.head.append(el);
}
var ExplorerPanel_default = { "row": "bsd-bZtlRa-row", "caretPlaceholder": "bsd-bZtlRa-caretPlaceholder", "surfaceHint": "bsd-bZtlRa-surfaceHint", "name": "bsd-bZtlRa-name", "panelHead": "bsd-bZtlRa-panelHead", "panel": "bsd-bZtlRa-panel", "refresh": "bsd-bZtlRa-refresh", "title": "bsd-bZtlRa-title", "rowFocused": "bsd-bZtlRa-rowFocused", "rowSelected": "bsd-bZtlRa-rowSelected", "srOnly": "bsd-bZtlRa-srOnly", "retry": "bsd-bZtlRa-retry", "surface": "bsd-bZtlRa-surface", "surfaceTitle": "bsd-bZtlRa-surfaceTitle", "caret": "bsd-bZtlRa-caret", "icon": "bsd-bZtlRa-icon", "surfaceLoading": "bsd-bZtlRa-surfaceLoading", "retryInline": "bsd-bZtlRa-retryInline", "tree": "bsd-bZtlRa-tree", "inlineError": "bsd-bZtlRa-inlineError", "symlinkTarget": "bsd-bZtlRa-symlinkTarget" };

// src/client/tabs/explorer/TreeNodeRow.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function RowIcon({ entry }) {
  if (entry.kind === "directory") return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(FolderIcon, { size: 15 });
  if (entry.kind === "symlink") return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SymlinkIcon, { size: 15 });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(FileIcon, { size: 15 });
}
function TreeNodeRow(props) {
  const {
    entry,
    depth,
    expanded,
    selected,
    focused,
    loadState,
    retryLabel,
    expandLabel,
    collapseLabel,
    errorMessage,
    onToggle,
    onActivate,
    onOpen,
    onRetry,
    rowRef
  } = props;
  const dir = entry.kind === "directory";
  const inlineError = dir && loadState === "error";
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "div",
    {
      ref: rowRef,
      role: "treeitem",
      tabIndex: focused ? 0 : -1,
      "aria-selected": selected,
      "aria-expanded": dir ? expanded : void 0,
      "aria-label": entry.name,
      className: [
        ExplorerPanel_default.row,
        selected && ExplorerPanel_default.rowSelected,
        focused && ExplorerPanel_default.rowFocused
      ].filter(Boolean).join(" "),
      "data-path": entry.path,
      style: { paddingLeft: 8 + depth * 16 },
      onClick: onActivate,
      onDoubleClick: () => {
        if (dir) onToggle();
        else onOpen();
      },
      children: [
        dir ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            tabIndex: -1,
            "data-caret": true,
            "aria-label": expanded ? collapseLabel : expandLabel,
            className: ExplorerPanel_default.caret,
            onClick: (event) => {
              event.stopPropagation();
              onToggle();
            },
            children: expanded ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ChevronDownIcon, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ChevronRightIcon, { size: 14 })
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: [ExplorerPanel_default.caret, ExplorerPanel_default.caretPlaceholder].join(" "), "aria-hidden": true }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ExplorerPanel_default.icon, "aria-hidden": true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(RowIcon, { entry }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ExplorerPanel_default.name, children: entry.name }),
        entry.kind === "symlink" && entry.linkTarget !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: ExplorerPanel_default.symlinkTarget, title: entry.linkTarget, "aria-hidden": true, children: [
          "\u2192 ",
          entry.linkTarget
        ] }),
        inlineError && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
          errorMessage !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ExplorerPanel_default.inlineError, children: errorMessage }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: ExplorerPanel_default.retry,
              onClick: (event) => {
                event.stopPropagation();
                onRetry();
              },
              children: retryLabel
            }
          )
        ] })
      ]
    }
  );
}

// src/client/tabs/explorer/ExplorerPanel.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function flattenVisible(state) {
  const rows = [];
  const root = state.root;
  const rootChildren = root === void 0 ? void 0 : state.nodes[root]?.children;
  if (rootChildren === void 0) return rows;
  const walk = (entries, depth) => {
    for (const entry of entries) {
      rows.push({ entry, depth });
      if (entry.kind === "directory") {
        const n = state.nodes[entry.path];
        if (n?.expanded === true) walk(n.children ?? [], depth + 1);
      }
    }
  };
  walk(rootChildren, 0);
  return rows;
}
function ExplorerPanel({ rpc, emitter, t }) {
  const { useSessions, useWorkspaces } = useDock();
  const sessions = useSessions((s) => s);
  const workspaces = useWorkspaces((w) => w);
  const [store] = (0, import_react4.useState)(() => new ExplorerStore(
    (path, signal) => rpc.call(Endpoints.explorerList, { path }, { signal })
  ));
  const state = (0, import_react4.useSyncExternalStore)(store.subscribe.bind(store), store.snapshot.bind(store));
  const root = (0, import_react4.useMemo)(() => resolveRoot(sessions, workspaces), [sessions, workspaces]);
  (0, import_react4.useEffect)(() => {
    store.setRoot(root);
    void store.loadRoot();
  }, [store, root]);
  const rowEls = (0, import_react4.useRef)(/* @__PURE__ */ new Map());
  (0, import_react4.useEffect)(() => {
    const el = state.focusedPath === void 0 ? void 0 : rowEls.current.get(state.focusedPath);
    el?.focus();
  }, [state.focusedPath]);
  const openFile = (row, source) => {
    if (state.root === void 0) return;
    emitter.emit({
      path: row.entry.path,
      name: row.entry.name,
      kind: "file",
      source,
      rootPath: state.root
    });
  };
  const moveFocusTo = (index) => {
    const rows = flattenVisible(state);
    if (rows.length === 0) return;
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    const target = rows[clamped];
    if (target === void 0) return;
    store.focus(target.entry.path);
    store.select(target.entry.path);
  };
  const parentOf = (path) => {
    for (const n of Object.values(state.nodes)) {
      if (n.children?.some((c) => c.path === path)) return n.entry.path;
    }
    return void 0;
  };
  const expandOneLevel = async (path) => {
    await store.expand(path);
    const after = store.snapshot().nodes[path];
    for (const kid of after?.children ?? []) {
      if (kid.kind === "directory") {
        const kn = store.snapshot().nodes[kid.path];
        if (kn?.expanded !== true) void store.expand(kid.path);
      }
    }
  };
  const onKeyDown = (event) => {
    const focused = state.focusedPath;
    if (focused === void 0) return;
    const rows = flattenVisible(state);
    const idx = rows.findIndex((r) => r.entry.path === focused);
    if (idx === -1) return;
    const row = rows[idx];
    if (row === void 0) return;
    const node = state.nodes[focused];
    const dir = row.entry.kind === "directory";
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocusTo(idx + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocusTo(idx - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        if (dir && node?.expanded !== true) {
          void store.expand(focused);
        } else if (dir && node?.expanded === true && (node.children?.length ?? 0) > 0) {
          moveFocusTo(idx + 1);
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (dir && node?.expanded === true) {
          store.collapse(focused);
        } else {
          const parent = parentOf(focused);
          if (parent !== void 0) store.focus(parent);
        }
        break;
      case "Home":
        event.preventDefault();
        moveFocusTo(0);
        break;
      case "End":
        event.preventDefault();
        moveFocusTo(rows.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (dir) void store.toggle(focused);
        else openFile(row, "keyboard-enter");
        break;
      case "*":
        event.preventDefault();
        void expandOneLevel(focused);
        break;
      default:
        break;
    }
  };
  const renderNodes = (entries, depth) => {
    return entries.map((entry) => {
      const n = state.nodes[entry.path];
      const dir = entry.kind === "directory";
      const expanded = dir && n?.expanded === true;
      const loadState = n?.loadState ?? (dir ? "idle" : "loaded");
      const selected = entry.path === state.selectedPath;
      const focused = entry.path === state.focusedPath;
      const children = dir && expanded ? n?.children ?? [] : [];
      return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          TreeNodeRow,
          {
            entry,
            depth,
            expanded,
            selected,
            focused,
            loadState,
            retryLabel: t("retry"),
            expandLabel: t("expand"),
            collapseLabel: t("collapse"),
            errorMessage: n?.loadError?.message,
            onToggle: () => {
              void store.toggle(entry.path);
            },
            onActivate: () => {
              store.select(entry.path);
              store.focus(entry.path);
            },
            onOpen: () => openFile({ entry, depth }, "double-click"),
            onRetry: () => {
              void store.expand(entry.path);
            },
            rowRef: (el) => {
              if (el) rowEls.current.set(entry.path, el);
              else rowEls.current.delete(entry.path);
            }
          }
        ),
        children.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "group", children: renderNodes(children, depth + 1) })
      ] }, entry.path);
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: ExplorerPanel_default.panel, role: "region", "aria-label": "Explorer", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: ExplorerPanel_default.panelHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: ExplorerPanel_default.title, children: t("tabLabel") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("button", { type: "button", className: ExplorerPanel_default.refresh, onClick: () => {
        void store.refresh();
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(RefreshIcon, { size: 15 }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: ExplorerPanel_default.srOnly, children: t("refresh") })
      ] })
    ] }),
    state.surface.phase === "no-workspace" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: ExplorerPanel_default.surface, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: ExplorerPanel_default.surfaceTitle, children: t("noWorkspace") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: ExplorerPanel_default.surfaceHint, children: t("noWorkspaceHint") })
    ] }),
    state.surface.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: ExplorerPanel_default.surfaceLoading, role: "status", children: t("loading") }),
    state.surface.phase === "root-error" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: ExplorerPanel_default.surface, role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: ExplorerPanel_default.surfaceTitle, children: state.surface.error.code === "not-found" ? t("rootDeleted") : t("loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: ExplorerPanel_default.surfaceHint, children: state.surface.error.message }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: ExplorerPanel_default.retry, onClick: () => {
        void store.loadRoot();
      }, children: t("retry") })
    ] }),
    state.surface.phase === "loaded" && state.root !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "div",
      {
        className: ExplorerPanel_default.tree,
        role: "tree",
        "aria-label": "Explorer \u2014 " + basename(state.root),
        onKeyDown,
        children: renderNodes(state.nodes[state.root]?.children ?? [], 0)
      }
    )
  ] });
}

// src/client/tabs/explorer/locales.ts
var NS = "betterSidebar.explorer";
var zh = {
  tabLabel: "\u8D44\u6E90\u7BA1\u7406\u5668",
  noWorkspace: "\u672A\u6253\u5F00\u5DE5\u4F5C\u533A",
  noWorkspaceHint: "\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u6216\u5DE5\u4F5C\u533A\u540E\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u6587\u4EF6\u6811\u3002",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  retry: "\u91CD\u8BD5",
  refresh: "\u5237\u65B0",
  rootDeleted: "\u5DE5\u4F5C\u533A\u76EE\u5F55\u5DF2\u4E0D\u5B58\u5728",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  expand: "\u5C55\u5F00",
  collapse: "\u6536\u8D77",
  openFile: "\u6253\u5F00\u6587\u4EF6"
};
var en = {
  tabLabel: "Explorer",
  noWorkspace: "No workspace open",
  noWorkspaceHint: "Open a session or workspace to see its file tree here.",
  loading: "Loading\u2026",
  retry: "Retry",
  refresh: "Refresh",
  rootDeleted: "The workspace directory no longer exists",
  loadFailed: "Failed to load",
  expand: "Expand",
  collapse: "Collapse",
  openFile: "Open file"
};

// src/client/tabs/explorer/tab-def.ts
function createExplorerTabDef(ctx, api) {
  const t = ctx.locale.bind(NS);
  return {
    id: "explorer",
    order: 10,
    label: () => t("tabLabel"),
    icon: (0, import_react5.createElement)(FolderIcon),
    renderPanel: () => (0, import_react5.createElement)(ExplorerPanel, { rpc: api.rpc, emitter: api.emitter, t })
  };
}

// src/client/tabs/git/tab-def.ts
var import_react7 = require("react");

// src/client/tabs/git/git-tab.tsx
var import_react6 = require("react");

// bsd-css:./git.module.css
var cssText5 = ".bsd-3XgNyW-composer {\n  border: 1px solid var(--bsd-border, #0000001f);\n  background: var(--bsd-bg-raised, #00000005);\n  border-radius: 8px;\n  flex-direction: column;\n  gap: 8px;\n  margin: 12px 0;\n  padding: 10px;\n  display: flex;\n}\n\n.bsd-3XgNyW-composerInput {\n  resize: vertical;\n  box-sizing: border-box;\n  border: 1px solid var(--bsd-border, #0000001f);\n  background: var(--bsd-bg, #fff);\n  width: 100%;\n  min-height: 56px;\n  color: var(--bsd-text, #1f2328);\n  border-radius: 6px;\n  padding: 8px;\n  font-family: inherit;\n  font-size: 13px;\n  line-height: 1.4;\n}\n\n.bsd-3XgNyW-composerInput:focus {\n  outline: 2px solid var(--bsd-focus, #0969da);\n  outline-offset: -1px;\n}\n\n.bsd-3XgNyW-composerRow {\n  color: var(--bsd-muted, #656d76);\n  cursor: pointer;\n  align-items: center;\n  gap: 6px;\n  font-size: 12px;\n  display: flex;\n}\n\n.bsd-3XgNyW-commitButton {\n  background: var(--bsd-accent, #0969da);\n  color: #fff;\n  cursor: pointer;\n  border: none;\n  border-radius: 6px;\n  align-self: flex-start;\n  padding: 6px 14px;\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.bsd-3XgNyW-commitButton:disabled {\n  background: var(--bsd-bg-hover, #0000000a);\n  color: var(--bsd-muted, #656d76);\n  cursor: default;\n}\n\n.bsd-3XgNyW-discardAction {\n  color: var(--bsd-danger, #cf222e);\n  border-color: var(--bsd-border, #0000001f);\n}\n\n.bsd-3XgNyW-discardAction:hover {\n  background: var(--bsd-danger, #cf222e);\n  color: #fff;\n}\n\n.bsd-3XgNyW-discardAllRow {\n  justify-content: flex-end;\n  margin-bottom: 8px;\n  display: flex;\n}\n\n.bsd-3XgNyW-discardAllButton {\n  border: 1px solid var(--bsd-danger, #cf222e);\n  color: var(--bsd-danger, #cf222e);\n  cursor: pointer;\n  background: none;\n  border-radius: 6px;\n  padding: 4px 10px;\n  font-size: 12px;\n}\n\n.bsd-3XgNyW-discardAllButton:hover {\n  background: var(--bsd-danger, #cf222e);\n  color: #fff;\n}\n\n.bsd-3XgNyW-panel {\n  min-width: 0;\n  height: 100%;\n  color: var(--bsd-text, #1f2328);\n  flex-direction: column;\n  display: flex;\n  overflow: hidden;\n}\n\n.bsd-3XgNyW-header {\n  border-bottom: 1px solid var(--bsd-border, #0000001f);\n  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 12px;\n  display: flex;\n}\n\n.bsd-3XgNyW-branch {\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  font-size: 13px;\n  font-weight: 600;\n  display: flex;\n}\n\n.bsd-3XgNyW-branchName {\n  font-family: var(--bsd-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  overflow: hidden;\n}\n\n.bsd-3XgNyW-iconButton {\n  color: var(--bsd-muted, #656d76);\n  cursor: pointer;\n  background: none;\n  border: none;\n  border-radius: 4px;\n  justify-content: center;\n  align-items: center;\n  padding: 4px;\n  display: inline-flex;\n}\n\n.bsd-3XgNyW-iconButton:hover {\n  background: var(--bsd-bg-hover, #0000000a);\n}\n\n.bsd-3XgNyW-body {\n  flex: 1;\n  min-height: 0;\n  padding: 8px 12px 16px;\n  overflow-y: auto;\n}\n\n.bsd-3XgNyW-banner {\n  background: var(--bsd-banner-bg, #0969da1a);\n  border: 1px solid var(--bsd-border, #0000001f);\n  color: var(--bsd-text, #1f2328);\n  border-radius: 6px;\n  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n  margin: 8px 0;\n  padding: 8px 10px;\n  font-size: 13px;\n  display: flex;\n}\n\n.bsd-3XgNyW-retryButton {\n  border: 1px solid var(--bsd-border, #0000001f);\n  background: var(--bsd-bg-hover, #0000000a);\n  color: var(--bsd-accent, #0969da);\n  cursor: pointer;\n  border-radius: 4px;\n  flex-shrink: 0;\n  padding: 4px 8px;\n  font-size: 12px;\n}\n\n.bsd-3XgNyW-retryButton:hover {\n  background: var(--bsd-bg-hover, #00000014);\n}\n\n.bsd-3XgNyW-state {\n  text-align: center;\n  color: var(--bsd-text, #1f2328);\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  padding: 24px 16px;\n  display: flex;\n}\n\n.bsd-3XgNyW-stateTitle {\n  font-size: 14px;\n  font-weight: 600;\n}\n\n.bsd-3XgNyW-stateHint {\n  color: var(--bsd-muted, #656d76);\n  font-size: 13px;\n}\n\n.bsd-3XgNyW-statePath {\n  color: var(--bsd-muted, #656d76);\n  font-size: 12px;\n  font-family: var(--bsd-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  word-break: break-all;\n}\n\n.bsd-3XgNyW-stateAction {\n  background: var(--bsd-accent, #0969da);\n  color: #fff;\n  cursor: pointer;\n  border: none;\n  border-radius: 6px;\n  margin-top: 4px;\n  padding: 6px 12px;\n  font-size: 13px;\n}\n\n.bsd-3XgNyW-statusSections {\n  flex-direction: column;\n  gap: 12px;\n  display: flex;\n}\n\n.bsd-3XgNyW-section {\n  flex-direction: column;\n  min-width: 0;\n  display: flex;\n}\n\n.bsd-3XgNyW-sectionHeader {\n  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 4px;\n  display: flex;\n}\n\n.bsd-3XgNyW-sectionTitle {\n  text-transform: uppercase;\n  letter-spacing: .04em;\n  color: var(--bsd-muted, #656d76);\n  font-size: 11px;\n  font-weight: 600;\n}\n\n.bsd-3XgNyW-sectionCount {\n  color: var(--bsd-muted, #656d76);\n  margin-left: 6px;\n  font-weight: 500;\n}\n\n.bsd-3XgNyW-sectionAction {\n  color: var(--bsd-accent, #0969da);\n  cursor: pointer;\n  background: none;\n  border: none;\n  padding: 2px 6px;\n  font-size: 12px;\n}\n\n.bsd-3XgNyW-sectionAction:hover {\n  text-decoration: underline;\n}\n\n.bsd-3XgNyW-rows {\n  flex-direction: column;\n  min-width: 0;\n  display: flex;\n}\n\n.bsd-3XgNyW-row {\n  border-radius: 4px;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  padding: 4px 6px;\n  display: flex;\n}\n\n.bsd-3XgNyW-row:hover {\n  background: var(--bsd-bg-hover, #0000000a);\n}\n\n.bsd-3XgNyW-glyph {\n  text-align: center;\n  width: 16px;\n  font-size: 12px;\n  font-weight: 700;\n  font-family: var(--bsd-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  flex-shrink: 0;\n}\n\n.bsd-3XgNyW-added {\n  color: #1a7f37;\n}\n\n.bsd-3XgNyW-modified {\n  color: #9a6700;\n}\n\n.bsd-3XgNyW-deleted {\n  color: #cf222e;\n}\n\n.bsd-3XgNyW-renamed {\n  color: #1b7c83;\n}\n\n.bsd-3XgNyW-unmerged {\n  color: #cf222e;\n}\n\n.bsd-3XgNyW-untracked {\n  color: var(--bsd-muted, #656d76);\n}\n\n.bsd-3XgNyW-filePath {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  flex: 1;\n  min-width: 0;\n  font-size: 13px;\n  overflow: hidden;\n}\n\n.bsd-3XgNyW-fileName {\n  font-weight: 600;\n}\n\n.bsd-3XgNyW-fileDir, .bsd-3XgNyW-originalPath {\n  color: var(--bsd-muted, #656d76);\n}\n\n.bsd-3XgNyW-rowActions {\n  flex-shrink: 0;\n  gap: 4px;\n  display: none;\n}\n\n.bsd-3XgNyW-row:hover .bsd-3XgNyW-rowActions, .bsd-3XgNyW-row:focus-within .bsd-3XgNyW-rowActions {\n  display: inline-flex;\n}\n\n.bsd-3XgNyW-rowAction {\n  border: 1px solid var(--bsd-border, #0000001f);\n  background: var(--bsd-bg-hover, #0000000a);\n  color: var(--bsd-accent, #0969da);\n  cursor: pointer;\n  border-radius: 4px;\n  padding: 2px 6px;\n  font-size: 12px;\n}\n\n.bsd-3XgNyW-rowAction:hover {\n  background: var(--bsd-bg-hover, #00000014);\n}\n\n.bsd-3XgNyW-conflictSection .bsd-3XgNyW-sectionHeader .bsd-3XgNyW-sectionTitle {\n  color: #cf222e;\n}\n\n.bsd-3XgNyW-commits {\n  flex-direction: column;\n  gap: 8px;\n  display: flex;\n}\n\n.bsd-3XgNyW-commitRow {\n  text-align: left;\n  cursor: pointer;\n  border: none;\n  border: 1px solid var(--bsd-border, #0000001f);\n  background: none;\n  border-radius: 6px;\n  flex-direction: column;\n  gap: 2px;\n  width: 100%;\n  min-width: 0;\n  padding: 6px 8px;\n  display: flex;\n}\n\n.bsd-3XgNyW-commitSubject {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n  font-size: 13px;\n  overflow: hidden;\n}\n\n.bsd-3XgNyW-commitMeta {\n  color: var(--bsd-muted, #656d76);\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  font-size: 11px;\n  display: flex;\n}\n\n.bsd-3XgNyW-commitHash {\n  font-family: var(--bsd-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  flex-shrink: 0;\n}\n\n.bsd-3XgNyW-commitAuthor {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  overflow: hidden;\n}\n\n.bsd-3XgNyW-commitDate {\n  flex-shrink: 0;\n}\n\n.bsd-3XgNyW-loadMore {\n  border: 1px solid var(--bsd-border, #0000001f);\n  background: var(--bsd-bg-hover, #0000000a);\n  width: 100%;\n  color: var(--bsd-text, #1f2328);\n  cursor: pointer;\n  border-radius: 6px;\n  margin-top: 8px;\n  padding: 6px;\n  font-size: 13px;\n}\n\n.bsd-3XgNyW-empty, .bsd-3XgNyW-loading {\n  text-align: center;\n  color: var(--bsd-muted, #656d76);\n  padding: 16px 8px;\n  font-size: 13px;\n}\n\n.bsd-3XgNyW-logSection {\n  border-top: 1px solid var(--bsd-border, #0000001f);\n  margin-top: 16px;\n}\n\n.bsd-3XgNyW-logTitle {\n  text-transform: uppercase;\n  letter-spacing: .04em;\n  color: var(--bsd-muted, #656d76);\n  padding: 8px 4px 4px;\n  font-size: 11px;\n  font-weight: 600;\n}\n\n.bsd-3XgNyW-commitDetail {\n  flex-direction: column;\n  min-height: 0;\n  display: flex;\n}\n\n.bsd-3XgNyW-commitDetailHead {\n  border-bottom: 1px solid var(--bsd-border);\n  flex-direction: column;\n  gap: 4px;\n  padding: 8px 10px;\n  display: flex;\n}\n\n.bsd-3XgNyW-commitDetailTitle {\n  color: var(--bsd-text);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-weight: 600;\n  overflow: hidden;\n}\n\n.bsd-3XgNyW-backButton {\n  background: var(--bsd-bg-hover);\n  color: var(--bsd-text);\n  cursor: pointer;\n  border: none;\n  border-radius: 4px;\n  align-self: flex-start;\n  padding: 2px 8px;\n  font-size: 12px;\n}\n\n.bsd-3XgNyW-backButton:hover {\n  color: var(--bsd-accent);\n}\n\n.bsd-3XgNyW-commitFiles {\n  overflow: auto;\n}\n\n.bsd-3XgNyW-commitFileRow {\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  padding: 3px 10px;\n  font-size: 12px;\n  display: flex;\n}\n\n.bsd-3XgNyW-commitFileRow:hover {\n  background: var(--bsd-bg-hover);\n}\n\n.bsd-3XgNyW-fileStatus {\n  width: 22px;\n  font-family: var(--bsd-mono);\n  flex: none;\n  font-weight: 700;\n}\n\n.bsd-3XgNyW-muted {\n  color: var(--bsd-muted);\n}\n\n.bsd-3XgNyW-commitFilePath {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  overflow: hidden;\n}\n\n.bsd-3XgNyW-commitMessage {\n  font-family: var(--bsd-mono);\n  color: var(--bsd-text);\n  white-space: pre-wrap;\n  word-break: break-word;\n  border-bottom: 1px solid var(--bsd-border);\n  max-height: 160px;\n  margin: 0;\n  padding: 8px 10px;\n  font-size: 12px;\n  line-height: 1.5;\n  overflow: auto;\n}\n";
var styleId5 = "bsd-css-8e957c4c";
if (typeof document !== "undefined" && document.getElementById(styleId5) === null) {
  const el = document.createElement("style");
  el.id = styleId5;
  el.setAttribute("data-plugin", "dsh-better-sidebar-lite");
  el.textContent = cssText5;
  document.head.append(el);
}
var git_default = { "renamed": "bsd-3XgNyW-renamed", "untracked": "bsd-3XgNyW-untracked", "commitMeta": "bsd-3XgNyW-commitMeta", "loading": "bsd-3XgNyW-loading", "commitDetail": "bsd-3XgNyW-commitDetail", "commitSubject": "bsd-3XgNyW-commitSubject", "composerRow": "bsd-3XgNyW-composerRow", "empty": "bsd-3XgNyW-empty", "modified": "bsd-3XgNyW-modified", "backButton": "bsd-3XgNyW-backButton", "commitFileRow": "bsd-3XgNyW-commitFileRow", "header": "bsd-3XgNyW-header", "stateTitle": "bsd-3XgNyW-stateTitle", "discardAllRow": "bsd-3XgNyW-discardAllRow", "composerInput": "bsd-3XgNyW-composerInput", "glyph": "bsd-3XgNyW-glyph", "added": "bsd-3XgNyW-added", "stateAction": "bsd-3XgNyW-stateAction", "unmerged": "bsd-3XgNyW-unmerged", "row": "bsd-3XgNyW-row", "filePath": "bsd-3XgNyW-filePath", "sectionTitle": "bsd-3XgNyW-sectionTitle", "statusSections": "bsd-3XgNyW-statusSections", "body": "bsd-3XgNyW-body", "commitDate": "bsd-3XgNyW-commitDate", "discardAction": "bsd-3XgNyW-discardAction", "composer": "bsd-3XgNyW-composer", "originalPath": "bsd-3XgNyW-originalPath", "fileName": "bsd-3XgNyW-fileName", "conflictSection": "bsd-3XgNyW-conflictSection", "logTitle": "bsd-3XgNyW-logTitle", "branchName": "bsd-3XgNyW-branchName", "fileDir": "bsd-3XgNyW-fileDir", "retryButton": "bsd-3XgNyW-retryButton", "deleted": "bsd-3XgNyW-deleted", "rowAction": "bsd-3XgNyW-rowAction", "commits": "bsd-3XgNyW-commits", "commitRow": "bsd-3XgNyW-commitRow", "commitHash": "bsd-3XgNyW-commitHash", "commitFiles": "bsd-3XgNyW-commitFiles", "banner": "bsd-3XgNyW-banner", "muted": "bsd-3XgNyW-muted", "rows": "bsd-3XgNyW-rows", "state": "bsd-3XgNyW-state", "commitDetailTitle": "bsd-3XgNyW-commitDetailTitle", "branch": "bsd-3XgNyW-branch", "iconButton": "bsd-3XgNyW-iconButton", "sectionHeader": "bsd-3XgNyW-sectionHeader", "statePath": "bsd-3XgNyW-statePath", "logSection": "bsd-3XgNyW-logSection", "panel": "bsd-3XgNyW-panel", "discardAllButton": "bsd-3XgNyW-discardAllButton", "stateHint": "bsd-3XgNyW-stateHint", "loadMore": "bsd-3XgNyW-loadMore", "sectionAction": "bsd-3XgNyW-sectionAction", "sectionCount": "bsd-3XgNyW-sectionCount", "commitFilePath": "bsd-3XgNyW-commitFilePath", "rowActions": "bsd-3XgNyW-rowActions", "commitButton": "bsd-3XgNyW-commitButton", "commitAuthor": "bsd-3XgNyW-commitAuthor", "commitDetailHead": "bsd-3XgNyW-commitDetailHead", "fileStatus": "bsd-3XgNyW-fileStatus", "commitMessage": "bsd-3XgNyW-commitMessage", "section": "bsd-3XgNyW-section" };

// src/client/tabs/git/status-view.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var TONE_CLASS = {
  added: git_default.added,
  modified: git_default.modified,
  deleted: git_default.deleted,
  renamed: git_default.renamed,
  unmerged: git_default.unmerged,
  untracked: git_default.untracked
};
function toneOfLetter(letter) {
  switch (letter) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
    case "C":
      return "renamed";
    case "U":
      return "unmerged";
    case "?":
      return "untracked";
    default:
      return "modified";
  }
}
function glyphOf(entry) {
  if (entry.untracked) return { letter: "?", tone: "untracked" };
  if (entry.conflicted) return { letter: "U", tone: "unmerged" };
  const raw = entry.staged ? entry.xy.charAt(0) : entry.xy.charAt(1);
  const letter = raw === "" || raw === " " ? "M" : raw;
  return { letter, tone: toneOfLetter(letter) };
}
function composeGlyph(base2, tone) {
  const prefix = base2 === void 0 ? "" : base2;
  return tone === void 0 ? prefix : prefix + " " + tone;
}
function PathDisplay({ path }) {
  const idx = path.lastIndexOf("/");
  if (idx === -1) return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: git_default.fileName, children: path });
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: git_default.fileDir, children: path.slice(0, idx + 1) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: git_default.fileName, children: path.slice(idx + 1) })
  ] });
}
function RowActions({ entry, onStage, onUnstage, onDiscard, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: git_default.rowActions, children: [
    entry.staged && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: git_default.rowAction, "aria-label": t("unstage") + " " + entry.path, onClick: () => onUnstage(entry), children: t("unstage") }),
    (entry.unstaged || entry.untracked) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: git_default.rowAction, "aria-label": t("stage") + " " + entry.path, onClick: () => onStage(entry), children: t("stage") }),
    (entry.unstaged || entry.untracked) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "button",
      {
        type: "button",
        className: git_default.rowAction + " " + git_default.discardAction,
        "aria-label": t("discard") + " " + entry.path,
        onClick: () => onDiscard(entry),
        children: t("discard")
      }
    )
  ] });
}
function Row({ entry, onStage, onUnstage, onDiscard, t }) {
  const { letter, tone } = glyphOf(entry);
  const originalPath = entry.originalPath;
  const fullLabel = originalPath === void 0 ? entry.path : originalPath + " -> " + entry.path;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: git_default.row, "aria-label": fullLabel, title: fullLabel, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: composeGlyph(git_default.glyph, TONE_CLASS[tone]), "aria-hidden": "true", children: letter }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: git_default.filePath, children: [
      entry.originalPath !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: git_default.originalPath, children: [
        entry.originalPath,
        " \u2192 "
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PathDisplay, { path: entry.path })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(RowActions, { entry, onStage, onUnstage, onDiscard, t })
  ] });
}
function Section({ title, entries, t, onStage, onUnstage, onDiscard, sectionAction, conflictStyles }) {
  const cls = conflictStyles ? git_default.section + " " + git_default.conflictSection : git_default.section;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: cls, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: git_default.sectionHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: git_default.sectionTitle, children: [
        title,
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: git_default.sectionCount, children: entries.length })
      ] }),
      sectionAction !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: git_default.sectionAction, onClick: sectionAction.onClick, children: sectionAction.label })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: git_default.rows, children: entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Row, { entry, onStage, onUnstage, onDiscard, t }, entry.path)) })
  ] });
}
function GitStatusView({ result, root, rpc, t, onChanged, onActionError, onDiscard, onDiscardAll }) {
  async function stagePaths(files) {
    const res = await rpc.call(Endpoints.gitStage, { path: root, files });
    if (res.ok) {
      onChanged();
      return;
    }
    onActionError(res.error.message);
  }
  async function unstagePaths(files) {
    const res = await rpc.call(Endpoints.gitUnstage, { path: root, files });
    if (res.ok) {
      onChanged();
      return;
    }
    onActionError(res.error.message);
  }
  const onStage = (entry) => {
    void stagePaths([entry.path]);
  };
  const onUnstage = (entry) => {
    void unstagePaths([entry.path]);
  };
  const hasChanges = result.staged.length > 0 || result.conflicted.length > 0 || result.unstaged.length > 0 || result.untracked.length > 0;
  if (!hasChanges) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: git_default.empty, children: t("emptyStatus") });
  }
  const discardable = result.unstaged.length > 0 || result.untracked.length > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    discardable && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: git_default.discardAllRow, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: git_default.discardAllButton, onClick: onDiscardAll, children: t("discardAll") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: git_default.statusSections, children: [
      result.staged.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        Section,
        {
          title: t("staged"),
          entries: result.staged,
          t,
          onStage,
          onUnstage,
          onDiscard,
          sectionAction: {
            label: t("unstageAll"),
            onClick: () => {
              void unstagePaths(result.staged.map((e) => e.path));
            }
          }
        }
      ),
      result.conflicted.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        Section,
        {
          title: t("conflicts"),
          entries: result.conflicted,
          t,
          onStage,
          onUnstage,
          onDiscard,
          conflictStyles: true
        }
      ),
      result.unstaged.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        Section,
        {
          title: t("changes"),
          entries: result.unstaged,
          t,
          onStage,
          onUnstage,
          onDiscard,
          sectionAction: {
            label: t("stageAll"),
            onClick: () => {
              void stagePaths(result.unstaged.map((e) => e.path));
            }
          }
        }
      ),
      result.untracked.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        Section,
        {
          title: t("untracked"),
          entries: result.untracked,
          t,
          onStage,
          onUnstage,
          onDiscard,
          sectionAction: {
            label: t("stageAll"),
            onClick: () => {
              void stagePaths(result.untracked.map((e) => e.path));
            }
          }
        }
      )
    ] })
  ] });
}

// src/client/tabs/git/log-view.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
var dateFormatter = new Intl.DateTimeFormat(void 0, {
  year: "numeric",
  month: "short",
  day: "numeric"
});
function GitLogView({ result, t, onLoadMore, onSelectCommit }) {
  const hasCommits = result.entries.length > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: git_default.commits, children: hasCommits ? result.entries.map((entry) => {
      const date = dateFormatter.format(new Date(entry.authoredAtISO));
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
        "button",
        {
          type: "button",
          className: git_default.commitRow,
          onClick: () => onSelectCommit(entry),
          "aria-label": t("commitDetailTitle") + ": " + entry.subject,
          title: t("commitDetailTitle"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: git_default.commitSubject, children: entry.subject }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: git_default.commitMeta, children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: git_default.commitHash, children: entry.shortHash }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: git_default.commitAuthor, children: entry.authorName }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("time", { className: git_default.commitDate, dateTime: entry.authoredAtISO, children: date })
            ] })
          ]
        },
        entry.hash
      );
    }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: git_default.empty, children: t("emptyLog") }) }),
    result.truncated && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: git_default.loadMore, onClick: onLoadMore, children: t("loadMore") })
  ] });
}

// src/client/tabs/git/commit-detail-view.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
function toneOf(status) {
  switch (status) {
    case "A":
      return "added";
    case "M":
    case "T":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "other";
  }
}
var TONE_CLASS2 = {
  added: git_default.added,
  modified: git_default.modified,
  deleted: git_default.deleted,
  renamed: git_default.renamed,
  copied: git_default.modified,
  other: git_default.muted
};
var dateFormatter2 = new Intl.DateTimeFormat(void 0, {
  year: "numeric",
  month: "short",
  day: "numeric"
});
function CommitDetailView({ commit, state, t, onBack, onRetry }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: git_default.commitDetail, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: git_default.commitDetailHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("button", { type: "button", className: git_default.backButton, onClick: onBack, children: [
        "\u2190 ",
        t("back")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: git_default.commitDetailTitle, children: commit.subject }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: git_default.commitMeta, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: git_default.commitHash, children: commit.shortHash }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: git_default.commitAuthor, children: commit.authorName }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("time", { className: git_default.commitDate, dateTime: commit.authoredAtISO, children: dateFormatter2.format(new Date(commit.authoredAtISO)) })
      ] })
    ] }),
    state.kind === "loading" && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: git_default.loading, children: t("loading") }),
    state.kind === "error" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: git_default.state, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: git_default.stateHint, children: state.message }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: git_default.stateAction, onClick: onRetry, children: t("errorRetry") })
    ] }),
    state.kind === "loaded" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
      state.result.message.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("pre", { className: git_default.commitMessage, children: state.result.message }),
      state.result.files.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: git_default.empty, children: t("emptyCommitFiles") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: git_default.commitFiles, children: state.result.files.map((file) => {
        const cls = TONE_CLASS2[toneOf(file.status)];
        return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: git_default.commitFileRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: [git_default.fileStatus, cls].filter(Boolean).join(" "), children: file.status }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: git_default.filePath, children: [
            file.originalPath !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: git_default.originalPath, children: [
              file.originalPath,
              " ",
              "\u2192",
              " "
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: git_default.commitFilePath, children: file.path })
          ] })
        ] }, file.path);
      }) })
    ] })
  ] });
}

// src/client/tabs/git/git-tab.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var GIT_LOG_PAGE_SIZE = 50;
var AUTO_REFRESH_STATUS_INTERVAL_MS = 8e3;
var AUTO_REFRESH_DEBOUNCE_MS = 600;
function FullTabState({ title, hint, path, t, action }) {
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: git_default.panel, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: git_default.state, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: git_default.stateTitle, children: title }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: git_default.stateHint, children: hint }),
    path !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: git_default.statePath, children: path }),
    action !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: git_default.stateAction, onClick: action, children: t("errorRetry") })
  ] }) });
}
function ErrorBanner({ message, t, onRetry }) {
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: git_default.banner, role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: message }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: git_default.retryButton, onClick: onRetry, children: t("errorRetry") })
  ] });
}
function CommitComposer({ result, root, rpc, t, onCommitted, onActionError }) {
  const [message, setMessage] = (0, import_react6.useState)("");
  const [includeAll, setIncludeAll] = (0, import_react6.useState)(false);
  const [busy, setBusy] = (0, import_react6.useState)(false);
  const onChangeCount = result.staged.length;
  const allChangeCount = result.staged.length + result.unstaged.length + result.untracked.length;
  const canCommit = message.trim().length > 0 && (includeAll ? allChangeCount > 0 : onChangeCount > 0) && !busy;
  const doCommit = async () => {
    if (!canCommit) return;
    setBusy(true);
    let files = [];
    if (includeAll) {
      files = [
        ...result.staged.map((e) => e.path),
        ...result.unstaged.map((e) => e.path),
        ...result.untracked.map((e) => e.path)
      ];
    }
    const res = await rpc.call(Endpoints.gitCommit, { path: root, message, files });
    setBusy(false);
    if (!res.ok) {
      onActionError(res.error.message);
      return;
    }
    setMessage("");
    setIncludeAll(false);
    onCommitted();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: git_default.composer, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      "textarea",
      {
        className: git_default.composerInput,
        value: message,
        onChange: (e) => setMessage(e.target.value),
        placeholder: t("commitPlaceholder"),
        "aria-label": t("commitMessage"),
        disabled: busy
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { className: git_default.composerRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("input", { type: "checkbox", checked: includeAll, onChange: (e) => setIncludeAll(e.target.checked), disabled: busy }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("commitAll") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      "button",
      {
        type: "button",
        className: git_default.commitButton,
        onClick: () => void doCommit(),
        disabled: !canCommit,
        children: t("commit")
      }
    )
  ] });
}
function GitTab({ rpc, t }) {
  const { useSessions, useWorkspaces } = useDock();
  const sessions = useSessions((s) => s);
  const workspaces = useWorkspaces((w) => w);
  const root = resolveRoot(sessions, workspaces);
  const [statusValue, setStatusValue] = (0, import_react6.useState)(null);
  const [logValue, setLogValue] = (0, import_react6.useState)(null);
  const [statusError, setStatusError] = (0, import_react6.useState)(null);
  const [logError, setLogError] = (0, import_react6.useState)(null);
  const [actionError, setActionError] = (0, import_react6.useState)(null);
  const [selectedCommit, setSelectedCommit] = (0, import_react6.useState)(null);
  const [commitDetail, setCommitDetail] = (0, import_react6.useState)({ kind: "loading" });
  const commitDetailCtrl = (0, import_react6.useRef)(null);
  const [loading, setLoading] = (0, import_react6.useState)(true);
  const [logLimit, setLogLimit] = (0, import_react6.useState)(GIT_LOG_PAGE_SIZE);
  const logLimitRef = (0, import_react6.useRef)(logLimit);
  const setPage = (0, import_react6.useCallback)((next) => {
    logLimitRef.current = next;
    setLogLimit(next);
  }, []);
  const statusRef = (0, import_react6.useRef)(null);
  const applyStatus = (0, import_react6.useCallback)((next) => {
    statusRef.current = next;
    setStatusValue(next);
  }, []);
  const controllerRef = (0, import_react6.useRef)(null);
  const nextController = (0, import_react6.useCallback)(() => {
    controllerRef.current?.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    return ctrl;
  }, []);
  const refresh = (0, import_react6.useCallback)(() => {
    if (root === void 0) return;
    const ctrl = nextController();
    const signal = ctrl.signal;
    const limit = logLimitRef.current;
    setLoading(true);
    void (async () => {
      const [s, l] = await Promise.all([
        rpc.call(Endpoints.gitStatus, { path: root }, { signal }),
        rpc.call(Endpoints.gitLog, { path: root, limit }, { signal })
      ]);
      if (signal.aborted) return;
      if (s.ok) {
        applyStatus(s.value);
        setStatusError(null);
      } else setStatusError(s.error);
      if (l.ok) {
        setLogValue(l.value);
        setLogError(null);
      } else setLogError(l.error);
      setLoading(false);
    })();
  }, [rpc, root, nextController, applyStatus]);
  const refreshStatus = (0, import_react6.useCallback)(() => {
    if (root === void 0) return;
    const ctrl = nextController();
    const signal = ctrl.signal;
    void (async () => {
      const res = await rpc.call(Endpoints.gitStatus, { path: root }, { signal });
      if (signal.aborted) return;
      if (res.ok) {
        applyStatus(res.value);
        setStatusError(null);
      } else setStatusError(res.error);
    })();
  }, [rpc, root, nextController, applyStatus]);
  const discard = (0, import_react6.useCallback)(async (entry) => {
    if (root === void 0) return;
    const ok = window.confirm(t("discardConfirm").replace("{path}", entry.path));
    if (!ok) return;
    const res = await rpc.call(Endpoints.gitDiscard, { path: root, files: [entry.path] });
    if (res.ok) {
      refreshStatus();
      return;
    }
    setActionError(res.error.message);
  }, [rpc, root, refreshStatus, t]);
  const discardAll = (0, import_react6.useCallback)(async () => {
    if (root === void 0 || statusValue === null) return;
    const paths = [...statusValue.unstaged.map((e) => e.path), ...statusValue.untracked.map((e) => e.path)];
    if (paths.length === 0) return;
    if (!window.confirm(t("discardAllConfirm"))) return;
    const res = await rpc.call(Endpoints.gitDiscard, { path: root, files: paths });
    if (res.ok) {
      refreshStatus();
      return;
    }
    setActionError(res.error.message);
  }, [rpc, root, statusValue, refreshStatus, t]);
  const refreshAll = (0, import_react6.useCallback)(() => {
    if (root === void 0) return;
    const ctrl = nextController();
    const signal = ctrl.signal;
    const limit = logLimitRef.current;
    void (async () => {
      const [s, l] = await Promise.all([
        rpc.call(Endpoints.gitStatus, { path: root }, { signal }),
        rpc.call(Endpoints.gitLog, { path: root, limit }, { signal })
      ]);
      if (signal.aborted) return;
      if (s.ok) {
        applyStatus(s.value);
        setStatusError(null);
      } else setStatusError(s.error);
      if (l.ok) {
        setLogValue(l.value);
        setLogError(null);
      } else setLogError(l.error);
    })();
  }, [rpc, root, nextController, applyStatus]);
  const autoRefresh = (0, import_react6.useCallback)(() => {
    if (root === void 0 || document.hidden) return;
    const ctrl = nextController();
    const signal = ctrl.signal;
    void (async () => {
      const res = await rpc.call(Endpoints.gitStatus, { path: root }, { signal });
      if (signal.aborted) return;
      if (!res.ok) {
        setStatusError(res.error);
        return;
      }
      const prev = statusRef.current;
      applyStatus(res.value);
      setStatusError(null);
      if (prev === null || JSON.stringify(prev) !== JSON.stringify(res.value)) {
        const limit = logLimitRef.current;
        const l = await rpc.call(Endpoints.gitLog, { path: root, limit }, { signal });
        if (signal.aborted) return;
        if (l.ok) {
          setLogValue(l.value);
          setLogError(null);
        } else setLogError(l.error);
      }
    })();
  }, [rpc, root, nextController, applyStatus]);
  const autoRefreshTimerRef = (0, import_react6.useRef)(null);
  const scheduleAutoRefresh = (0, import_react6.useCallback)(() => {
    if (autoRefreshTimerRef.current !== null) window.clearTimeout(autoRefreshTimerRef.current);
    autoRefreshTimerRef.current = window.setTimeout(() => {
      autoRefreshTimerRef.current = null;
      void autoRefresh();
    }, AUTO_REFRESH_DEBOUNCE_MS);
  }, [autoRefresh]);
  const lastActivityRef = (0, import_react6.useRef)({ sessionId: void 0, updatedAt: 0 });
  const activitySeededRef = (0, import_react6.useRef)(false);
  const openCommit = (0, import_react6.useCallback)((entry) => {
    if (root === void 0) return;
    setSelectedCommit(entry);
    setCommitDetail({ kind: "loading" });
    commitDetailCtrl.current?.abort();
    const ctrl = new AbortController();
    commitDetailCtrl.current = ctrl;
    void (async () => {
      const res = await rpc.call(Endpoints.gitCommitDetail, { path: root, hash: entry.hash.trim() }, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res.ok) setCommitDetail({ kind: "loaded", result: res.value });
      else setCommitDetail({ kind: "error", message: res.error.message });
    })();
  }, [rpc, root]);
  const closeCommit = (0, import_react6.useCallback)(() => {
    commitDetailCtrl.current?.abort();
    setSelectedCommit(null);
  }, []);
  const loadMore = (0, import_react6.useCallback)(() => {
    if (root === void 0) return;
    const next = logLimitRef.current + GIT_LOG_PAGE_SIZE;
    setPage(next);
    const ctrl = nextController();
    const signal = ctrl.signal;
    void (async () => {
      const res = await rpc.call(Endpoints.gitLog, { path: root, limit: next }, { signal });
      if (signal.aborted) return;
      if (res.ok) {
        setLogValue(res.value);
        setLogError(null);
      } else setLogError(res.error);
    })();
  }, [rpc, root, nextController, setPage]);
  (0, import_react6.useEffect)(() => {
    if (root === void 0) return;
    setLoading(true);
    applyStatus(null);
    setStatusError(null);
    setLogValue(null);
    setLogError(null);
    if (autoRefreshTimerRef.current !== null) {
      window.clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }
    lastActivityRef.current = { sessionId: void 0, updatedAt: 0 };
    activitySeededRef.current = false;
    void refresh();
  }, [root, refresh, applyStatus]);
  (0, import_react6.useEffect)(() => {
    const current = sessions.current;
    const summary = current === void 0 ? void 0 : sessions.byId[current];
    const stamp = { sessionId: current, updatedAt: summary?.updatedAt ?? 0 };
    const prev = lastActivityRef.current;
    lastActivityRef.current = stamp;
    if (!activitySeededRef.current) {
      activitySeededRef.current = true;
      return;
    }
    if (stamp.sessionId === prev.sessionId && stamp.updatedAt === prev.updatedAt) return;
    if (root === void 0 || document.hidden) return;
    scheduleAutoRefresh();
  });
  (0, import_react6.useEffect)(() => {
    if (root === void 0) return;
    const id = window.setInterval(() => {
      void autoRefresh();
    }, AUTO_REFRESH_STATUS_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [root, autoRefresh]);
  (0, import_react6.useEffect)(() => () => {
    controllerRef.current?.abort();
    commitDetailCtrl.current?.abort();
    if (autoRefreshTimerRef.current !== null) window.clearTimeout(autoRefreshTimerRef.current);
  }, []);
  if (root === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(FullTabState, { title: t("noWorkspace"), hint: t("noWorkspaceHint"), t });
  }
  if (statusError?.code === "not-a-repo") {
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(FullTabState, { title: t("notARepo"), hint: t("notARepoHint"), path: root, t, action: refresh });
  }
  if (statusError?.code === "git-missing") {
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(FullTabState, { title: t("gitMissing"), hint: t("gitMissingHint"), t, action: refresh });
  }
  const branch = statusValue?.head ?? logValue?.head;
  const initialLoading = loading && statusValue === null && logValue === null;
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: git_default.panel, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: git_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: git_default.branch, children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(GitBranchIcon, { size: 14 }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: git_default.branchName, title: branch, children: branch ?? t("branch") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: git_default.iconButton, "aria-label": t("refresh"), onClick: refresh, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(RefreshIcon, { size: 14 }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: git_default.body, children: initialLoading ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: git_default.loading, children: t("loading") }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
      statusError !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ErrorBanner, { message: statusError.message, t, onRetry: refresh }),
      actionError !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ErrorBanner, { message: actionError, t, onRetry: () => setActionError(null) }),
      statusValue !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        GitStatusView,
        {
          result: statusValue,
          root,
          rpc,
          t,
          onChanged: refreshStatus,
          onActionError: setActionError,
          onDiscard: (entry) => {
            void discard(entry);
          },
          onDiscardAll: () => {
            void discardAll();
          }
        }
      ),
      statusValue !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        CommitComposer,
        {
          result: statusValue,
          root,
          rpc,
          t,
          onCommitted: refreshAll,
          onActionError: setActionError
        }
      ),
      logError !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ErrorBanner, { message: logError.message, t, onRetry: refresh }),
      logValue !== null && selectedCommit !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: git_default.logSection, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        CommitDetailView,
        {
          commit: selectedCommit,
          state: commitDetail,
          t,
          onBack: closeCommit,
          onRetry: () => openCommit(selectedCommit)
        }
      ) }),
      logValue !== null && selectedCommit === null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: git_default.logSection, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(GitLogView, { result: logValue, t, onLoadMore: loadMore, onSelectCommit: openCommit }) })
    ] }) })
  ] });
}

// src/client/tabs/git/locales.ts
var NS2 = "betterSidebar.git";
var zh2 = {
  tabLabel: "Git",
  refresh: "\u5237\u65B0",
  staged: "\u5DF2\u6682\u5B58",
  conflicts: "\u51B2\u7A81",
  changes: "\u66F4\u6539",
  untracked: "\u672A\u8DDF\u8E2A",
  stage: "\u6682\u5B58",
  unstage: "\u53D6\u6D88\u6682\u5B58",
  stageAll: "\u5168\u90E8\u6682\u5B58",
  unstageAll: "\u5168\u90E8\u53D6\u6D88\u6682\u5B58",
  loadMore: "\u52A0\u8F7D\u66F4\u591A",
  notARepo: "\u8FD9\u4E0D\u662F Git \u4ED3\u5E93",
  notARepoHint: "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662F Git \u4ED3\u5E93\u3002\u53EF\u4EE5\u4F7F\u7528\u5176\u4ED6\u8DEF\u5F84\u6216\u91CD\u65B0\u5C1D\u8BD5\u3002",
  gitMissing: "\u672A\u627E\u5230 Git",
  gitMissingHint: "\u672A\u68C0\u6D4B\u5230 Git \u53EF\u6267\u884C\u6587\u4EF6\u3002\u8BF7\u786E\u8BA4\u5DF2\u5B89\u88C5 Git \u540E\u91CD\u8BD5\u3002",
  errorRetry: "\u91CD\u8BD5",
  branch: "\u5206\u652F",
  emptyStatus: "\u6CA1\u6709\u66F4\u6539\uFF0C\u5DE5\u4F5C\u533A\u662F\u5E72\u51C0\u7684",
  emptyLog: "\u8FD8\u6CA1\u6709\u63D0\u4EA4",
  emptyCommitFiles: "\u8BE5\u63D0\u4EA4\u6CA1\u6709\u6587\u4EF6\u53D8\u66F4",
  commitDetailTitle: "\u67E5\u770B\u63D0\u4EA4\u8BE6\u60C5",
  back: "\u8FD4\u56DE",
  commit: "\u63D0\u4EA4",
  commitMessage: "\u63D0\u4EA4\u4FE1\u606F",
  commitPlaceholder: "\u8F93\u5165\u63D0\u4EA4\u4FE1\u606F\u2026",
  commitAll: "\u5305\u542B\u6240\u6709\u66F4\u6539\uFF08\u81EA\u52A8\u6682\u5B58\uFF09",
  commitStagedHint: "\u65E0\u5DF2\u6682\u5B58\u66F4\u6539",
  discard: "\u4E22\u5F03",
  discardConfirm: "\u786E\u5B9A\u8981\u4E22\u5F03\u6587\u4EF6 \u201C{path}\u201D \u7684\u6240\u6709\u66F4\u6539\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  discardAll: "\u5168\u90E8\u4E22\u5F03",
  discardAllConfirm: "\u786E\u5B9A\u8981\u4E22\u5F03\u6240\u6709\u672A\u6682\u5B58\u7684\u66F4\u6539\u548C\u672A\u8DDF\u8E2A\u7684\u6587\u4EF6\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  noWorkspace: "\u672A\u6253\u5F00\u5DE5\u4F5C\u533A",
  noWorkspaceHint: "Git \u6807\u7B7E\u9875\u9700\u8981\u4E00\u4E2A\u5DE5\u4F5C\u533A\u76EE\u5F55\u3002\u8BF7\u6253\u5F00\u6216\u9009\u62E9\u4E00\u4E2A\u5DE5\u4F5C\u533A\u3002"
};
var en2 = {
  tabLabel: "Git",
  refresh: "Refresh",
  staged: "Staged",
  conflicts: "Conflicts",
  changes: "Changes",
  untracked: "Untracked",
  stage: "Stage",
  unstage: "Unstage",
  stageAll: "Stage all",
  unstageAll: "Unstage all",
  loadMore: "Load more",
  notARepo: "Not a Git repository",
  notARepoHint: "The current workspace is not a Git repository. Try a different path or refresh.",
  gitMissing: "Git not found",
  gitMissingHint: "No Git executable detected. Make sure Git is installed, then retry.",
  errorRetry: "Retry",
  branch: "Branch",
  emptyStatus: "No changes \u2014 the working tree is clean",
  emptyLog: "No commits yet",
  emptyCommitFiles: "No files changed in this commit",
  commitDetailTitle: "View commit details",
  back: "Back",
  commit: "Commit",
  commitMessage: "Commit message",
  commitPlaceholder: "Enter a commit message\u2026",
  commitAll: "Include all changes (stage everything)",
  commitStagedHint: "Nothing staged to commit",
  discard: "Discard",
  discardConfirm: 'Discard all changes to "{path}"? This cannot be undone.',
  discardAll: "Discard all",
  discardAllConfirm: "Discard all uncommitted changes and untracked files? This cannot be undone.",
  loading: "Loading\u2026",
  noWorkspace: "No workspace open",
  noWorkspaceHint: "The Git tab needs a workspace directory. Open or select one to continue."
};

// src/client/tabs/git/tab-def.ts
function createGitTabDef(ctx, api) {
  const t = ctx.locale.bind(NS2);
  return {
    id: "git",
    order: 20,
    label: () => t("tabLabel"),
    icon: (0, import_react7.createElement)(GitBranchIcon),
    renderPanel: () => (0, import_react7.createElement)(GitTab, { rpc: api.rpc, t })
  };
}

// src/client/locales.ts
var NS3 = "betterSidebar.dock";
var zh3 = {
  "dock.title": "\u53F3\u4FA7\u9762\u677F",
  "toggle.collapse": "\u6536\u8D77\u4FA7\u8FB9\u680F",
  "toggle.expand": "\u5C55\u5F00\u4FA7\u8FB9\u680F",
  "toggle.sidebar": "\u5207\u6362\u4FA7\u8FB9\u680F",
  "resize.label": "\u8C03\u6574\u5BBD\u5EA6",
  "tablist.label": "\u9762\u677F",
  "refresh": "\u5237\u65B0",
  "empty.title": "\u6682\u65E0\u9762\u677F",
  "loading": "\u52A0\u8F7D\u4E2D\u2026"
};
var en3 = {
  "dock.title": "Right sidebar",
  "toggle.collapse": "Collapse sidebar",
  "toggle.expand": "Expand sidebar",
  "toggle.sidebar": "Toggle sidebar",
  "resize.label": "Resize",
  "tablist.label": "Panels",
  "refresh": "Refresh",
  "empty.title": "No panels",
  "loading": "Loading\u2026"
};

// src/client/index.ts
var inject = ["connection", "slots", "locale", "layout"];
function apply(ctx) {
  if (ctx.layout === void 0) {
    throw new Error('better-sidebar: ctx.layout missing \u2014 add "layout" to dsh.client.inject in package.json');
  }
  ctx.effect(() => {
    const rpc = createBetterSidebarRpc(ctx.connection);
    const tabs = new TabRegistryService();
    const explorer = new ExplorerOpenFileEmitter();
    const disposeProvide = ctx.reflect.provide("betterSidebar", { rpc, tabs, explorer });
    const disposeShellLocale = ctx.locale.register(NS3, { zh: zh3, en: en3 });
    const disposeExplorerLocale = ctx.locale.register(NS, { zh, en });
    const disposeGitLocale = ctx.locale.register(NS2, { zh: zh2, en: en2 });
    const disposeGitTab = tabs.register(createGitTabDef(ctx, { rpc }));
    const disposeExplorerTab = tabs.register(createExplorerTabDef(ctx, { rpc, emitter: explorer }));
    const DockEntry = createDockEntry({ rpc, tabs, t: ctx.locale.bind(NS3), layout: ctx.layout });
    const disposeDockEntry = ctx.slots.inject("details", () => ctx.slots.register({
      name: "details",
      priority: -1
    }, DockEntry));
    const FooterToggle = createSidebarToggleAction(ctx.locale.bind(NS3));
    const disposeFooterToggle = ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
      name: "sidebar.footer.action",
      id: "better-sidebar-toggle",
      order: 10
    }, FooterToggle));
    const disposeShortcut = bindToggleShortcut();
    return () => {
      disposeShortcut();
      disposeFooterToggle();
      disposeDockEntry();
      disposeExplorerTab();
      disposeGitTab();
      disposeGitLocale();
      disposeExplorerLocale();
      disposeShellLocale();
      void disposeProvide();
    };
  }, "better-sidebar: service + dock");
}
function bindToggleShortcut() {
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyB") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

		return module.exports;
	}
});

