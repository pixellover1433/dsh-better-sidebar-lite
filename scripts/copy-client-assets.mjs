// Mirror client CSS assets into lib/ (tsc emits JS/d.ts but not CSS).
// The dsh web bundler consumes CSS modules from the built package.
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const srcRoot = new URL('../src/client/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const outRoot = new URL('../lib/client/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full)
    else if (entry.endsWith('.module.css') || entry === 'styles.css') {
      const rel = relative(srcRoot, full)
      const dest = join(outRoot, rel)
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(full, dest)
      console.log('copied', rel)
    }
  }
}
walk(srcRoot)
