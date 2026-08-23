// Registro do Service Worker — preparado mas NÃO importado ainda.
// Quando ativar PWA: descomente o import em src/main.tsx:5
//
// import { registerSW } from 'virtual:pwa-register'
// export function initPwa() {
//   registerSW({ immediate: true })
// }

export function initPwaPlaceholder() {
  // placeholder para não quebrar build sem vite-plugin-pwa instalado
  if ('serviceWorker' in navigator) {
    // registro manual opcional se usar workbox direto
  }
}
