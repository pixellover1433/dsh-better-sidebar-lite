/**
 * Plugin configuration card controller (ADR-004 §3 amendment). Bridges the
 * bound plugin settings scope onto a staged form the card renders: edits are
 * staged until Save (a durable, revision-fenced document mutation), Reset
 * stages a clear so a field re-inherits the served default, Discard drops
 * drafts, and a rejected or failed latest save keeps the drafts for the user
 * to correct (the Host is the only authority on acceptance).
 *
 * It carries no runtime import from a dsh package (the client bundle purity
 * gate forbids cross-plugin value imports): the typed scope arrives injected
 * and only its type is imported. The observable it exposes is a minimal local
 * store satisfying `getSnapshot` + `subscribe`.
 */
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarSettings } from '../../contract/settings.ts'
import { SETTING_RANGES } from '../../contract/settings.ts'

/** The fields this card edits, in display order. */
export const CARD_FIELDS: readonly (keyof BetterSidebarSettings)[] = [
  'explorerPollMs',
  'explorerDebounceMs',
  'gitPollMs',
  'gitDebounceMs',
]

/** One field as the card's control renders it. */
export interface CardFieldState {
  text: string
  overridden: boolean
  invalid: boolean
}

/** Card-level state every control reads. */
export interface SidebarCardState {
  available: boolean
  writable: boolean
  dirty: boolean
  invalid: boolean
  saving: boolean
  failed: boolean
  fields: Record<string, CardFieldState>
}

/** The write actions the card exposes. */
export interface SidebarCardActions {
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
}

/** A staged edit or a staged clear for one field. */
interface Staged {
  text: string
  clear: boolean
}

function formatNumber(value: unknown): string {
  return typeof value === 'number' ? String(value) : ''
}

/** Whether a draft is a number the field's host schema accepts (finite, in range). */
function validNumber(field: string, text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false // empty means clear, handled separately
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return false
  const range = SETTING_RANGES[field as keyof BetterSidebarSettings]
  return parsed >= range.min && parsed <= range.max
}

function isOverridden(user: unknown, field: string): boolean {
  return typeof user === 'object' && user !== null && Object.hasOwn(user, field)
}

/** Minimal observable the card's selector hook reads (no dsh runtime import). */
export interface CardObservable<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

export class SidebarSettingsCardController {
  private readonly staged = new Map<string, Staged>()
  private readonly listeners = new Set<() => void>()
  private saving = false
  private failed = false
  private current: SidebarCardState

  constructor(private readonly scope: SettingsScope<BetterSidebarSettings>) {
    this.current = this.project()
    this.scope.subscribe(() => {
      this.current = this.project()
      this.emit()
    })
  }

  /** The observable the card's `useSettingsCard` hook reads. */
  observable(): CardObservable<SidebarCardState> {
    return {
      getSnapshot: () => this.current,
      subscribe: (fn) => {
        this.listeners.add(fn)
        return () => { this.listeners.delete(fn) }
      },
    }
  }

  /** Actions bound to this controller. */
  actions(): SidebarCardActions {
    return {
      edit: (field, text) => { this.stage(field, { text, clear: false }) },
      resetField: (field) => {
        const base = this.baseValue(field)
        const fallback = this.sectionValue(field)
        this.stage(field, { text: formatNumber(base ?? fallback), clear: true })
      },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return
        this.staged.clear()
        this.failed = false
        this.current = this.project()
        this.emit()
      },
    }
  }

  private project(): SidebarCardState {
    const snapshot = this.scope.getSnapshot()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      saving: this.saving,
      failed: this.failed,
      dirty: this.staged.size > 0,
      invalid: CARD_FIELDS.some(field => this.readField(field as string).invalid),
      fields: Object.fromEntries(CARD_FIELDS.map(field => [field as string, this.readField(field as string)])),
    }
  }

  private readField(field: string): CardFieldState {
    const name = field
    const entry = this.staged.get(name)
    const snapshot = this.scope.getSnapshot()
    if (entry === undefined) {
      return {
        text: formatNumber(this.sectionValue(name)),
        overridden: isOverridden(snapshot.user, name),
        invalid: false,
      }
    }
    if (entry.clear) return { text: entry.text, overridden: false, invalid: false }
    const valid = validNumber(name, entry.text)
    return { text: entry.text, overridden: valid, invalid: !valid }
  }

  private sectionValue(field: string): unknown {
    const snapshot = this.scope.getSnapshot()
    return (snapshot.value as Record<string, unknown> | undefined)?.[field]
  }

  private baseValue(field: string): unknown {
    const snapshot = this.scope.getSnapshot()
    return (snapshot.base as Record<string, unknown> | undefined)?.[field]
  }

  private stage(field: string, edit: Staged): void {
    this.staged.set(field, edit)
    this.failed = false
    this.current = this.project()
    this.emit()
  }

  private async save(): Promise<void> {
    const writes: Array<{ field: string; expected: unknown; clear: boolean; run: () => Promise<void> }> = []
    for (const field of CARD_FIELDS) {
      const name = field as string
      const entry = this.staged.get(name)
      if (entry === undefined) continue
      if (entry.clear) {
        writes.push({ field: name, expected: undefined, clear: true, run: () => this.scope.unset(name) })
        continue
      }
      // A draft outside the field's accepted range blocks the save (the Save
      // button is disabled while invalid); never send it to the Host.
      if (!validNumber(name, entry.text)) continue
      const parsed = Number(entry.text.trim())
      writes.push({ field: name, expected: parsed, clear: false, run: () => this.scope.set(name, parsed) })
    }
    if (writes.length === 0 || this.saving) return
    this.saving = true
    this.failed = false
    this.current = this.project()
    this.emit()
    let landedAll = true
    try {
      // The Host is authoritative on whether a write landed. One failed write
      // keeps every remaining draft so the card never silently reverts to the
      // served default for a value the user asked for.
      for (const write of writes) {
        await write.run()
        const snapshot = this.scope.getSnapshot()
        const value = (snapshot.value as Record<string, unknown> | undefined)?.[write.field]
        const user = snapshot.user as Record<string, unknown> | undefined
        const landed = write.clear
          ? !(user !== undefined && Object.hasOwn(user, write.field))
          : value === write.expected
        if (!landed) landedAll = false
      }
    } catch {
      landedAll = false
    } finally {
      if (landedAll) this.staged.clear()
      this.saving = false
      this.failed = !landedAll
      this.current = this.project()
      this.emit()
    }
  }

  private emit(): void {
    for (const fn of Array.from(this.listeners)) fn()
  }
}
