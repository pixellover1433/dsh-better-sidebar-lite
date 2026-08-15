// Manual dev probe: asks the running local dsh web server (port 3080) to list
// the repo root via the better-sidebar host RPC. The repo path is derived
// from this script's own location, so it works from any clone location.
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const body = JSON.stringify({ type: 'client-request', rpcId: 'probe-2', method: 'explorer/list', payload: { path: repoRoot } })
const res = await fetch('http://127.0.0.1:3080/better-sidebar/explorer/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
const text = await res.text()
console.log('status:', res.status)
console.log('body head:', text.slice(0, 300))
