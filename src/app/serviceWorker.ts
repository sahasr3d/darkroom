/** Relative to the page, so the worker's scope is wherever the app is hosted (e.g. /darkroom/). */
export const SERVICE_WORKER_URL = './sw.js'

/**
 * Register the offline service worker. Production only: in dev it would cache Vite's
 * unhashed modules and serve stale code.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {
      // Offline support is an enhancement; the app runs the same without it.
    })
  })
}
