import { useEffect, useState } from 'react'
import { Bell, BellOff, Check, ShieldAlert } from 'lucide-react'
import { Card, PageTitle } from './components'
import {
  getPermissionStatus,
  getSystemNotificationSettings,
  requestSystemNotificationPermission,
  setSystemNotificationSettings,
  type PermissionStatus,
} from './systemNotifications'

const KINDS: Array<{ key: string; label: string; description: string }> = [
  { key: 'overdue', label: 'Conta vencida', description: 'Quando uma conta recorrente está em atraso' },
  { key: 'reminder', label: 'Vencimento próximo', description: 'Lembrete antes do vencimento' },
  { key: 'budget-warning', label: 'Orçamento em alerta (80%)', description: 'Quando atingir 80% do limite' },
  { key: 'budget-exceeded', label: 'Orçamento excedido', description: 'Quando ultrapassar o limite mensal' },
  { key: 'daily-overspent', label: 'Gasto diário acima do recomendado', description: 'Quando o gasto do dia supera o limite seguro' },
  { key: 'forecast-negative', label: 'Previsão de saldo negativo', description: 'Quando o saldo pode ficar negativo nos próximos 30 dias' },
  { key: 'anomaly', label: 'Gasto acima da média', description: 'Quando o gasto da categoria dispara' },
  { key: 'goal-overdue', label: 'Meta atrasada', description: 'Quando a meta passa do prazo sem ser atingida' },
  { key: 'recurring-increase', label: 'Aumento em despesa recorrente', description: 'Quando conta variável sobe acima do cadastrado' },
  { key: 'free-money-drop', label: 'Queda no dinheiro livre', description: 'Quando o dinheiro livre cai significativamente' },
  { key: 'goal-opportunity', label: 'Oportunidade para metas', description: 'Quando há dinheiro livre para reservar' },
]

