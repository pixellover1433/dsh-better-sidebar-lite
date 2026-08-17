/**
 * The plugin's settings card (ADR-004 §3 amendment). Registered into the shared
 * `settings.plugin.item` slot of Settings > Plugins > Plugin configuration, it
 * edits the plugin's auto-refresh tunables live. The markup, layout, and
 * `--dsw-alias-*` tokens mirror the shipped shell/agent-loop/web-search cards
 * (PluginCard + ValueField), so it reads as one of the suite rather than a
 * foreign control.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { ChevronDownIcon } from '../icons.tsx'
import type { SidebarCardActions, SidebarCardState } from './controller.ts'
import type { BetterSidebarPluginsLocaleKey } from './locales.ts'
import pluginCardCss from './PluginCard.module.css'
import fieldsCss from './fields.module.css'

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
export type BetterSidebarSettingsCardProps = SidebarCardActions & {
  /** Card snapshot selector hook (bound from the inject face). */
  useSettingsCard: SnapshotSelectorHook<SidebarCardState>
  /** Locale reader for this namespace. */
  t: (key: BetterSidebarPluginsLocaleKey) => string
}

/** Field => label/hint key pairs, in display order. */
const FIELD_COPY: ReadonlyArray<{
  field: string
  labelKey: BetterSidebarPluginsLocaleKey
  hintKey: BetterSidebarPluginsLocaleKey
}> = [
  { field: 'explorerPollMs', labelKey: 'explorerPollMs', hintKey: 'explorerPollMsHint' },
  { field: 'explorerDebounceMs', labelKey: 'explorerDebounceMs', hintKey: 'explorerDebounceMsHint' },
  { field: 'gitPollMs', labelKey: 'gitPollMs', hintKey: 'gitPollMsHint' },
  { field: 'gitDebounceMs', labelKey: 'gitDebounceMs', hintKey: 'gitDebounceMsHint' },
]

export function BetterSidebarSettingsCard(props: BetterSidebarSettingsCardProps): ReactNode {
  const { t } = props
  const [open, setOpen] = useState(false)
  const state = props.useSettingsCard(s => s)
  // A card renders nothing while its namespace is unavailable (mirrors the
  // shipped PluginCard), so a deployment that does not serve it shows no trace.
  if (!state.available) return null
  const title = t('cardTitle')
  const blocked = !state.dirty || state.invalid || state.saving
  return (
    <li className={open ? pluginCardCss.card + ' ' + pluginCardCss.cardOpen : pluginCardCss.card}>
      <button
        type="button"
        className={pluginCardCss.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={pluginCardCss.headText}>
          <span className={pluginCardCss.name}>{title}</span>
          <span className={pluginCardCss.description}>{t('cardDescription')}</span>
        </span>
        {state.dirty ? <span className={pluginCardCss.pending}>{t('unsaved')}</span> : null}
        <span className={open ? pluginCardCss.chevron + ' ' + pluginCardCss.chevronOpen : pluginCardCss.chevron}>
          <ChevronDownIcon size={14} />
        </span>
      </button>
      {open
        ? (
          <div className={pluginCardCss.body}>
            {!state.writable ? <p className={pluginCardCss.readOnly} role="status">{t('readOnly')}</p> : null}
            {FIELD_COPY.map(({ field, labelKey, hintKey }) => {
              const f = state.fields[field] ?? { text: '', overridden: false, invalid: false }
              return (
                <FieldControl
                  key={field}
                  id={'plugin-config-better-sidebar-' + field}
                  label={t(labelKey)}
                  hint={t(hintKey)}
                  text={f.text}
                  overridden={f.overridden}
                  invalid={f.invalid}
                  overriddenLabel={t('overridden')}
                  resetLabel={t('reset')}
                  invalidLabel={t('invalidNumber')}
                  disabled={!state.writable}
                  onEdit={(text) => { props.edit(field, text) }}
                  onReset={() => { props.resetField(field) }}
                />
              )
            })}
            <div className={pluginCardCss.footer}>
              {state.failed
                ? <p className={pluginCardCss.failed} role="status">{t('saveFailed')}</p> : null}
              <button
                type="button"
                className={pluginCardCss.discard}
                disabled={!state.dirty || state.saving}
                onClick={props.discard}
              >
                {t('discard')}
              </button>
              <button
                type="button"
                className={pluginCardCss.save}
                disabled={blocked}
                onClick={props.save}
              >
                {t(state.saving ? 'saving' : 'save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}

function FieldControl(props: {
  id: string
  label: string
  hint: string
  text: string
  overridden: boolean
  invalid: boolean
  overriddenLabel: string
  resetLabel: string
  invalidLabel: string
  disabled: boolean
  onEdit: (text: string) => void
  onReset: () => void
}): ReactNode {
  return (
    <div className={fieldsCss.field}>
      <div className={fieldsCss.head}>
        <label className={fieldsCss.label} htmlFor={props.id}>{props.label}</label>
        {props.overridden
          ? (
            <span className={fieldsCss.badges}>
              <span className={fieldsCss.badge}>{props.overriddenLabel}</span>
              <button
                type="button"
                className={fieldsCss.reset}
                disabled={props.disabled}
                onClick={props.onReset}
              >
                {props.resetLabel}
              </button>
            </span>
          )
          : null}
      </div>
      <input
        id={props.id}
        className={props.invalid ? fieldsCss.inputInvalid : fieldsCss.input}
        type="text"
        inputMode="numeric"
        {...props.invalid ? { 'aria-invalid': true } : {}}
        value={props.text}
        disabled={props.disabled}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      <p className={props.invalid ? fieldsCss.invalid : fieldsCss.hint}>
        {props.invalid ? props.invalidLabel : props.hint}
      </p>
    </div>
  )
}
