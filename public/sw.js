/*
 * Darkroom service worker (hand-rolled, no dependencies).
 *
 * - install:  precache the app shell (index.html, manifest, icons) plus the hashed entry
 *             assets and woff2 fonts that index.html and its stylesheet reference.
 * - fetch:    hashed same-origin ./assets/* are cache-first (their names change with content);
 *             navigations are network-first and fall back to the cached index.html offline.
 * - activate: delete caches from older versions and take control of open pages.
 *
 * Every URL is resolved against the registration scope, so the app works under any sub-path
 * (e.g. /darkroom/ on GitHub Pages).
 */
const VERSION = 'v1'
const SHELL_CACHE = `darkroom-shell-${VERSION}`
const ASSET_CACHE = `darkroom-assets-${VERSION}`
const CURRENT = [SHELL_CACHE, ASSET_CACHE]

const PRECACHE = ['./index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png']

const scoped = (path) => new URL(path, self.registration.scope).href

/** Relative ./assets/… references in an HTML or CSS text (entry chunks, stylesheet, fonts). */
function assetRefs(text, base) {
  const refs = new Set()
  const re = /(?:src|href)="(\.\/assets\/[^"]+)"|url\((\.\/[^)]+\.woff2)\)/g
  let m
  while ((m = re.exec(text))) refs.add(new URL(m[1] || m[2], base).href)
  return [...refs]
}

async function precache() {
  const shell = await caches.open(SHELL_CACHE)
  await shell.addAll(PRECACHE.map(scoped))
  // Best effort: also pull in the entry bundle and fonts so the very next launch works offline.
  try {
    const index = await shell.match(scoped('./index.html'))
    if (!index) return
    const entry = assetRefs(await index.text(), scoped('./'))
    const assets = await caches.open(ASSET_CACHE)
    await assets.addAll(entry)
    const styles = entry.filter((u) => u.endsWith('.css'))
    for (const css of styles) {
      const res = await assets.match(css)
      if (res) await assets.addAll(assetRefs(await res.text(), css))
    }
  } catch {
    // Assets are cached at runtime instead; the shell above is enough to start.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('darkroom-') && !CURRENT.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) await cache.put(request, res.clone())
  return res
}

async function networkFirst(request) {
  const shell = await caches.open(SHELL_CACHE)
  try {
    const res = await fetch(request)
    if (res.ok) await shell.put(scoped('./index.html'), res.clone())
    return res
  } catch {
    const cached = await shell.match(scoped('./index.html'))
    return cached || new Response('Darkroom is offline and has not been cached yet. Reconnect and reload.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }
  if (url.href.startsWith(scoped('./assets/'))) {
    event.respondWith(cacheFirst(request))
    return
  }
  // Shell files (manifest, icons): serve the precached copy, refresh from the network otherwise.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
})
