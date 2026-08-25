import { Check, ChevronRight, Download, Laptop, Moon, Sun, Trash2, Upload, Wallet, PiggyBank, ChartPie, CalendarClock, Sparkles, Zap, SlidersHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Card, CategoryIcon, Modal, PageTitle, SelectMenu } from './components'
import { currentSnapshot, useFinanceStore } from './store'
import { BackupFileSchema, summarizeBackup, type BackupSummary } from './data/backupSchema'
import type { FinanceData, Theme, HomeVisual } from './domain'
import { DEFAULT_SHORTCUTS, MAX_SHORTCUTS, NAV_DESTINATIONS } from './navigation'
import { getAdaptiveSuggestionIds } from './lib/homeAdaptive'

export function SettingsMenu() {
  const configLinks = [
    { to: '/settings/home', label: 'Tela inicial', description: 'Escolha o visual e os cards de sugestões do dia.' },
    { to: '/settings/appearance', label: 'Aparência', description: 'Claro, escuro ou seguir o sistema.' },
    { to: '/settings/nav', label: 'Navegação', description: 'Escolha os atalhos da barra inferior.' },
    { to: '/settings/finance', label: 'Financeiro', description: 'Margem de segurança e previsão de saldo.' },
    { to: '/settings/payment', label: 'Pagamento', description: 'Prioridades e preferências do organizador.' },
    { to: '/settings/privacy', label: 'Privacidade e dados', description: 'Valores ocultos, exportação e exclusão.' },
  ]
  return <>
    <PageTitle eyebrow="Perfil" title="Configurações"/>
    <div className="space-y-5">
      <Card><h2 className="section-title">Configurações</h2><div className="mt-2">
        {configLinks.map(link => <NavLink key={link.to} to={link.to} className="settings-row"><div className="min-w-0"><p className="font-semibold">{link.label}</p><p className="mt-1 text-sm text-muted">{link.description}</p></div><ChevronRight className="text-muted shrink-0" size={20}/></NavLink>)}
        <NavLink to="/accounts" className="settings-row"><div className="min-w-0"><p className="font-semibold">Contas e carteiras</p><p className="mt-1 text-sm text-muted">Gerencie saldos, contas ativas e arquivadas.</p></div><ChevronRight className="text-muted shrink-0" size={20}/></NavLink>
      </div></Card>
    </div>
  </>
}

export function NavigationSettings() {
  const { navShortcuts, setNavShortcuts } = useFinanceStore()
  const [draft, setDraft] = useState<string[]>(navShortcuts ?? DEFAULT_SHORTCUTS)
  const navigate = useNavigate()
  const toggle = (to: string) => setDraft(current => current.includes(to) ? current.filter(item => item !== to) : current.length >= MAX_SHORTCUTS ? current : [...current, to])
  const valid = draft.length === MAX_SHORTCUTS
  return <>
    <PageTitle eyebrow="Configurações" title="Navegação"/>
    <Card>
      <h2 className="section-title">Atalhos da barra inferior</h2>
      <p className="mt-1 text-sm text-muted">Escolha {MAX_SHORTCUTS} destinos para acompanhar Início e Perfil. O botão + permanece fixo.</p>
      <div className="mt-4 space-y-2">
        {NAV_DESTINATIONS.map(destination => {
          const selected = draft.includes(destination.to)
          return <button key={destination.to} type="button" onClick={() => toggle(destination.to)} aria-pressed={selected} className={`settings-row w-full rounded-xl text-left ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <div className="flex min-w-0 items-center gap-3"><CategoryIcon icon={destination.icon} size={18}/><span className="truncate font-semibold">{destination.label}</span></div>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-brand bg-brand text-white' : 'border-slate-300 text-transparent'}`}><Check size={14} strokeWidth={3}/></span>
          </button>
        })}
      </div>
      <p className={`mt-3 text-xs font-medium ${valid ? 'text-emerald-600' : 'text-amber-600'}`}>{draft.length} de {MAX_SHORTCUTS} selecionados{!valid ? ` — escolha ${MAX_SHORTCUTS} destinos` : ''}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" className="btn-secondary" onClick={() => { setNavShortcuts(DEFAULT_SHORTCUTS); setDraft([...DEFAULT_SHORTCUTS]) }}>Restaurar padrão</button>
        <button type="button" className="btn-primary disabled:opacity-40" disabled={!valid} onClick={() => { if (!valid) return; setNavShortcuts(draft); navigate('/settings') }}>Salvar</button>
      </div>
    </Card>
  </>
}

