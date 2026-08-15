import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Portability: every path below is derived RELATIVE to this config file (which
// lives at the repo root), never hardcoded to an absolute checkout location.
// The project assumes a sibling `deepseek-harness` checkout next to it (a
// directory up), and its own node_modules right here. Cloning both repos side
// by side at any location then builds/steps without edits.

// node_modules path for this package (resolved against this file's directory).
const here = fileURLToPath(new URL('./', import.meta.url))
const nm = (spec) => here + 'node_modules/' + spec

// dsh sources resolve through explicit aliases (mirror of the dsh repo's own
// tsconfig paths map): tests import dsh SOURCE, never the built module-loader
// bundles. Vitest projects mode does NOT inherit root resolve config, so the
// aliases are duplicated into every project below.
const entries = JSON.parse(
  readFileSync(new URL('./docs/dsh-paths-entries.json', import.meta.url), 'utf8'),
) as [string, string][]
const dshAliases: { find: string; replacement: string }[] = []
// Single-React guarantee: the dsh source graph must not load its own react
// copy (dual-React breaks hooks). These aliases point every react import at
// our installed instance, which now matches the dsh checkout (18.3.1).
const reactAliases = [
  { find: 'react', replacement: nm('react') },
  { find: 'react-dom', replacement: nm('react-dom') },
  { find: 'react/jsx-runtime', replacement: nm('react/jsx-runtime') },
  { find: 'react/jsx-dev-runtime', replacement: nm('react/jsx-dev-runtime') },
  // Testing-library must also come from OUR install: the dsh checkout's copy
  // would native-require dsh's react-dom (externalized modules bypass aliases)
  // and break the single-React guarantee.
  { find: '@testing-library/react', replacement: nm('@testing-library/react') },
  { find: '@testing-library/dom', replacement: nm('@testing-library/dom') },
  { find: '@testing-library/user-event', replacement: nm('@testing-library/user-event') },
  // web-react's useSelector shim imports use-sync-external-store; the dsh
  // checkout's copy would native-require dsh's react (externalized modules
  // bypass aliases). Our installed copy peers against our react.
  { find: 'use-sync-external-store', replacement: nm('use-sync-external-store') },
]
// Expect a sibling checkout at <parent>/deepseek-harness / this/includes/docs.
const dshRoot = here + '../deepseek-harness/'
for (const [spec, target] of entries) {
  dshAliases.push({ find: spec, replacement: dshRoot + target.replace(/\\/g, '/').replace(/^\.\//, '') })
}
dshAliases.sort((a, b) => b.find.length - a.find.length)

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: dshAliases },
        test: {
          name: 'host',
          environment: 'node',
          include: ['tests/host/**/*.spec.ts'],
        },
      },
      {
        resolve: { alias: [...reactAliases, ...dshAliases] },
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['tests/client/**/*.spec.ts', 'tests/client/**/*.spec.tsx'],
          setupFiles: ['tests/client/setup.ts'],
        },
      },
    ],
  },
})