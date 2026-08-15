import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const base = 'http://127.0.0.1:3080'
// Derive the repo root from this script's own location so the probe works
// from any clone location (no hardcoded absolute path).
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

async function rpc(endpoint, payload) {
  const body = JSON.stringify({ type: 'client-request', rpcId: 'cf-' + Math.random().toString(36).slice(2), method: endpoint, payload })
  const res = await fetch(base + '/better-sidebar/' + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  const text = await res.text()
  console.log(endpoint, 'status', res.status, '->', text.slice(0, 200))
}

// valid payload: workspace root + a real commit hash from the profile repo? use our workspace HEAD
const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
console.log('hash:', hash)
await rpc('git/commit-files', { path: repoRoot, hash })
await rpc('git/commit-files', { path: repoRoot, hash: 'nothex!!' })
await rpc('git/commit-files', { path: repoRoot })
// served bundle version check
const js = await (await fetch(base + '/plugins/dsh-better-sidebar-lite/client.js')).text()
console.log('bundle has commitFiles endpoint:', js.includes('git/commit-files'))
console.log('bundle len:', js.length)
