import '@testing-library/jest-dom/vitest'

// jsdom does not implement matchMedia; the dock's dark-theme hook needs it.
// A minimal stub keeps prefers-color-scheme tests deterministic (light).
// configurable: true lets individual tests delete/redefine it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// jsdom lacks ResizeObserver; the dock observes its column width to decide
// floating vs in-flow. A minimal stub keeps the observation effect alive
// (readbacks are 0-width in jsdom, so the dock renders floating — the
// content assertions are identical either way).
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
}