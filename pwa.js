/* PWA glue: service worker registration, install button, connection notices.
   Independent of the game script: it only needs the optional #install-app button. All text is
   inserted with textContent. */
(() => {
  'use strict'

  const nav = navigator
  const standalone = () => matchMedia('(display-mode: standalone)').matches || nav.standalone === true
  // iPadOS reports itself as a Mac; touch points give it away.
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)

  /* ---------- notices ---------- */
  const live = document.createElement('div')
  live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite')
  Object.assign(live.style, { position: 'fixed', left: '0', right: '0', bottom: 'max(1rem, env(safe-area-inset-bottom))', zIndex: '60', display: 'flex', justifyContent: 'center', padding: '0 1rem', pointerEvents: 'none' })
  let timer = 0
  function notify(text, ms = 5000) {
    live.replaceChildren()
    const box = document.createElement('div')
    Object.assign(box.style, { maxWidth: '28rem', padding: '.6rem 1rem', borderRadius: '.5rem', background: '#f5e6b9', color: '#2b1a12', border: '1px solid #7d4e32', boxShadow: '0 4px 14px rgba(0,0,0,.5)', font: '600 1rem/1.5 "Traditional Arabic", Amiri, serif', textAlign: 'center' })
    box.textContent = text
    live.append(box)
    clearTimeout(timer); timer = setTimeout(() => live.replaceChildren(), ms)
  }
  // Runs now if the page is already parsed (DOMContentLoaded would never fire again), otherwise when it is.
  const ready = fn => (document.readyState === 'loading' ? addEventListener('DOMContentLoaded', fn) : fn())
  ready(() => document.body.append(live))

  addEventListener('offline', () => notify('أنت غير متصل بالإنترنت. اللعبة تعمل بدون اتصال.'))
  addEventListener('online', () => notify('عاد الاتصال بالإنترنت.', 2500))

  /* ---------- install ---------- */
  let prompt = null
  const button = () => document.getElementById('install-app')
  const show = on => { const b = button(); if (b) b.hidden = !on }

  addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; show(true) })
  addEventListener('appinstalled', () => { prompt = null; show(false); nav.storage?.persist?.().catch(() => {}) })

  ready(() => {
    const b = button(); if (!b) return
    if (ios && !standalone()) show(true) // no prompt API on iOS: the button explains the manual steps
    b.addEventListener('click', async () => {
      if (!prompt) { notify('للتثبيت: اضغط زر المشاركة في المتصفح، ثم اختر «إضافة إلى الشاشة الرئيسية».', 10000); return }
      const e = prompt; prompt = null; show(false) // the event is single-use
      try { await e.prompt() } catch { /* dismissed or unavailable */ }
    })
  })
  // Chromium grants persistent storage silently once installed; Firefox would ask on a plain visit, so only ask then.
  if (standalone()) nav.storage?.persist?.().catch(() => {})

  /* ---------- service worker ---------- */
  if ('serviceWorker' in nav) {
    addEventListener('load', async () => {
      try {
        const reg = await nav.serviceWorker.register('./sw.js')
        // No controller yet means this is the first install: the game is now stored on the device.
        const first = !nav.serviceWorker.controller
        const watch = w => w && w.addEventListener('statechange', () => { if (first && w.state === 'installed') notify('اللعبة جاهزة للعب بدون إنترنت.') })
        watch(reg.installing)
        reg.addEventListener('updatefound', () => watch(reg.installing))
      } catch { /* the game works online without it */ }
    })
  }
})()
