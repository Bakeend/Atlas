import type { FinanceNotification } from './notifications'

const STORAGE_SENT_KEY = 'atlas-system-notifications-sent'
const STORAGE_SETTINGS_KEY = 'atlas-system-notifications-settings'

export interface SystemNotificationSettings {
  enabled: boolean
  // controle fino por tipo — quando undefined assume true
  enabledKinds?: Record<string, boolean>
  // se true, pede permissão automaticamente na primeira visita
  autoRequest?: boolean
}

const DEFAULT_SETTINGS: SystemNotificationSettings = {
  enabled: true,
  enabledKinds: {},
}

function isCapacitorNative(): boolean {
  try {
    // @ts-ignore - dynamic check sem quebrar web
    const cap = (window as any).Capacitor
    return Boolean(cap?.isNativePlatform && cap.isNativePlatform())
  } catch {
    return false
  }
}

// ── Preferências ──
export function getSystemNotificationSettings(): SystemNotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...parsed, enabledKinds: { ...DEFAULT_SETTINGS.enabledKinds, ...(parsed.enabledKinds ?? {}) } }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function setSystemNotificationSettings(patch: Partial<SystemNotificationSettings>) {
  const current = getSystemNotificationSettings()
  const next = { ...current, ...patch, enabledKinds: { ...(current.enabledKinds ?? {}), ...(patch.enabledKinds ?? {}) } }
  // se patch traz enabledKinds completo, mescla
  if (patch.enabledKinds) next.enabledKinds = { ...(current.enabledKinds ?? {}), ...patch.enabledKinds }
  localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(next))
  return next
}

export function isKindEnabled(kind: string): boolean {
  const s = getSystemNotificationSettings()
  if (!s.enabled) return false
  if (s.enabledKinds && kind in s.enabledKinds) return Boolean(s.enabledKinds[kind])
  return true
}

// ── Permissões ──
export type PermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported'

export function getPermissionStatus(): PermissionStatus {
  if (isCapacitorNative()) {
    // no nativo, assumimos que checaremos via plugin; sync fallback:
    return 'default'
  }
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission as PermissionStatus
}

export async function getPermissionStatusAsync(): Promise<PermissionStatus> {
  if (isCapacitorNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const result = await LocalNotifications.checkPermissions()
      // LocalNotifications retorna { display: 'granted' | 'denied' | 'prompt' }
      const display = (result as any).display
      if (display === 'granted') return 'granted'
      if (display === 'denied') return 'denied'
      return 'default'
    } catch {
      return 'default'
    }
  }
  return getPermissionStatus()
}

export async function requestSystemNotificationPermission(): Promise<boolean> {
  const settings = getSystemNotificationSettings()
  if (!settings.enabled) return false

  if (isCapacitorNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const result = await LocalNotifications.requestPermissions()
      const display = (result as any).display
      return display === 'granted'
    } catch (e) {
      console.warn('[NOTIFICATION] falha ao pedir permissão nativa', e)
      return false
    }
  }

  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const perm = await Notification.requestPermission()
    return perm === 'granted'
  } catch {
    return false
  }
}

// ── Histórico / deduplicação ──

type SentMap = Record<string, string> // id -> ISO timestamp

