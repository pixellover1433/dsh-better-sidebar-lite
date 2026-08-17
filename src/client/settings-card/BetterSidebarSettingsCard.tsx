/**
 * The plugin's configuration card in Settings > Plugins > Plugin configuration
 * (ADR-004 §3 amendment). Renders one compact control per editable field
 * (auto-refresh cadences) over the staged card state, with a Save that writes
 * the staged edits and a Discard/Reset pair. The controls are self-contained —
 * the harness's shared card chrome is not exported — so this card owns its own
 * markup but follows the same staged-write semantics documented for plugin
 * cards: what is on screen is exactly what a save would store, and a field's
 * presence in the raw user layer (not its value) is what marks it overridden.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarCardActions, SidebarCardState } from './controller.ts'
import { CARD_FIELDS } from './controller.ts'
import styles from './settings-card.module.css'

/** The registration-side inject face: card actions + a bound settings store. */
export interface BetterSidebarSettingsCardFace extends SidebarCardActions {
  hooks: {
    /** Card snapshot; bound by the renderer as the `useSettingsCard` hook. */
    settingsCard: {
      getSnapshot(): SidebarCardState
      subscribe(fn: () => void): () => void
    }
  }
}

/** What the renderer binds: actions pass through, the store hook is bound. */
export type BetterSidebarSettingsCardProps =
  Omit<BetterSidebarSettingsCardFace, 'hooks'>
  & { useSettingsCard: SnapshotSelectorHook<SidebarCardState> }

/** Display labels keyed by field (the card's t() resolves these). */
export const FIELD_LABELS: Record<string, string> = {
  explorerPollMs: 'ExplorerPollMs',
  explorerDebounceMs: 'ExplorerDebounceMs',
  gitPollMs: 'GitPollMs',
  gitDebounceMs: 'GitDebounceMs',
}

export function BetterSidebarSettingsCard(props: BetterSidebarSettingsCardProps): ReactNode {
  const [open, setOpen] = useState(false)
  const state = props.useSettingsCard(s => s)
  if (!state.available) return null
  const blocked = !state.dirty || state.invalid || state.saving
  return (
    <li className={styles.card}>
      <button type="button" className={styles.header} aria-expanded={open} onClick={() => { setOpen(!open) }}>
        <span className={styles.headText}>
          <span className={styles.name}>{fieldLabel('cardTitle')}</span>
          <span className={styles.description}>{fieldLabel('cardDescription')}</span>
        </span>
        {state.dirty ? <span className={styles.pending}>{fieldLabel('unsaved')}</span> : null}
      </button>
      {open ? (
        <div className={styles.body}>
          {!state.writable ? <p className={styles.readOnly} role="status">{fieldLabel('readOnly')}</p> : null}
          {CARD_FIELDS.map(fieldKey => (
            <FieldControl
              key={String(fieldKey)}
              fieldKey={String(fieldKey)}
              disabled={!state.writable}
              state={state}
              edit={props.edit}
              resetField={props.resetField}
            />
          ))}
          <div className={styles.footer}>
            {state.failed ? <p className={styles.failed} role="status">{fieldLabel('saveFailed')}</p> : null}
            <button type="button" className={styles.discard} disabled={!state.dirty || state.saving} onClick={props.discard}>
              {fieldLabel('discard')}
            </button>
            <button type="button" className={styles.save} disabled={blocked} onClick={props.save}>
              {fieldLabel(state.saving ? 'saving' : 'save')}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function FieldControl(props: {
  fieldKey: string
  disabled: boolean
  state: SidebarCardState
  edit: SidebarCardActions['edit']
  resetField: SidebarCardActions['resetField']
}): ReactNode {
  const { fieldKey, state, edit, resetField } = props
  const field = state.fields[fieldKey]
  const id = 'better-sidebar-field-' + fieldKey
  return (
    <div className={styles.field}>
      <div className={styles.head}>
        <label className={styles.label} htmlFor={id}>{fieldLabel(fieldKey)}</label>
        {field?.overridden === true ? (
          <span className={styles.badges}>
            <span className={styles.badge}>{fieldLabel('overridden')}</span>
            <button type="button" className={styles.reset} disabled={props.disabled} onClick={() => resetField(fieldKey)}>
              {fieldLabel('reset')}
            </button>
          </span>
        ) : null}
      </div>
      <input
        id={id}
        className={field?.invalid === true ? styles.inputInvalid : styles.input}
        type="text"
        inputMode="numeric"
        {...field?.invalid === true ? { 'aria-invalid': true } : {}}
        value={field?.text ?? ''}
        disabled={props.disabled}
        onChange={(event) => { edit(fieldKey, event.target.value) }}
      />
      {field?.invalid === true ? (
        <p className={styles.invalidText}>{fieldLabel('invalidNumber')}</p>
      ) : null}
    </div>
  )
}

/** Locale-aware label reader (v1: English live labels; localized in a later pass). */
function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}
