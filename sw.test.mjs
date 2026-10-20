// Runs the real sw.js in a sandbox with an in-memory Cache API and a scriptable network.
// Usage: node --test (discovers *.test.mjs)
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SCOPE = 'https://games.test/scrabble/'
const TAILWIND = 'https://cdn.tailwindcss.com/'
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap'
const F1 = 'https://fonts.gstatic.com/s/amiri/a.woff2', F2 = 'https://fonts.gstatic.com/s/amiri/b.woff2'
const abs = u => new URL(u, SCOPE).href
const strip = u => u.split('?')[0]

class MemCache {
  m = new Map()
  key(r) { return new URL(typeof r === 'string' ? r : r.url, SCOPE).href }
  async match(r, o = {}) {
    const k = this.key(r)
    for (const [mk, v] of this.m) if ((o.ignoreSearch ? strip(mk) === strip(k) : mk === k)) return v.clone ? v.clone() : v
  }
  async put(r, res) { this.m.set(this.key(r), res) }
  async add(r, net) { const res = await net(r); if (!res.ok && res.type !== 'opaque') throw new TypeError('bad response'); this.m.set(this.key(r), res) }
}

function boot() {
  const routes = {
    [abs('index.html')]: ['<html>v1', 'text/html'],
    [abs('pwa.js')]: ['js', 'text/javascript'],
    [abs('word-validator.mjs')]: ['export const validator = true', 'text/javascript'],
    [abs('dictionary/ar-fusha.txt')]: [`خلط\n# VERBS\nخلط|يخلط|اخلط`, 'text/plain; charset=utf-8'],
    [abs('manifest.webmanifest')]: ['{}', 'application/manifest+json'],
    [abs('icons/icon-192.png')]: ['p', 'image/png'], [abs('icons/icon-512.png')]: ['p', 'image/png'],
    [abs('icons/icon-maskable-512.png')]: ['p', 'image/png'], [abs('icons/apple-touch-icon.png')]: ['p', 'image/png'],
    [TAILWIND]: ['tailwind', 'application/javascript; charset=utf-8'],
    [FONT_CSS]: [`@font-face{src:url(${F1}) format('woff2')}@font-face{src:url("${F2}") format('woff2')}@font-face{src:url(${F1})}`, 'text/css'],
    [F1]: ['font1', 'font/woff2'], [F2]: ['font2', 'font/woff2'],
  }
  const net = { offline: false, noCors: new Set(), status: {}, routes, hits: [] }
  const fetchFn = async (r, init = {}) => {
    const url = new URL(typeof r === 'string' ? r : r.url, SCOPE).href
    const mode = init.mode ?? (typeof r === 'string' ? 'cors' : r.mode)
    net.hits.push(url)
    if (net.offline) throw new TypeError('offline')
    const cross = new URL(url).origin !== new URL(SCOPE).origin
    if (cross && mode === 'cors' && net.noCors.has(new URL(url).origin)) throw new TypeError('CORS')
    if (cross && mode === 'no-cors') return { type: 'opaque', ok: false, status: 0, headers: new Headers(), clone() { return this } }
    const route = routes[strip(url)] ?? routes[url]
    const res = route ? new Response(route[0], { status: net.status[url] ?? 200, headers: { 'content-type': route[1] } }) : new Response('nope', { status: 404 })
    if (cross) Object.defineProperty(res, 'type', { value: 'cors' })
    return res
  }
  const stores = new Map()
  const caches = {
    async open(n) { if (!stores.has(n)) { const c = new MemCache(); const add = c.add.bind(c); c.add = r => add(r, fetchFn); c.addAll = rs => Promise.all(rs.map(r => c.add(r))); stores.set(n, c) } return stores.get(n) },
    async keys() { return [...stores.keys()] },
    async delete(n) { return stores.delete(n) },
  }
  const spy = { skip: 0, claim: 0 }, listeners = {}
  class Req extends Request { constructor(u, i) { super(typeof u === 'string' ? abs(u) : u, i) } }
  const sb = {
    caches, fetch: fetchFn, Request: Req, Response, URL, Promise, Set, Map, Error, TypeError, RegExp, Headers, console,
    location: new URL(SCOPE), registration: { scope: SCOPE },
    skipWaiting: () => { spy.skip++ }, clients: { claim: async () => { spy.claim++ } },
    addEventListener: (t, f) => { listeners[t] = f },
  }
  sb.self = sb
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf-8'), sb)
  const run = async (type, ev = {}) => {
    const waits = []; let response
    listeners[type]({ ...ev, waitUntil: p => waits.push(p), respondWith: p => { response = Promise.resolve(p) } })
    await Promise.all(waits); return response
  }
  const get = (url, mode = 'cors') => run('fetch', { request: { method: 'GET', url, mode } })
  return { net, stores, spy, run, get, open: n => caches.open(n), cache: () => stores.get('scrabble:/scrabble/:v2') }
}

let sw
beforeEach(() => { sw = boot() })
const text = async p => (await p).text()

