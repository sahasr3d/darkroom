import { describe, expect, test } from 'vitest'
import indexHtml from '../../../index.html?raw'
import manifestText from '../../../public/manifest.webmanifest?raw'
import swSource from '../../../public/sw.js?raw'
import { SERVICE_WORKER_URL } from '../serviceWorker'

/** The app is served from a sub-path (/darkroom/), so nothing may point at the site root. */
const isRelative = (url: string): boolean => !url.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(url)

interface Manifest {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  background_color: string
  theme_color: string
  icons: { src: string; sizes: string; purpose?: string }[]
}

const manifest = JSON.parse(manifestText) as Manifest

describe('web app manifest', () => {
  test('names and colours the installed app', () => {
    expect(manifest.name).toBe('Darkroom')
    expect(manifest.short_name).toBe('Darkroom')
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toBe('#0D0E10')
    expect(manifest.theme_color).toBe('#0D0E10')
  })
  test('start_url, scope and icons are relative', () => {
    expect(manifest.start_url).toBe('./')
    expect(manifest.scope).toBe('./')
    for (const icon of manifest.icons) expect(isRelative(icon.src)).toBe(true)
  })
  test('ships 192, 512 and a maskable 512 icon', () => {
    expect(manifest.icons.map((i) => `${i.sizes}:${i.purpose ?? 'any'}`).sort()).toEqual(['192x192:any', '512x512:any', '512x512:maskable'])
  })
})

describe('service worker', () => {
  test('is registered with a relative URL', () => {
    expect(SERVICE_WORKER_URL).toBe('./sw.js')
  })
  test('precache list is relative and covers the shell', () => {
    const list = /const PRECACHE = \[([^\]]+)\]/.exec(swSource)?.[1] ?? ''
    const entries = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(entries).toEqual(expect.arrayContaining(['./index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']))
    for (const e of entries) expect(e.startsWith('./')).toBe(true)
  })
  test('cache names are versioned and old caches are cleaned up', () => {
    expect(swSource).toMatch(/const VERSION = '[^']+'/)
    expect(swSource).toMatch(/caches\.delete/)
  })
  test('never references a root-absolute path', () => {
    expect(swSource).not.toMatch(/['"`]\/(?!\/)[a-z]/i)
  })
})

describe('index.html', () => {
  test('links the manifest and apple touch icon relatively', () => {
    const hrefs = [...indexHtml.matchAll(/<link[^>]+rel="(manifest|apple-touch-icon)"[^>]+href="([^"]+)"/g)].map((m) => [m[1], m[2]])
    expect(hrefs).toEqual([
      ['manifest', './manifest.webmanifest'],
      ['apple-touch-icon', './icons/apple-touch-icon.png'],
    ])
    for (const [, href] of hrefs) expect(isRelative(href)).toBe(true)
  })
  test('declares standalone metadata for iOS', () => {
    expect(indexHtml).toMatch(/name="apple-mobile-web-app-capable" content="yes"/)
    expect(indexHtml).toMatch(/name="apple-mobile-web-app-title" content="Darkroom"/)
  })
})
