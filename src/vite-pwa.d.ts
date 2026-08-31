declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
    onRegistered?: (r: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (e: unknown) => void
  }): (reloadPage?: boolean) => Promise<void>
}
