/**
 * Build the browser client half into the dsh web module-loader format
 * (CLIENT_MODULE_LOADER contract — packages/client/modules/src/client/manifest.ts):
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => exports })
 *
 * A classic script; the factory executes lazily at materialization, resolving
 * externals (react + every @deepseek-ai/*) through the loader's module table.
 * CSS Modules (.module.css) are compiled by lightningcss: the default export
 * is the hashed class map and the css text injects one <style data-plugin>
 * tag per stylesheet at factory execution (the loader removes plugin-owned
 * tags on unload). styles.css rides in through the @import inside
 * dock.module.css (lightningcss inlines @import).
 */
import { build } from 'esbuild'
import { transform } from 'lightningcss'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN_ID = 'dsh-better-sidebar-lite'
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_FILE = join(ROOT, 'lib', 'client.js')

/**
 * Inline local @import directives before lightningcss: the compiled css is
 * injected into a <style> tag, where a browser would resolve '@import
 * "./x.css"' against the PAGE origin (404) — styles.css must ship inside the
 * bundle. External/absolute imports are left untouched.
 */
function inlineImports(filePath, source, seen = new Set()) {
  if (seen.has(filePath)) return source
  seen.add(filePath)
  return source.replace(/@import\s+(?:url\()?["']([^"']+)["']\)?;/g, (match, spec) => {
    if (!/^\.{1,2}\//.test(spec)) return match
    const target = resolve(dirname(filePath), spec)
    if (!existsSync(target)) return match
    return inlineImports(target, readFileSync(target, 'utf8'), seen)
  })
}

/** Virtualizes .module.css / .css imports: class map + style-tag injection. */
const cssPlugin = {
  name: 'bsd-css',
  setup(build) {
    build.onResolve({ filter: /\.(module\\.)?css$/ }, (args) => ({
      path: args.path,
      namespace: 'bsd-css',
      pluginData: { resolveDir: args.resolveDir },
    }))
    build.onLoad({ filter: /.*/, namespace: 'bsd-css' }, (args) => {
      const filePath = resolve(args.pluginData.resolveDir, args.path)
      const isModule = filePath.endsWith('.module.css')
      const source = inlineImports(filePath, readFileSync(filePath, 'utf8'))
      const { code, exports: classExports } = transform({
        filename: filePath,
        code: Buffer.from(source),
        cssModules: isModule ? { pattern: 'bsd-[hash]-[local]' } : false,
      })
      const classMap = isModule
        ? Object.fromEntries(Object.entries(classExports ?? {}).map(([local, e]) => [local, e.name]))
        : {}
      const cssText = code.toString()
      const styleId = 'bsd-css-' + createHash('sha1').update(cssText).digest('hex').slice(0, 8)
      const contents = [
        `const cssText = ${JSON.stringify(cssText)};`,
        `const styleId = ${JSON.stringify(styleId)};`,
        'if (typeof document !== "undefined" && document.getElementById(styleId) === null) {',
        '  const el = document.createElement("style");',
        '  el.id = styleId;',
        `  el.setAttribute("data-plugin", ${JSON.stringify(PLUGIN_ID)});`,
        '  el.textContent = cssText;',
        '  document.head.append(el);',
        '}',
        isModule ? `export default ${JSON.stringify(classMap)};` : '',
      ].join('\n')
      return { contents, loader: 'js' }
    })
  },
}

/** Build lib/client.js in the loader format (idempotent; overwrites). */
export async function buildClientBundle() {
  mkdirSync(dirname(OUT_FILE), { recursive: true })
  await build({
    entryPoints: [join(ROOT, 'src', 'client', 'index.ts')],
    outfile: OUT_FILE,
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    // Resolved from the loader module table at runtime: platform seed modules
    // (react family + cordis + ui-slots + web-react + ui-primitives) and every
    // @deepseek-ai/* (none are runtime-imported by this package today — the
    // policy keeps cross-plugin value imports a build error).
    external: [
      'react', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'react-dom', 'react-dom/client',
    ],
    plugins: [cssPlugin],
    sourcemap: 'external',
    banner: {
      js: `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(PLUGIN_ID)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n`,
    },
    footer: { js: '\n\t\treturn module.exports;\n\t}\n});\n' },
    logLevel: 'info',
  })
}

// CLI entry
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildClientBundle()
}