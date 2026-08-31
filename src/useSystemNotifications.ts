import { useEffect, useRef } from 'react'
import type { FinanceData } from './domain'
import { getAllNotifications } from './notificationEngine'
import {
  canSendSystemNotifications,
  getPermissionStatus,
  getSystemNotificationSettings,
  hasBeenSent,
  requestSystemNotificationPermission,
  scheduleFutureNotifications,
  showSystemNotification,
} from './systemNotifications'
import { today } from './domain'

interface UseSystemNotificationsInput {
  data: FinanceData
  ready: boolean
  onNavigate?: (href: string) => void
}

/**
 * Hook determinístico que monitora dados financeiros e dispara
 * notificações de sistema (Windows central + Android) quando há
 * novos alertas relevantes.
 *
 * Regras:
 * - Só dispara se permissão concedida e preferência habilitada
 * - Deduplica por id (não reenvia mesmo alerta)
 * - Limita a 5 por ciclo para evitar spam
 * - Reavalia quando dados mudam, quando aba volta a foco,
 *   e periodicamente (30 min) enquanto app aberto
 * - Agenda também futuras no Android para funcionar com app fechado
 */
export function useSystemNotifications({ data, ready, onNavigate: _onNavigate }: UseSystemNotificationsInput) {
  const lastCheckRef = useRef<string>('')

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    let interval: number | undefined

    const evaluate = async () => {
      try {
        const referenceDate = today()
        // evita re-check duplicado no mesmo minuto com mesmos dados
        const key = `${referenceDate}-${JSON.stringify(getAllNotifications({ data, referenceDate }).map(n => n.id).join(','))}`
        if (lastCheckRef.current === key) return
        lastCheckRef.current = key

        const notifications = getAllNotifications({ data, referenceDate })
        if (!notifications.length) return

        const settings = getSystemNotificationSettings()
        if (!settings.enabled) return

        // Se ainda não tem permissão, não pede automaticamente aqui
        // (pedido deve ser via interação do usuário em Configurações)
        const perm = getPermissionStatus()
        if (perm === 'unsupported') return
        if (perm !== 'granted') {
          // Tenta agendar futuras mesmo sem perm atual? não
          return
        }
        if (!(await canSendSystemNotifications())) return

        // Filtra apenas não-enviadas e habilitadas por tipo
        const toSend = notifications.filter(n => !hasBeenSent(n.id)).slice(0, 5)
        for (const n of toSend) {
          if (cancelled) break
          const ok = await showSystemNotification(n)
          // pequeno delay entre notificações para não sobrepor
          if (ok) await new Promise(r => setTimeout(r, 300))
        }

        // Agenda futuras no Android (app fechado)
        const future = notifications.filter(n => n.date >= referenceDate)
        if (future.length) {
          await scheduleFutureNotifications(future)
        }
      } catch (e) {
        console.warn('[NOTIFICATION] evaluate falhou', e)
      }
    }

    // primeira avaliação após 2s (evita bloquear boot)
    const timeout = window.setTimeout(() => { void evaluate() }, 2000)

    // polling a cada 30 min enquanto app aberto
    interval = window.setInterval(() => { void evaluate() }, 30 * 60 * 1000)

    // reavalia quando volta a foco
    const onVisible = () => {
      if (document.visibilityState === 'visible') void evaluate()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      if (interval) window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [data, ready])
}

// Hook util para UI de permissão
export function useNotificationPermission() {
  const request = async () => {
    const granted = await requestSystemNotificationPermission()
    return granted
  }
  return { request, getStatus: getPermissionStatus }
}
