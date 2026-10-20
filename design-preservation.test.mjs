import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const css = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? ''
const rule = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{[^{}]*\\}`, 'm'))?.[0]?.replace(/\s+/g, ' ').trim() ?? ''
}

test('original board, tile, rack, and premium-square CSS design values remain intact', () => {
  assert.match(css, /--primary-color:\s*#4a2f26/i)
  assert.match(css, /--board-color:\s*#7d4e32/i)
  assert.match(css, /--tile-bg:\s*#f5e6b9/i)
  assert.match(css, /--text-color:\s*#006400/i)
  assert.match(rule('.tile'), /padding-top:\s*100%/)
  assert.match(rule('.tile-letter'), /font-size:\s*clamp\(1\.2rem, 4vw, 1\.8rem\)/)
  assert.match(rule('.tile-letter'), /font-style:\s*normal/)
  assert.match(rule('.tile-letter'), /font-weight:\s*700/)
  assert.match(rule('.tile-content'), /background-color:\s*var\(--tile-bg\)/)
  assert.match(rule('.tile-content'), /color:\s*var\(--text-color\)/)
  assert.match(rule('.board'), /grid-template-columns:\s*repeat\(15, 1fr\)/)
  assert.match(rule('.board'), /background-color:\s*var\(--board-color\)/)
  for (const [selector, color] of [['.sq-tl', '#3b82f6'], ['.sq-dl', '#60a5fa'], ['.sq-tw', '#ef4444'], ['.sq-dw', '#f87171'], ['.sq-star', '#fbbf24']]) {
    assert.match(rule(selector), new RegExp(color, 'i'), selector)
  }
  assert.doesNotMatch(css, /:root\[data-theme="dark"\]\s+\.(?:board|tile|tile-content|tile-letter|rack|rack-slot)/i)
  assert.doesNotMatch(css, /filter:\s*(?:invert|brightness|hue-rotate)\s*\(/i)
})