export function FinanceSettings() {
  const { safetyMarginPercent, setSafetyMarginPercent, forecastRealistic, setForecastRealistic } = useFinanceStore()
  return <>
    <PageTitle eyebrow="Configurações" title="Financeiro"/>
    <div className="space-y-5">
      <Card>
        <h2 className="section-title">Quanto posso gastar hoje?</h2>
        <p className="mt-1 text-sm text-muted">A margem protege parte do dinheiro livre mesmo quando você gasta.</p>
        <div className="mt-4"><span className="label">Margem de segurança</span><SelectMenu ariaLabel="Margem de segurança" value={String(safetyMarginPercent)} onChange={value => setSafetyMarginPercent(Number(value))} options={[0, 5, 10, 15, 20, 30].map(value => ({ value: String(value), label: `${value}%` }))}/><p className="mt-2 text-xs text-muted">Com R$ 1.000 livres e 10%, R$ 900 distribuíveis e R$ 100 protegidos.</p></div>
      </Card>
      <Card>
        <h2 className="section-title">Previsão de saldo</h2>
        <button onClick={() => setForecastRealistic(!forecastRealistic)} className="settings-row"><div className="min-w-0"><p className="font-semibold">Modo realista</p><p className="mt-1 text-sm text-muted">{forecastRealistic ? 'Recorrentes + média variável (90 dias)' : 'Só recorrentes (contas fixas)'}</p></div><span className={`toggle shrink-0 ${forecastRealistic ? 'active' : ''}`}><span/></span></button>
        <NavLink to="/forecast" className="settings-row"><div className="min-w-0"><p className="font-semibold">Ver previsão detalhada</p><p className="mt-1 text-sm text-muted">Gráfico, saldo mínimo e detalhe por dia.</p></div><ChevronRight className="text-muted shrink-0" size={20}/></NavLink>
      </Card>
    </div>
  </>
}

const priorityLabels: Record<string, string> = { overdue: 'Contas vencidas', essential: 'Contas essenciais', bills: 'Obrigações recorrentes', food: 'Alimentação', transport: 'Transporte', goals: 'Metas prioritárias', reserve: 'Reserva financeira', leisure: 'Lazer', free: 'Livre' }

