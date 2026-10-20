/* Arabic Scrabble service worker. There is no build step, so there is no generated version: bump CACHE
   whenever this file's logic or file list changes. Game files (index.html and friends) never need a bump:
   they are served instantly from cache and refreshed in the background, so a deploy reaches players on
   their next launch. The page is never swapped mid-game, because the game state lives only in memory. */
'use strict'

const CACHE = 'v2'
const SCOPE = self.registration.scope
// Scoped by path: on github.io several projects share one origin and must not clear each other's caches.
const NS = 'scrabble:' + new URL(SCOPE).pathname
const NAME = `${NS}:${CACHE}`
const INDEX = new URL('./index.html', SCOPE).href

// Everything the game needs to start. A missing file fails the install on purpose, so "offline ready"
// is only ever announced when it is true.
const LOCAL = ['./index.html', './pwa.js', './word-validator.mjs', './dictionary/ar-fusha.txt', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png']
const TAILWIND = 'https://cdn.tailwindcss.com'                                           // must match index.html
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap' // must match index.html
// Hosts we may cache from. Anything else goes straight to the network.
const THIRD_PARTY = new Set(['https://cdn.tailwindcss.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'])

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(NAME)
    await Promise.all([
      // cache:'reload' skips the HTTP cache, so a stale copy is never frozen into the new version.
      cache.addAll(LOCAL.map(u => new Request(u, { cache: 'reload' }))),
      precacheScript(cache, TAILWIND),
      // Typefaces have fallbacks (see the font stack in index.html); the game must not stay uninstalled over them.
      precacheFonts(cache).catch(() => {}),
    ])
    // Safe to take over at once: caches only grow, files are refreshed in place, and open pages keep what they loaded.
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k.startsWith(NS + ':') && k !== NAME).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin === self.location.origin) {
    // Single page: every navigation inside the scope is the cached game.
    event.respondWith(revalidating(event, request.mode === 'navigate' ? INDEX : request.url))
  } else if (THIRD_PARTY.has(url.origin)) {
    event.respondWith(thirdParty(event))
  }
})

/** The Tailwind play script is a plain <script> tag, which only needs an opaque response. Ask with CORS
 *  first so the answer can be checked; fall back to opaque if the host sends no CORS headers. */
async function precacheScript(cache, url) {
  let res
  try { res = await fetch(url, { mode: 'cors' }) } catch { res = await fetch(url, { mode: 'no-cors' }) } // throws again when offline: the install retries later
  const ok = res.type === 'opaque' || (res.ok && /javascript/i.test(res.headers.get('content-type') || ''))
  if (!ok) throw new Error(`unexpected response for ${url}`)
  await cache.put(url, res)
}

/** Google Fonts answers with CSS that names the font files; read it so every file is stored up front. */
async function precacheFonts(cache) {
  const css = await fetch(FONT_CSS, { mode: 'cors' })
  if (!css.ok) return
  const files = [...new Set([...(await css.clone().text()).matchAll(/url\(["']?(https:\/\/fonts\.gstatic\.com\/[^)"']+)["']?\)/g)].map(m => m[1]))]
  await cache.put(FONT_CSS, css)
  await Promise.all(files.map(async u => { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await cache.put(u, r) }))
}

/** Same-origin files: answer from cache at once, refresh in the background. */
async function revalidating(event, target) {
  const key = new URL(target); key.search = ''
  const cache = await caches.open(NAME)
  const hit = await cache.match(key.href, { ignoreSearch: true })
  const html = key.pathname.endsWith('.html')
  const refresh = fetch(key.href, { cache: 'no-cache' }).then(async res => {
    // A captive-portal login page answers 200 with HTML for any URL: never let that overwrite a good file.
    if (res.ok && /html/i.test(res.headers.get('content-type') || '') === html) await cache.put(key.href, res.clone())
    return res
  })
  event.waitUntil(refresh.catch(() => {})) // keeps the worker alive until the cache write is done
  return hit || refresh
}

/** Tailwind, Google Fonts CSS and font files: cache-first, filled on a miss. These never change under the
 *  same URL in a way the game depends on, and refreshing happens when CACHE is bumped. */
async function thirdParty(event) {
  const { request } = event
  const cache = await caches.open(NAME)
  const hit = await cache.match(request.url, { ignoreVary: true }) // Google Fonts CSS varies by User-Agent; ours came from this browser anyway
  if (hit) return hit
  const res = await fetch(request)
  // Opaque responses can be error pages we could not tell apart, and cache-first would serve them forever.
  if (res.ok && res.type !== 'opaque') event.waitUntil(cache.put(request.url, res.clone()))
  return res
}
