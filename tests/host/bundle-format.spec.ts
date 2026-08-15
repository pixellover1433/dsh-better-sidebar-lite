/**
 * Built client-bundle smoke (dsh web loader contract): the bundle must be a
 * classic script registering 'dsh-better-sidebar-lite' via
 * window.__ModuleLoader__.load, and the factory must materialize the plugin
 * exports ({ apply, inject }) through the injected require. Runs in the node
 * project (realm-consistent esbuild); the style-tag behavior is asserted on
 * the emitted source because there is no document in node.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { buildClientBundle, PLUGIN_ID } from '../../scripts/build-client-bundle.mjs'

interface LoadHandoff {
  id: string
  factory: (require: (spec: string) => unknown) => Record<string, unknown>
}

describe('client bundle loader format', () => {
  let captured: LoadHandoff | undefined

  beforeAll(async () => {
    await buildClientBundle()
    captured = undefined
    ;(globalThis as Record<string, unknown>).window = {
      __ModuleLoader__: {
        load: (handoff: LoadHandoff) => { captured = handoff },
      },
    }
    const url = new URL('../../lib/client.js?t=' + Date.now(), import.meta.url).href
    await import(url)
  })

  it('registers under the plugin id via __ModuleLoader__.load', () => {
    expect(captured?.id).toBe(PLUGIN_ID)
  })

  it('materializes { apply, inject } through the injected require', () => {
    expect(captured).toBeDefined()
    const require = createRequire(import.meta.url)
    const mod = captured!.factory((spec) => {
      if (spec === 'react') return require('react') // real CJS react (createContext runs at top level)
      if (spec === 'react/jsx-runtime' || spec === 'react/jsx-dev-runtime') return require('react/jsx-runtime')
      if (spec === 'react-dom' || spec === 'react-dom/client') return {}
      throw new Error('bundle required an unexpected module: ' + spec)
    })
    expect(typeof mod.apply).toBe('function')
    expect(mod.inject).toEqual(['connection', 'slots', 'locale', 'layout'])
  })

  it('emits plugin-owned style-tag injection and CSS class maps', () => {
    const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
    expect(source).toContain('data-plugin')
    expect(source).toContain('createElement("style")')
    expect(source).toContain('bsd-')
  })

  it('ships the --bsd-* palette inside the bundle (styles.css inlined, no @import)', () => {
    // Regression: styles.css was once only reachable via a CSS @import, which a
    // <style> tag resolves against the PAGE origin (404) — leaving every token
    // undefined and the modules on their dark fallbacks.
    const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
    expect(source).toContain('body[data-ds-dark-theme]')
    expect(source).toContain('--bsd-bg: #fff')
    expect(source).toContain('--bsd-bg: #0d1117')
    expect(source).not.toContain('@import')
  })
})