function loadSent(): SentMap {
  try {
    const raw = localStorage.getItem(STORAGE_SENT_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SentMap
  } catch {
    return {}
  }
}

function saveSent(map: SentMap) {
  try {
    localStorage.setItem(STORAGE_SENT_KEY, JSON.stringify(map))
  } catch {}
}

export function hasBeenSent(id: string): boolean {
  const map = loadSent()
  return id in map
}

export function markAsSent(id: string) {
  const map = loadSent()
  map[id] = new Date().toISOString()
  // limpeza: mantém só últimos 200 e remove >30 dias
  const entries = Object.entries(map).sort((a, b) => b[1].localeCompare(a[1]))
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const pruned: SentMap = {}
  for (const [k, v] of entries.slice(0, 200)) {
    if (v >= cutoff) pruned[k] = v
  }
  // garante que o atual permanece mesmo se cortado por data (é recente)
  pruned[id] = map[id]
  saveSent(pruned)
}

export function clearSentHistory() {
  localStorage.removeItem(STORAGE_SENT_KEY)
}

// ── Helpers ──

function toLocalNotificationId(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  return (hash % 2_147_000_000) + 1
}

function iconForKind(kind: FinanceNotification['kind']): string {
  // Para web, usamos ícone do PWA; para nativo smallIcon é configurado no capacitor.config
  return '/icons/icon-192.svg'
}

// ── Envio principal ──

export async function canSendSystemNotifications(): Promise<boolean> {
  const settings = getSystemNotificationSettings()
  if (!settings.enabled) return false
  const perm = await getPermissionStatusAsync()
  return perm === 'granted'
}

export async function showSystemNotification(notification: FinanceNotification): Promise<boolean> {
  if (!isKindEnabled(notification.kind)) return false
  if (hasBeenSent(notification.id)) return false

  const permOk = await canSendSystemNotifications()
  if (!permOk) return false

  try {
    if (isCapacitorNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      // Garante canal (Android 8+ precisa de canal)
      try {
        await LocalNotifications.createChannel({
          id: 'atlas-finance-alerts',
          name: 'Atlas - Alertas financeiros',
          description: 'Avisos sobre contas, orçamentos e saúde financeira',
          importance: 4,
          visibility: 1,
          sound: 'default',
          vibration: true,
          lights: true,
          lightColor: '#2F80ED',
        } as any)
      } catch {}
      await LocalNotifications.schedule({
        notifications: [
          {
            id: toLocalNotificationId(notification.id),
            title: notification.title,
            body: notification.message,
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#2F80ED',
            channelId: 'atlas-finance-alerts',
            extra: { href: notification.href, notificationId: notification.id },
            schedule: { at: new Date(Date.now() + 500) } as any,
          } as any,
        ],
      })
      markAsSent(notification.id)
      return true
    }

    // Web: tenta via Service Worker se disponível, senão via Notification direto
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready
        if (reg?.showNotification) {
          await reg.showNotification(notification.title, {
            body: notification.message,
            icon: iconForKind(notification.kind),
            badge: '/icons/icon-192.svg',
            tag: notification.id,
            renotify: false,
            requireInteraction: false,
            data: { href: notification.href, notificationId: notification.id },
          } as any)
          markAsSent(notification.id)
          return true
        }
      } catch (e) {
        console.warn('[NOTIFICATION] SW showNotification falhou, fallback para Notification', e)
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(notification.title, {
        body: notification.message,
        icon: iconForKind(notification.kind),
        tag: notification.id,
        data: { href: notification.href },
      } as any)
      n.onclick = () => {
        try {
          window.focus()
          // navega se SPA: tenta usar history push
          if (notification.href && window.location.pathname !== notification.href) {
            window.location.href = notification.href
          }
          n.close()
        } catch {}
      }
      markAsSent(notification.id)
      return true
    }
  } catch (e) {
    console.warn('[NOTIFICATION] falha ao exibir notificação de sistema', e)
    return false
  }
  return false
}

/**
 * Agenda notificações futuras para quando o app estiver fechado (Android).
 * No web, agenda apenas verifica na próxima abertura (limitação do browser).
 */
export async function scheduleFutureNotifications(notifications: FinanceNotification[]): Promise<number> {
  if (!notifications.length) return 0
  const settings = getSystemNotificationSettings()
  if (!settings.enabled) return 0
  if (!(await canSendSystemNotifications())) return 0
  if (!isCapacitorNative()) return 0 // web não suporta agendamento real quando fechado

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    // Filtra apenas futuros (date >= hoje) e não enviados
    const todayStr = new Date().toISOString().slice(0, 10)
    const toSchedule = notifications
      .filter(n => isKindEnabled(n.kind) && !hasBeenSent(n.id) && n.date >= todayStr)
      .slice(0, 20) // limite para não sobrecarregar

    if (!toSchedule.length) return 0

    // Cria canal se necessário
    try {
      await LocalNotifications.createChannel({
        id: 'atlas-finance-alerts',
        name: 'Atlas - Alertas financeiros',
        description: 'Avisos sobre contas, orçamentos e saúde financeira',
        importance: 4,
        visibility: 1,
        sound: 'default',
        vibration: true,
      } as any)
    } catch {}

    // Cancela pendentes antigos com mesmo tag? Mantém simples: agenda novos
    const schedulables = toSchedule.map(n => {
      // agenda para 09:00 do dia do vencimento/alerta
      const at = new Date(`${n.date}T09:00:00`)
      // se for hoje e já passou 09:00, agenda para agora+1min
      if (at.getTime() < Date.now() + 60_000) at.setTime(Date.now() + 60_000)
      return {
        id: toLocalNotificationId(n.id),
        title: n.title,
        body: n.message,
        smallIcon: 'ic_stat_icon_config_sample',
        iconColor: '#2F80ED',
        channelId: 'atlas-finance-alerts',
        extra: { href: n.href, notificationId: n.id },
        schedule: { at: at.toISOString() } as any,
      } as any
    })

    await LocalNotifications.schedule({ notifications: schedulables })
    return schedulables.length
  } catch (e) {
    console.warn('[NOTIFICATION] falha ao agendar futuras', e)
    return 0
  }
}

export async function cancelAllScheduled() {
  if (!isCapacitorNative()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) as any })
    }
  } catch {}
}

/**
 * Inicializa listeners de clique em notificação (para navegação).
 * Chamar uma vez no boot do app.
 */
export async function initSystemNotificationListeners(onNavigate?: (href: string) => void) {
  if (isCapacitorNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.addListener('localNotificationActionPerformed', (event: any) => {
        const href = event?.notification?.extra?.href
        if (href && onNavigate) onNavigate(href)
        else if (href) window.location.href = href
      })
    } catch {}
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event: any) => {
      const href = event?.data?.href
      if (href && onNavigate) onNavigate(href)
    })
  }
}
