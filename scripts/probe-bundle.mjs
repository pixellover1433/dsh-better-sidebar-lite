import { readFileSync } from 'node:fs'
const s = readFileSync('lib/client.js', 'utf8')
console.log('light --bsd-bg (#fff):', s.includes('--bsd-bg: #fff'))
console.log('dark --bsd-bg (#0d1117):', s.includes('--bsd-bg: #0d1117'))
console.log('body[data-ds-dark-theme]:', s.includes('body[data-ds-dark-theme]'))
console.log('--bsd-fg light (#1f2328):', s.includes('--bsd-fg: #1f2328'))
console.log('@import leftover:', s.includes('@import'))
