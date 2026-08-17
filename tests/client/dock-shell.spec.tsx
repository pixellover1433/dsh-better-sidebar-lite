import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabRegistryService } from '../../src/client/tab-registry/service.ts'
import type { TabDef } from '../../src/client/tab-registry/contract.ts'
import type { BetterSidebarRpc } from '../../src/client/rpc-client.ts'
import { DockRoot, TOGGLE_EVENT, DOCK_STORAGE_KEY } from '../../src/client/dock/dock.tsx'
import type { DockLayoutActions } from '../../src/client/dock/dock.tsx'
import { en } from '../../src/client/locales.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

const t = ((key: string) => (en as Record<string, string>)[key] ?? key) as unknown as TranslateNS<'betterSidebar.dock'>

const stubRpc: BetterSidebarRpc = {
  call: async () => ({ ok: false, error: { code: 'internal', message: 'not used' } }),
}

const useSessionsStub = (sel: (s: never) => unknown) => sel({} as never) as unknown
const useWorkspacesStub = (sel: (s: never) => unknown) => sel({} as never) as unknown

function fakeTab(id: string, order: number, label: string): TabDef {
  return {
    id,
    order,
    label,
    icon: <span data-testid={'icon-' + id}>{id}</span>,
    renderPanel: () => <div data-testid={'panel-' + id}>panel {id}</div>,
  }
}

function layoutSpy() {
  return {
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
  } as unknown as DockLayoutActions
}

function renderDock(layout: DockLayoutActions) {
  const registry = new TabRegistryService()
  registry.register(fakeTab('a', 10, 'Alpha'))
  registry.register(fakeTab('b', 20, 'Beta'))
  render(
    <DockRoot useSessions={useSessionsStub as never} useWorkspaces={useWorkspacesStub as never} rpc={stubRpc} tabs={registry} settings={undefined} t={t} layout={layout} />,
  )
  return registry
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('DockRoot (details-column occupant)', () => {
  it('renders the region, tablist, and active panel', () => {
    renderDock(layoutSpy())
    expect(screen.getByRole('region', { name: 'Right sidebar' })).toBeTruthy()
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Alpha/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Beta/ })).toBeTruthy()
    expect(screen.getByRole('tabpanel')).toBeTruthy()
    expect(screen.getByTestId('panel-a')).toBeTruthy()
  })

  it('opens the details column on mount by default', () => {
    const layout = layoutSpy()
    renderDock(layout)
    expect(layout.openDetails).toHaveBeenCalledTimes(1)
    expect(layout.closeDetails).not.toHaveBeenCalled()
  })

  it('renders nothing when the persisted preference is closed (zero overlap)', () => {
    localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify({ open: false, width: 320 }))
    const layout = layoutSpy()
    renderDock(layout)
    expect(layout.openDetails).not.toHaveBeenCalled()
    // The collapsed dock renders no region/tablist at all — nothing covers
    // the web UI. Restore paths: the left-sidebar footer toggle + shortcut.
    expect(screen.queryByRole('region', { name: 'Right sidebar' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('renders floating when the details column has no width (fallback stays visible)', () => {
    // jsdom has no layout: the observed column width is 0, so the dock floats.
    const layout = layoutSpy()
    renderDock(layout)
    const region = screen.getByRole('region', { name: 'Right sidebar' })
    expect(region.getAttribute('data-floating')).toBe('true')
    expect(region).toBeTruthy()
  })

  it('collapses via the header button: hides the dock and persists the preference', async () => {
    const layout = layoutSpy()
    const user = userEvent.setup()
    renderDock(layout)
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(layout.closeDetails).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(DOCK_STORAGE_KEY) ?? '{}')).toEqual({ open: false })
    // Collapsed = nothing rendered (zero overlap); restore via toggle.
    expect(screen.queryByRole('region', { name: 'Right sidebar' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('flips direction on the global toggle event and persists', () => {
    const layout = layoutSpy()
    renderDock(layout)
    // Initial open -> toggle closes.
    fireEvent(window, new CustomEvent(TOGGLE_EVENT))
    expect(layout.closeDetails).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(DOCK_STORAGE_KEY) ?? '{}')).toEqual({ open: false })
    expect(screen.queryByRole('region', { name: 'Right sidebar' })).toBeNull()
    // Toggle again -> reopens (mount seed + this toggle).
    fireEvent(window, new CustomEvent(TOGGLE_EVENT))
    expect(layout.openDetails).toHaveBeenCalledTimes(2)
    expect(JSON.parse(localStorage.getItem(DOCK_STORAGE_KEY) ?? '{}')).toEqual({ open: true })
    expect(screen.getByRole('region', { name: 'Right sidebar' })).toBeTruthy()
  })

  it('switches the active tab and panel on click', async () => {
    const user = userEvent.setup()
    renderDock(layoutSpy())
    expect(screen.getByTestId('panel-a')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: /Beta/ }))
    expect(screen.getByTestId('panel-b')).toBeTruthy()
    expect(screen.queryByTestId('panel-a')).toBeNull()
    expect(screen.getByRole('tab', { name: /Beta/ }).getAttribute('aria-selected')).toBe('true')
  })
})