/**
 * Client-side reactive reader for the plugin settings namespace (ADR-004 §3
 * amendment). The client plugin binds the namespace scope through the settings
 * service and exposes a hook that all tabs use to read the live user-edited
 * values (auto-refresh cadences) with the contract defaults as fallback — so
 * the tabs react to a Settings > Plugins edit without a restart or re-render
 * hack. It is framework-free: the hook is a thin `useSyncExternalStore`
 * selector over the bound scope.
 */
import { useRef, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  SETTINGS_DEFAULTS,
  type BetterSidebarSettings,
} from '../../../contract/settings.ts'

/**
 * Resolved settings with the contract defaults filled in for fields the served
 * section does not carry (e.g. before the first accepted snapshot, or when the
 * namespace is unavailable). Never throws; treats any missing field as default.
 */
export function resolveSettings(snapshot: {
  value?: Partial<BetterSidebarSettings> | undefined
}): BetterSidebarSettings {
  const v = snapshot.value
  return {
    explorerPollMs: v?.explorerPollMs ?? SETTINGS_DEFAULTS.explorerPollMs,
    explorerDebounceMs: v?.explorerDebounceMs ?? SETTINGS_DEFAULTS.explorerDebounceMs,
    gitPollMs: v?.gitPollMs ?? SETTINGS_DEFAULTS.gitPollMs,
    gitDebounceMs: v?.gitDebounceMs ?? SETTINGS_DEFAULTS.gitDebounceMs,
    gitTimeoutMs: v?.gitTimeoutMs ?? SETTINGS_DEFAULTS.gitTimeoutMs,
    skillsPollMs: v?.skillsPollMs ?? SETTINGS_DEFAULTS.skillsPollMs,
  }
}

/**
 * Read the current settings values reactively from a bound scope.
 * @param scope - the plugin's bound settings scope; undefined renders defaults.
 * @returns the resolved settings (a stable reference until a value changes).
 */
export function useBetterSidebarSettings(
  scope: SettingsScope<BetterSidebarSettings> | undefined,
): BetterSidebarSettings {
  // Cache the last resolved value keyed on the scope's snapshot, so the value
  // stays referentially stable between changes and never retriggers render.
  // The undefined-scope (no settings seam) case caches a single defaults object.
  const cached = useRef<{ snapshot: unknown; value: BetterSidebarSettings }>({
    snapshot: undefined,
    value: resolveSettings({}),
  })
  const resolve = (): BetterSidebarSettings => {
    if (scope === undefined) return cached.current.value
    const snapshot = scope.getSnapshot()
    if (cached.current.snapshot === snapshot) return cached.current.value
    const value = resolveSettings(snapshot)
    cached.current = { snapshot, value }
    return value
  }
  return useSyncExternalStore(
    (fn) => {
      if (scope === undefined) return () => {}
      return scope.subscribe(() => { fn() })
    },
    resolve,
  )
}