export function NotificationSettings() {
  const [settings, setSettings] = useState(() => getSystemNotificationSettings())
  const [permission, setPermission] = useState<PermissionStatus>(() => getPermissionStatus())
  const [requesting, setRequesting] = useState(false)

  const refreshPermission = () => setPermission(getPermissionStatus())

  useEffect(() => {
    refreshPermission()
    const id = window.setInterval(refreshPermission, 2000)
    return () => window.clearInterval(id)
  }, [])

  const toggleEnabled = () => {
    const next = setSystemNotificationSettings({ enabled: !settings.enabled })
    setSettings(next)
    if (next.enabled && permission !== 'granted') void handleRequest()
  }

  const handleRequest = async () => {
    setRequesting(true)
    try {
      const granted = await requestSystemNotificationPermission()
      setPermission(granted ? 'granted' : getPermissionStatus())
    } finally {
      setRequesting(false)
    }
  }

  const toggleKind = (key: string) => {
    const current = settings.enabledKinds?.[key] ?? true
    const nextKinds = { ...(settings.enabledKinds ?? {}), [key]: !current }
    const next = setSystemNotificationSettings({ enabledKinds: nextKinds })
    setSettings(next)
  }

  const permissionLabel =
    permission === 'granted'
      ? 'Permitidas'
      : permission === 'denied'
        ? 'Bloqueadas'
        : permission === 'unsupported'
          ? 'Não suportado neste navegador'
          : 'Não solicitadas'

  const needsRequest = settings.enabled && permission !== 'granted' && permission !== 'unsupported'

  return (
    <>
      <PageTitle eyebrow="Configurações" title="Notificações" backTo="/settings" />
      <div className="space-y-5">
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand">
              <Bell size={20} />
            </span>
            <div className="flex-1">
              <h2 className="section-title">Notificações do sistema</h2>
              <p className="mt-1 text-sm text-muted">Envia alertas para a central do Windows e do Android.</p>
            </div>
            <button
              type="button"
              className={`toggle ${settings.enabled ? 'active' : ''}`}
              onClick={toggleEnabled}
              aria-pressed={settings.enabled}
              aria-label={settings.enabled ? 'Desativar notificações do sistema' : 'Ativar notificações do sistema'}
            >
              <span />
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5">
            <div className="flex items-center gap-2">
              {permission === 'granted' ? <Check size={14} className="text-emerald-600" /> : <ShieldAlert size={14} className="text-amber-600" />}
              <span className="font-semibold">Permissão do sistema: {permissionLabel}</span>
            </div>
            <p className="mt-2 text-muted">
              {permission === 'granted'
                ? 'O Atlas pode exibir notificações mesmo quando você não estiver olhando para o app.'
                : permission === 'denied'
                  ? 'Você bloqueou notificações no navegador/sistema. Libere nas configurações do sistema ou do site para voltar a receber.'
                  : permission === 'unsupported'
                    ? 'Este navegador não suporta notificações de sistema.'
                    : 'Permita notificações para receber alertas na central do seu dispositivo.'}
            </p>
            {needsRequest && (
              <button className="btn-primary mt-3 w-full" onClick={handleRequest} disabled={requesting}>
                {requesting ? 'Solicitando...' : 'Permitir notificações'}
              </button>
            )}
            {!settings.enabled && (
              <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-amber-800">
                <BellOff size={16} className="mt-0.5 shrink-0" />
                <span>Notificações do sistema estão desativadas. Ative acima para voltar a receber.</span>
              </div>
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-muted">
              Quando o app estiver em segundo plano, os alertas aparecem na central do sistema. No Android, também quando o app estiver fechado
              (agendados às 09:00 do dia do vencimento). No Windows (PWA), funcionam quando o navegador estiver aberto ou a janela em segundo plano;
              com o navegador totalmente fechado, aparecem na próxima abertura.
            </p>
          </div>
        </Card>

        <Card>
          <h3 className="section-title">Tipos de alerta</h3>
          <p className="mt-1 text-sm text-muted">Escolha quais situações devem gerar notificação no sistema. A central interna do app continua mostrando todos.</p>
          <div className="mt-4 space-y-2">
            {KINDS.map(kind => {
              const enabled = settings.enabledKinds?.[kind.key] ?? true
              const disabled = !settings.enabled
              return (
                <button
                  key={kind.key}
                  type="button"
                  onClick={() => toggleKind(kind.key)}
                  disabled={disabled}
                  aria-pressed={enabled}
                  className={`settings-row w-full text-left ${disabled ? 'opacity-50' : ''} ${enabled ? 'bg-white' : 'bg-slate-50'}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{kind.label}</p>
                    <p className="mt-1 text-sm text-muted">{kind.description}</p>
                  </div>
                  <span className={`toggle shrink-0 ${enabled && !disabled ? 'active' : ''}`}>
                    <span />
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              className="btn-secondary flex-1"
              onClick={() => {
                const allOn: Record<string, boolean> = {}
                for (const k of KINDS) allOn[k.key] = true
                const next = setSystemNotificationSettings({ enabledKinds: allOn })
                setSettings(next)
              }}
            >
              Ativar todos
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={() => {
                const allOff: Record<string, boolean> = {}
                for (const k of KINDS) allOff[k.key] = false
                const next = setSystemNotificationSettings({ enabledKinds: allOff })
                setSettings(next)
              }}
            >
              Desativar todos
            </button>
          </div>
        </Card>

        <Card>
          <h3 className="section-title">Como funciona</h3>
          <ul className="mt-3 space-y-3 text-xs leading-5 text-muted">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"></span>
              <span>
                <strong className="text-ink">Determinístico:</strong> todas as notificações vêm de regras fixas (sem IA). Mesmos dados, mesmos alertas.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"></span>
              <span>
                <strong className="text-ink">Sem spam:</strong> cada alerta tem ID único (ex: conta + data). Não reenviamos o mesmo alerta por 30 dias.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"></span>
              <span>
                <strong className="text-ink">Android:</strong> agenda notificações futuras no sistema — disparam mesmo com app fechado, às 09:00 do dia do evento.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"></span>
              <span>
                <strong className="text-ink">Windows:</strong> usa a Central de Notificações do navegador. Funciona em segundo plano; Se o navegador for totalmente fechado,
                os alertas aparecem na próxima abertura (limitação do Web Push sem servidor).
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </>
  )
}