export function PaymentSettings() {
  const { paymentAllocationPriority, setPaymentAllocationPriority, paymentAllocationPreferences, addPaymentAllocationPreference, removePaymentAllocationPreference } = useFinanceStore() as any
  const [newPref, setNewPref] = useState('')
  return <>
    <PageTitle eyebrow="Configurações" title="Pagamento"/>
    <div className="space-y-5">
      <Card>
        <h2 className="section-title">Organizar meu pagamento</h2>
        <p className="mt-1 text-sm text-muted">Prioridades configuráveis. O motor respeita esta ordem ao propor reservas.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{(paymentAllocationPriority ?? []).map((priority: string, index: number) => <span key={priority} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{index + 1}. {priorityLabels[priority] ?? priority}</span>)}</div>
        <button className="btn-secondary mt-3 text-xs" onClick={() => setPaymentAllocationPriority(['overdue', 'essential', 'bills', 'food', 'transport', 'goals', 'reserve', 'leisure', 'free'])}>Restaurar padrão</button>
      </Card>
      <Card>
        <h2 className="section-title">Aprendizado de preferências</h2>
        <p className="mt-1 text-sm text-muted">Registre regras explícitas como "Todo salário guarda 10%" ou "Sempre separa R$ 600 para alimentação". Nunca inferimos regra sem autorização.</p>
        <div className="mt-3 flex gap-2"><input className="field flex-1" placeholder="Ex: Todo salário guarda 10%" value={newPref} onChange={event => setNewPref(event.target.value)}/><button className="btn-primary !px-3" onClick={() => { if (newPref.trim()) { addPaymentAllocationPreference(newPref.trim()); setNewPref('') } }}>Salvar</button></div>
        {(paymentAllocationPreferences ?? []).length > 0 ? <div className="mt-3 space-y-2">{(paymentAllocationPreferences as any[]).map((preference: any) => <div key={preference.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>{preference.rule}</span><button className="text-xs font-semibold text-red-600" onClick={() => removePaymentAllocationPreference(preference.id)}>Remover</button></div>)}</div> : <p className="mt-3 text-xs text-muted">Nenhuma preferência salva.</p>}
      </Card>
    </div>
  </>
}

export function AppearanceSettings() {
  const { theme, setTheme } = useFinanceStore() as { theme: Theme; setTheme: (t: Theme) => void }
  const current: Theme = theme ?? 'system'
  const options: Array<{ value: Theme; label: string; desc: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Claro', desc: 'Fundo claro, ideal para dia.', icon: Sun },
    { value: 'dark', label: 'Escuro', desc: 'Fundo escuro, confortável à noite.', icon: Moon },
    { value: 'system', label: 'Sistema', desc: 'Segue o ajuste do aparelho.', icon: Laptop },
  ]
  return <>
    <PageTitle eyebrow="Configurações" title="Aparência"/>
    <div className="space-y-5">
      <Card>
        <h2 className="section-title">Tema</h2>
        <p className="mt-1 text-sm text-muted">Escolha como o Atlas deve exibir cores.</p>
        <div className="mt-4">
          <SelectMenu ariaLabel="Tema" value={current} onChange={v => setTheme(v as Theme)} options={options.map(o => ({ value: o.value, label: o.label }))} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {options.map(opt => {
            const Icon = opt.icon
            const active = current === opt.value
            return <button key={opt.value} type="button" onClick={() => setTheme(opt.value)} aria-pressed={active} className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition ${active ? 'border-brand bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}><Icon size={20}/></span>
              <span className={`text-sm font-semibold ${active ? 'text-brand' : 'text-ink'}`}>{opt.label}</span>
              <span className="text-xs leading-4 text-muted">{opt.desc}</span>
            </button>
          })}
        </div>
        <div className="mt-5 rounded-xl border bg-slate-50 p-4">
          <p className="text-xs font-semibold text-muted">Prévia</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-3 shadow-sm border"><p className="text-sm font-semibold text-ink">Cartão exemplo</p><p className="mt-1 text-xs text-muted">O tema se aplica a todos os cards e superfícies.</p></div>
            <div className="rounded-xl bg-slate-900 p-3"><p className="text-sm font-semibold text-white">Cartão escuro</p><p className="mt-1 text-xs text-slate-400">No modo sistema, muda com o aparelho.</p></div>
          </div>
        </div>
      </Card>
    </div>
  </>
}

const homeVisualOptions: Array<{ value: HomeVisual; label: string; desc: string; icon: typeof Wallet }> = [
  { value: 'adaptive', label: 'Adaptativa (nova)', desc: 'Muda sozinha: fim de mês, início após pagamento, uso do dia.', icon: Zap },
  { value: 'daily', label: 'Dia a dia', desc: 'Foco no hoje: gasto do dia e próximos vencimentos.', icon: CalendarClock },
  { value: 'planning', label: 'Planejamento', desc: 'Gráficos, orçamento e previsão.', icon: ChartPie },
  { value: 'balanced', label: 'Clássica', desc: 'Versão clássica: saldo, resumo e sugestões como antes.', icon: Wallet },
  { value: 'custom', label: 'Personalizado', desc: 'Escolha só os cards de sugestão que deseja ver.', icon: SlidersHorizontal },
]

const HOME_CARD_OPTIONS: Array<{ id: string; label: string; desc: string; icon: typeof Wallet }> = [
  { id: 'dailySpend', label: 'Gasto do dia', desc: 'Limite diário e progresso', icon: CalendarClock },
  { id: 'freeMoney', label: 'Dinheiro livre', desc: 'Quanto posso gastar', icon: PiggyBank },
  { id: 'payment', label: 'Organizar pagamento', desc: 'Distribuição de recebimentos', icon: Wallet },
  { id: 'recurring', label: 'Gastos recorrentes', desc: 'Próximos vencimentos', icon: CalendarClock },
  { id: 'forecast', label: 'Previsão de saldo', desc: 'Simulação 30 dias', icon: ChartPie },
  { id: 'chart', label: 'Gráfico despesas', desc: 'Últimos 6 meses', icon: ChartPie },
  { id: 'budget', label: 'Orçamento', desc: 'Limites por categoria', icon: PiggyBank },
  { id: 'recent', label: 'Transações recentes', desc: 'Últimas movimentações', icon: Wallet },
]

function HomePreview({ visual }: { visual: HomeVisual }) {
  const data = useFinanceStore(state => state as unknown as import('./domain').FinanceData)
  const adaptiveIds = visual === 'adaptive' ? getAdaptiveSuggestionIds(data) : null
  const cardMap: Record<HomeVisual, string[]> = {
    daily: ['dailySpend', 'recurring', 'freeMoney'],
    planning: ['chart', 'budget', 'forecast'],
    balanced: ['chart', 'budget', 'recent'],
    custom: ['dailySpend', 'freeMoney', 'chart'],
    adaptive: adaptiveIds ?? ['dailySpend', 'freeMoney', 'recurring'],
  }
  const ids = cardMap[visual] ?? cardMap.balanced
  return <div className="grid grid-cols-3 gap-2">
    {ids.map(id => {
      const opt = HOME_CARD_OPTIONS.find(o => o.id === id)
      const Icon = opt?.icon ?? Wallet
      return <div key={id} className="rounded-xl border bg-white p-2 text-center dark:bg-slate-800 dark:border-slate-700">
        <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-brand dark:bg-blue-950/30"><Icon size={14}/></span>
        <p className="mt-1.5 text-[10px] font-semibold leading-3 text-ink line-clamp-2">{opt?.label ?? id}</p>
      </div>
    })}
  </div>
}

export function HomeSettings() {
  const { homeVisual, setHomeVisual, homeCards, setHomeCards } = useFinanceStore() as { homeVisual: HomeVisual; setHomeVisual: (v: HomeVisual) => void; homeCards: string[]; setHomeCards: (c: string[]) => void }
  const current: HomeVisual = homeVisual ?? 'balanced'
  const toggleCard = (id: string) => {
    const has = (homeCards ?? []).includes(id)
    const next = has ? (homeCards ?? []).filter(c => c !== id) : [...(homeCards ?? []), id]
    setHomeCards(next)
    if (current !== 'custom') setHomeVisual('custom')
  }
  return <>
    <PageTitle eyebrow="Configurações" title="Tela inicial"/>
    <div className="space-y-5">
      <Card>
        <h2 className="section-title">Estilo da tela inicial</h2>
        <p className="mt-1 text-sm text-muted">Escolha como a sua tela de início deve parecer. Veja a prévia abaixo.</p>
        <div className="mt-4">
          <SelectMenu ariaLabel="Estilo da tela inicial" value={current} onChange={v => setHomeVisual(v as HomeVisual)} options={homeVisualOptions.map(o => ({ value: o.value, label: o.label }))} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {homeVisualOptions.map(opt => {
            const Icon = opt.icon
            const active = current === opt.value
            return <button key={opt.value} type="button" onClick={() => setHomeVisual(opt.value)} aria-pressed={active} className={`flex gap-3 rounded-2xl border-2 p-4 text-left transition ${active ? 'border-brand bg-blue-50/60 dark:bg-blue-950/30' : 'border-slate-200 bg-white hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700'}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}><Icon size={20}/></span>
              <span className="min-w-0 flex-1"><span className={`block text-sm font-semibold ${active ? 'text-brand' : 'text-ink'}`}>{opt.label}</span><span className="mt-1 block text-xs leading-4 text-muted line-clamp-2">{opt.desc}</span></span>
            </button>
          })}
        </div>
        <div className="mt-5 rounded-xl border bg-slate-50 p-4 dark:bg-slate-800/50 dark:border-slate-700">
          <p className="text-xs font-semibold text-muted">Prévia</p>
          <p className="mt-1 text-xs text-muted">Como seus cards aparecerão na tela inicial.</p>
          <div className="mt-3 rounded-xl border bg-canvas p-3 dark:border-slate-700">
            <HomePreview visual={current} />
          </div>
        </div>
      </Card>
      {current === 'custom' && <Card>
        <h2 className="section-title">Cards personalizados</h2>
        <p className="mt-1 text-sm text-muted">Escolha os cards de sugestões do dia que você quer ver.</p>
        <div className="mt-4 space-y-2">
          {HOME_CARD_OPTIONS.map(opt => {
            const selected = (homeCards ?? []).includes(opt.id)
            const Icon = opt.icon
            return <button key={opt.id} type="button" onClick={() => toggleCard(opt.id)} aria-pressed={selected} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selected ? 'border-brand bg-blue-50/50 dark:bg-blue-950/30' : 'border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700'}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${selected ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}><Icon size={18}/></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{opt.label}</span><span className="block text-xs text-muted">{opt.desc}</span></span>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-brand bg-brand text-white' : 'border-slate-300 text-transparent'}`}><Check size={14} strokeWidth={3}/></span>
            </button>
          })}
        </div>
        {(homeCards ?? []).length === 0 && <p className="mt-3 text-xs text-amber-600">Selecione ao menos um card, ou volte para um estilo predefinido.</p>}
      </Card>}
    </div>
  </>
}

export function PrivacySettings() {
  const { hideBalances, toggleBalances, deleteAllData, restoreBackup } = useFinanceStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')
  const [pendingRestore, setPendingRestore] = useState<{ data: FinanceData; summary: BackupSummary } | null>(null)
  const [restoredAt, setRestoredAt] = useState('')

  const exportBackup = () => {
    const snapshot = currentSnapshot()
    const payload = { app: 'atlas-finance', schemaVersion: 1, exportedAt: new Date().toISOString(), data: snapshot }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `atlas-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (file: File | undefined) => {
    setImportError('')
    if (!file) return
    try {
      const parsedJson = JSON.parse(await file.text())
      const parsed = BackupFileSchema.safeParse(parsedJson)
      if (!parsed.success) {
        setImportError('Arquivo de backup inválido — verifique se você escolheu um arquivo exportado pelo Atlas.')
        return
      }
      setPendingRestore({ data: parsed.data.data as unknown as FinanceData, summary: summarizeBackup(parsed.data.data) })
    } catch {
      setImportError('Não foi possível ler o arquivo. Ele é um JSON válido?')
    }
  }

  return <>
    <PageTitle eyebrow="Configurações" title="Privacidade e dados"/>
    <div className="space-y-5">
      <Card>
        <h2 className="section-title">Privacidade</h2>
        <button onClick={toggleBalances} className="settings-row"><div className="min-w-0"><p className="font-semibold">Ocultar valores</p><p className="mt-1 text-sm text-muted">Esconde quantias em toda a interface.</p></div><span className={`toggle shrink-0 ${hideBalances ? 'active' : ''}`}><span/></span></button>
        <div className="settings-row"><div className="min-w-0"><p className="font-semibold">Persistência local</p><p className="mt-1 text-sm text-muted">Dados armazenados em IndexedDB neste navegador.</p></div><Check className="shrink-0 text-brand" size={20}/></div>
      </Card>
      <Card>
        <Download className="text-blue-500"/>
        <h2 className="mt-4 section-title">Backup e restauração</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Baixe um arquivo com todos os seus dados (contas, transações, recorrências, metas) e restaure em qualquer dispositivo.</p>
        <button className="btn-secondary mt-4 w-full" onClick={exportBackup}><Download size={18}/>Exportar backup (.json)</button>
        <button className="btn-secondary mt-3 w-full" onClick={()=> fileInputRef.current?.click()}><Upload size={18}/>Restaurar de um arquivo</button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={event => { void onImportFile(event.target.files?.[0]); event.target.value = '' }} aria-label="Selecionar arquivo de backup"/>
        {importError && <p className="mt-3 text-xs font-medium text-red-600">{importError}</p>}
        {restoredAt && <p className="mt-3 text-xs font-medium text-emerald-600">✓ Backup restaurado com sucesso ({new Date(restoredAt).toLocaleString('pt-BR')}).</p>}
      </Card>
      <Card>
        <Trash2 className="text-red-500"/>
        <h2 className="mt-4 section-title">Excluir todos os dados</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Apaga contas, transações, orçamentos, recorrências, metas e conversas do assistente armazenados neste navegador. Considere exportar um backup antes.</p>
        <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" onClick={() => setConfirmReset(true)}><Trash2 size={18}/>Excluir todos os dados</button>
      </Card>
    </div>
    {pendingRestore && (
      <Modal title="Restaurar backup?" close={()=> setPendingRestore(null)}>
        <p className="text-sm leading-6 text-muted">Todos os dados atuais serão substituídos pelo conteúdo do backup.</p>
        <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Contas</span><strong>{pendingRestore.summary.accounts}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Transações</span><strong>{pendingRestore.summary.transactions}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Recorrências</span><strong>{pendingRestore.summary.recurringExpenses}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Orçamentos</span><strong>{pendingRestore.summary.budgets}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Metas</span><strong>{pendingRestore.summary.goals}</strong></div>
          {pendingRestore.summary.exportedAt && <div className="flex justify-between pt-1 text-xs text-muted"><span>Exportado em</span><span>{new Date(pendingRestore.summary.exportedAt).toLocaleString('pt-BR')}</span></div>}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="btn-secondary" onClick={()=> setPendingRestore(null)}>Cancelar</button>
          <button className="btn-primary" onClick={()=> { restoreBackup(pendingRestore.data); setPendingRestore(null); setRestoredAt(new Date().toISOString()) }}>Restaurar</button>
        </div>
      </Modal>
    )}
    {confirmReset && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold">Excluir todos os dados?</h2><p className="mt-2 text-sm leading-6 text-muted">Todos os seus dados serão apagados permanentemente deste navegador. Esta ação não pode ser desfeita.</p><div className="mt-6 grid grid-cols-2 gap-3"><button className="btn-secondary" onClick={() => setConfirmReset(false)}>Cancelar</button><button className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" onClick={() => { deleteAllData(); setConfirmReset(false) }}>Excluir tudo</button></div></div></div>}
  </>
}
