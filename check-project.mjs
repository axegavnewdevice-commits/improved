import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import vm from 'node:vm'

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'))
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

assert.match(html, /<html\s+lang="ar"\s+dir="rtl"/i, 'Arabic RTL document declaration is present')
assert.match(html, /id="theme-toggle"/, 'theme toggle is present')
assert.match(html, /localStorage\.getItem\('arabic-scrabble-theme'\)/, 'theme preference is read from local storage')
assert.match(html, /localStorage\.setItem\('arabic-scrabble-theme'/, 'theme preference is saved to local storage')
assert.match(html, /word-validator\.mjs/, 'local validator module is referenced')
assert.match(html, /word-review-modal/, 'unlisted-word review is present')
assert.doesNotMatch(html, /firebasejs\/|initializeApp\s*\(/, 'unused Firebase bootstrap is removed')
assert.equal(manifest.lang, 'ar')
assert.equal(manifest.dir, 'rtl')
assert.ok(manifest.icons.length >= 3)
assert.ok(Array.isArray(vercel.headers) && vercel.headers.length > 0)

for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  const attrs = match[1]
  const body = match[2]
  if (/\bsrc\s*=/.test(attrs) || /\btype\s*=\s*["']module["']/i.test(attrs)) continue
  if (body.trim()) new vm.Script(body, { filename: 'index.html:inline-script' })
}

for (const ref of [...html.matchAll(/(?:src|href)=["'](?!https?:|data:|#)([^"']+)["']/gi)].map(m => m[1])) {
  if (ref.startsWith('//')) continue
  const clean = ref.split(/[?#]/, 1)[0]
  if (!clean || clean.startsWith('mailto:')) continue
  await access(new URL('../' + clean.replace(/^\.\//, ''), import.meta.url))
}

console.log('Project checks passed: HTML inline script syntax, local references, manifest, Vercel headers, RTL declaration, and validator wiring.')