test('install stores the game, Tailwind, the font CSS and every font file, then takes over', async () => {
  await sw.run('install')
  const keys = [...sw.cache().m.keys()]
  for (const k of ['index.html', 'pwa.js', 'word-validator.mjs', 'dictionary/ar-fusha.txt', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'].map(abs)) assert.ok(keys.includes(k), k)
  for (const k of [TAILWIND, FONT_CSS, F1, F2]) assert.ok(keys.includes(k), k)
  assert.equal(sw.spy.skip, 1)
})

test('Tailwind falls back to an opaque copy when its host sends no CORS headers', async () => {
  sw.net.noCors.add('https://cdn.tailwindcss.com')
  await sw.run('install')
  assert.equal(sw.cache().m.get(TAILWIND).type, 'opaque')
})

test('install fails (old version stays) when Tailwind answers with something that is not JavaScript, or a game file is missing', async () => {
  sw.net.routes[TAILWIND] = ['<html>blocked', 'text/html']
  await assert.rejects(sw.run('install'))
  sw = boot(); delete sw.net.routes[abs('pwa.js')]
  await assert.rejects(sw.run('install'))
  sw = boot(); sw.net.offline = true
  await assert.rejects(sw.run('install'))
})

test('install still succeeds when the fonts cannot be fetched: they have fallbacks', async () => {
  sw.net.status[FONT_CSS] = 500
  await sw.run('install')
  assert.ok(sw.cache().m.has(abs('index.html')) && sw.cache().m.has(TAILWIND))
  assert.ok(!sw.cache().m.has(FONT_CSS))
})

test('opens the game offline for every navigation, including query strings and sub-paths', async () => {
  await sw.run('install'); sw.net.offline = true
  for (const p of ['', '?utm=1', 'index.html', 'whatever']) assert.equal(await text(sw.get(abs(p), 'navigate')), '<html>v1')
})

test('a new deploy is fetched in the background and shown on the next launch', async () => {
  await sw.run('install')
  sw.net.routes[abs('index.html')] = ['<html>v2', 'text/html']
  assert.equal(await text(sw.get(abs(''), 'navigate')), '<html>v1')
  assert.equal(await text(sw.get(abs(''), 'navigate')), '<html>v2')
})

test('a captive-portal page or an error never replaces a good game file', async () => {
  await sw.run('install')
  sw.net.routes[abs('pwa.js')] = ['<html>wifi login', 'text/html']; await sw.get(abs('pwa.js'))
  sw.net.routes[abs('index.html')] = ['<html>wifi login', 'text/plain']; await sw.get(abs(''), 'navigate')
  sw.net.routes[abs('index.html')] = ['x', 'text/html']; sw.net.status[abs('index.html')] = 503; await sw.get(abs(''), 'navigate')
  assert.equal(await text(sw.get(abs('pwa.js'))), 'js')
  assert.equal(await text(sw.get(abs(''), 'navigate')), '<html>v1')
})

test('Tailwind and fonts come from cache offline', async () => {
  await sw.run('install'); sw.net.offline = true; sw.net.hits.length = 0
  assert.equal(await text(sw.get(TAILWIND, 'no-cors')), 'tailwind')
  assert.match(await text(sw.get(FONT_CSS, 'no-cors')), /font-face/)
  assert.equal(await text(sw.get(F1)), 'font1')
  assert.deepEqual(sw.net.hits, [])
})

test('local validator and dictionary stay available while offline', async () => {
  await sw.run('install'); sw.net.offline = true
  assert.match(await text(sw.get(abs('word-validator.mjs'))), /validator = true/)
  assert.match(await text(sw.get(abs('dictionary/ar-fusha.txt'))), /خلط/)
})

test('an unseen font file is fetched once and kept; opaque and failed responses are not kept', async () => {
  await sw.run('install')
  const F3 = 'https://fonts.gstatic.com/s/amiri/c.woff2'; sw.net.routes[F3] = ['font3', 'font/woff2']
  assert.equal(await text(sw.get(F3)), 'font3'); assert.ok(sw.cache().m.has(F3))
  const F4 = 'https://fonts.gstatic.com/s/amiri/d.woff2'; sw.net.routes[F4] = ['x', 'font/woff2']; sw.net.status[F4] = 500
  await sw.get(F4); assert.ok(!sw.cache().m.has(F4))
  const F5 = 'https://fonts.gstatic.com/s/amiri/e.woff2'
  await sw.get(F5, 'no-cors'); assert.ok(!sw.cache().m.has(F5))
})

test('leaves unrelated origins and non-GET requests alone', async () => {
  await sw.run('install')
  assert.equal(await sw.get('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'), undefined)
  assert.equal(await sw.get('https://firestore.googleapis.com/x'), undefined)
  assert.equal(await sw.run('fetch', { request: { method: 'POST', url: abs('index.html'), mode: 'cors' } }), undefined)
})

test('activation drops older versions of this app only, then claims clients', async () => {
  for (const n of ['scrabble:/scrabble/:v1', 'scrabble:/other/:v1', 'unrelated']) await sw.open(n)
  await sw.run('install'); await sw.run('activate')
  assert.deepEqual([...sw.stores.keys()].sort(), ['scrabble:/other/:v1', 'scrabble:/scrabble/:v2', 'unrelated'])
  assert.equal(sw.spy.claim, 1)
})

// Drift guards: sw.js hard-codes URLs that live in index.html and a list of files that live on disk.
import { existsSync } from 'node:fs'
test('sw.js stays in sync with index.html and the files on disk', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf-8'), html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8')
  const pick = name => sw.match(new RegExp(`const ${name} = '([^']+)'`))[1]
  assert.ok(html.includes(`src="${pick('TAILWIND')}"`), 'Tailwind URL differs from index.html')
  assert.ok(html.includes(pick('FONT_CSS')), 'Google Fonts URL differs from index.html')
  const local = JSON.parse(sw.match(/const LOCAL = (\[[^\]]+\])/)[1].replace(/'/g, '"'))
  for (const f of local) assert.ok(existsSync(new URL('../' + f, import.meta.url)), `${f} listed in sw.js but missing`)
  for (const ref of ['manifest.webmanifest', 'pwa.js', 'icons/apple-touch-icon.png']) assert.ok(local.includes('./' + ref) && html.includes(ref), ref)
  const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf-8'))
  for (const i of manifest.icons) assert.ok(local.includes('./' + i.src), `manifest icon ${i.src} is not precached`)
})
