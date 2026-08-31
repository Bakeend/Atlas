import { registerSW } from 'virtual:pwa-register'

export function initPwa() {
  if ('serviceWorker' in navigator) {
    registerSW({
      immediate: true,
      onNeedRefresh() {},
      onOfflineReady() {
        console.log('[PWA] pronto para uso offline')
      },
    })
    navigator.serviceWorker.addEventListener('message', (event: any) => {
      const href = event?.data?.href
      if (href) window.location.href = href
    })
  }
}

export function initPwaPlaceholder() {
  initPwa()
}

if (typeof window !== 'undefined') {
  ;(window as any).__atlas_pwa = { initPwa }
}
