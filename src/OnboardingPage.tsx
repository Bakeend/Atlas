import {
  ArrowLeft, ArrowUpDown, Check, ChevronRight, CreditCard, Landmark,
  PiggyBank, Receipt, ShieldCheck, Sparkles, Target, TrendingUp, UserRound, Wallet, ChartPie, type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Card, Field, MoneyInput, SelectMenu } from './components'
import { parseMoney, today, uid } from './domain'
import { useFinanceStore } from './store'

function nextIncomeDate(dueDay: number): string {
  const base = today()
  const year = Number(base.slice(0, 4))
  const month = Number(base.slice(5, 7))
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
  if (candidate >= base) return candidate
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
  return `${nextMonth}-${String(dueDay).padStart(2, '0')}`
}

type GoalKey = 'pay_debts' | 'save_money' | 'daily_limit' | 'dream_goal'
type AlertStyleKey = 'strict' | 'balanced' | 'flexible'
type NavPrefKey = 'ai' | 'planning' | 'fast'

interface BankOption {
  id: string
  name: string
  color: string
  type: 'checking' | 'cash'
  icon: LucideIcon
}

const BANK_OPTIONS: BankOption[] = [
  { id: 'nubank', name: 'Nubank', color: '#8A05BE', type: 'checking', icon: CreditCard },
  { id: 'itau', name: 'Itaú', color: '#EC7000', type: 'checking', icon: Landmark },
  { id: 'inter', name: 'Banco Inter', color: '#FF7A00', type: 'checking', icon: CreditCard },
  { id: 'bradesco', name: 'Bradesco', color: '#CC092F', type: 'checking', icon: Landmark },
  { id: 'santander', name: 'Santander', color: '#EC0000', type: 'checking', icon: Landmark },
  { id: 'cash', name: 'Carteira / Dinheiro', color: '#16A36A', type: 'cash', icon: Wallet },
  { id: 'other', name: 'Outro banco', color: '#2F80ED', type: 'checking', icon: Landmark },
]

const GOAL_OPTIONS: Array<{ key: GoalKey; title: string; subtitle: string; icon: LucideIcon; iconColor: string; iconBg: string }> = [
  {
    key: 'pay_debts',
    title: 'Preciso colocar minhas contas e boletos em dia',
    subtitle: 'Organizar pagamentos essenciais, evitar juros e sair do aperto.',
    icon: Receipt,
    iconColor: '#DC2626',
    iconBg: '#FEECEC',
  },
  {
    key: 'save_money',
    title: 'Quero economizar o máximo nos próximos meses',
    subtitle: 'Criar uma reserva de emergência e cortar gastos invisíveis.',
    icon: PiggyBank,
    iconColor: '#16A36A',
    iconBg: '#E5F8EF',
  },
  {
    key: 'daily_limit',
    title: 'Quero saber quanto posso gastar por dia sem passar aperto',
    subtitle: 'Ter clareza do limite diário seguro até o próximo pagamento.',
    icon: Wallet,
    iconColor: '#2F80ED',
    iconBg: '#E8F1FE',
  },
  {
    key: 'dream_goal',
    title: 'Estou guardando dinheiro para uma conquista específica',
    subtitle: 'Juntar para uma viagem, veículo, reforma ou projeto pessoal.',
    icon: Target,
    iconColor: '#9367E9',
    iconBg: '#F3EDFD',
  },
]

const ALERT_OPTIONS: Array<{ key: AlertStyleKey; title: string; subtitle: string; icon: LucideIcon; iconColor: string; iconBg: string }> = [
  {
    key: 'strict',
    title: 'Quero que me avise com antecedência antes de apertar o orçamento',
    subtitle: 'Margem de segurança de 20% retida nos cálculos e avisos preventivos.',
    icon: ShieldCheck,
    iconColor: '#2F80ED',
    iconBg: '#E8F1FE',
  },
  {
    key: 'balanced',
    title: 'Quero um equilíbrio saudável entre economizar e aproveitar',
    subtitle: 'Margem padrão de 10% para manter o ritmo sem travar pequenos momentos de lazer.',
    icon: Sparkles,
    iconColor: '#16A36A',
    iconBg: '#E5F8EF',
  },
  {
    key: 'flexible',
    title: 'Quero liberar o máximo de dinheiro possível para o dia a dia',
    subtitle: 'Margem mínima de 5% com foco em maximizar o dinheiro livre disponível.',
    icon: TrendingUp,
    iconColor: '#F2B323',
    iconBg: '#FEF8E8',
  },
]

const NAV_OPTIONS: Array<{ key: NavPrefKey; title: string; subtitle: string; icon: LucideIcon; iconColor: string; iconBg: string }> = [
  {
    key: 'ai',
    title: 'Quero falar ou digitar com a Assistente no dia a dia',
    subtitle: 'Atalho rápido para a IA e controle ágil de transações.',
    icon: Sparkles,
    iconColor: '#2F80ED',
    iconBg: '#E8F1FE',
  },
  {
    key: 'planning',
    title: 'Prefiro acompanhar gráficos de projeção e orçamento detalhado',
    subtitle: 'Atalhos diretos para Previsão e Orçamento mensal.',
    icon: ChartPie,
    iconColor: '#16A36A',
    iconBg: '#E5F8EF',
  },
  {
    key: 'fast',
    title: 'Quero praticidade para registrar e organizar movimentações',
    subtitle: 'Atalhos para Transações e painel de Organização.',
    icon: ArrowUpDown,
    iconColor: '#9367E9',
    iconBg: '#F3EDFD',
  },
]

const TOTAL_STEPS = 6

export function OnboardingPage() {
  const addAccount = useFinanceStore(state => state.addAccount)
  const saveRecurringIncome = useFinanceStore(state => state.saveRecurringIncome)
  const saveGoal = useFinanceStore(state => state.saveGoal)
  const setProfileName = useFinanceStore(state => state.setProfileName)
  const setSafetyMarginPercent = useFinanceStore(state => state.setSafetyMarginPercent)
  const setForecastRealistic = useFinanceStore(state => state.setForecastRealistic)
  const setPaymentAllocationPriority = useFinanceStore(state => state.setPaymentAllocationPriority)
  const setNavShortcuts = useFinanceStore(state => state.setNavShortcuts)
  const completeOnboarding = useFinanceStore(state => state.completeOnboarding)

  const [step, setStep] = useState(0)

  // Step 0: Profile Name
  const [name, setName] = useState('')

  // Step 1: Goal (começa sem seleção prévia)
  const [goalKey, setGoalKey] = useState<GoalKey | null>(null)

  // Step 2: Alert Style (começa sem seleção prévia)
  const [alertStyle, setAlertStyle] = useState<AlertStyleKey | null>(null)

  // Step 3: Account & Bank (começa sem seleção prévia)
  const [bankId, setBankId] = useState<string | null>(null)
  const [customBankName, setCustomBankName] = useState('')
  const [initialBalance, setInitialBalance] = useState('')

  // Step 4: Income
  const [salaryAmount, setSalaryAmount] = useState('')
  const [salaryDueDay, setSalaryDueDay] = useState('5')

  // Step 5: Navigation preference (começa sem seleção prévia)
  const [navPref, setNavPref] = useState<NavPrefKey | null>(null)

  const [error, setError] = useState('')

  const handleNextFromStep0 = () => {
    if (!name.trim()) {
      setError('Por favor, informe seu nome ou como prefere ser chamado.')
      return
    }
    setError('')
    setStep(1)
  }

  const isCurrentStepValid = () => {
    if (step === 0) return Boolean(name.trim())
    if (step === 1) return goalKey !== null
    if (step === 2) return alertStyle !== null
    if (step === 3) return bankId !== null && (bankId !== 'other' || Boolean(customBankName.trim()))
    if (step === 4) return parseMoney(salaryAmount) > 0
    if (step === 5) return navPref !== null
    return true
  }

  const finishAll = () => {
    const now = new Date().toISOString()
    const trimmedName = name.trim() || 'Usuário'
    setProfileName(trimmedName)

    // 1. Criar Conta Inicial
    const chosenBank = (bankId ? BANK_OPTIONS.find(b => b.id === bankId) : null) || BANK_OPTIONS[0]
    const accountName = bankId === 'other' ? (customBankName.trim() || 'Minha Conta') : chosenBank.name
    const accountId = uid()
    const initialBalanceCents = parseMoney(initialBalance)

    addAccount({
      id: accountId,
      name: accountName,
      type: chosenBank.type,
      initialBalanceCents,
      color: chosenBank.color,
      archived: false,
      createdAt: now,
    })

    // 2. Renda Recorrente
    const salaryCents = parseMoney(salaryAmount)
    if (salaryCents > 0) {
      saveRecurringIncome({
        id: uid(),
        name: 'Salário',
        amountInCents: salaryCents,
        category: 'Salário',
        accountId,
        frequency: 'monthly',
        dueDay: Number(salaryDueDay),
        startDate: nextIncomeDate(Number(salaryDueDay)),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
    }

    // 3. Estilo e Margem de Segurança
    if (alertStyle === 'strict') {
      setSafetyMarginPercent(20)
      useFinanceStore.getState().addPaymentAllocationPreference('Priorizar alertas preventivos de gastos e incentivar cautela no orçamento.')
    } else if (alertStyle === 'flexible') {
      setSafetyMarginPercent(5)
    } else {
      setSafetyMarginPercent(10)
    }
    setForecastRealistic(true)

    // 4. Metas / Prioridades baseadas no objetivo
    if (goalKey === 'save_money') {
      saveGoal({
        id: uid(),
        title: 'Reserva de Emergência',
        targetAmountInCents: salaryCents > 0 ? salaryCents * 3 : 600000,
        currentAmountInCents: 0,
        category: 'Reserva',
        createdAt: now,
        updatedAt: now,
      })
    } else if (goalKey === 'dream_goal') {
      saveGoal({
        id: uid(),
        title: 'Minha Conquista',
        targetAmountInCents: 500000,
        currentAmountInCents: 0,
        category: 'Conquista',
        createdAt: now,
        updatedAt: now,
      })
    } else if (goalKey === 'pay_debts') {
      setPaymentAllocationPriority(['overdue', 'essential', 'bills', 'food', 'transport', 'goals', 'reserve', 'leisure', 'free'])
    }

    // 5. Atalhos de Navegação
    if (navPref === 'planning') {
      setNavShortcuts(['/forecast', '/planning'])
    } else if (navPref === 'fast') {
      setNavShortcuts(['/transactions', '/organizar'])
    } else {
      setNavShortcuts(['/assistant', '/transactions'])
    }

    completeOnboarding()
  }

  const skip = () => {
    completeOnboarding()
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas p-4 sm:p-6">
      <div className="mx-auto w-full max-w-lg flex-1 flex flex-col justify-between py-2">
        {/* Header com Progresso estilo Duolingo */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-6">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
                aria-label="Voltar etapa anterior"
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <div className="w-9" />
            )}

            {/* Barra de Progresso Segmentada */}
            <div className="flex flex-1 items-center gap-1.5 px-1" aria-label={`Passo ${step + 1} de ${TOTAL_STEPS}`}>
              {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
                <div
                  key={index}
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    index < step
                      ? 'bg-brand'
                      : index === step
                      ? 'bg-brand shadow-sm shadow-brand/20'
                      : 'bg-slate-200/80'
                  }`}
                />
              ))}
            </div>

            <span className="text-xs font-bold tabular-nums text-muted min-w-[2.5rem] text-right">
              {step + 1}/{TOTAL_STEPS}
            </span>
          </div>

          {/* Conteúdo da Etapa */}
          <main className="space-y-4">
            {/* ETAPA 1: NOME */}
            {step === 0 && (
              <Card className="p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-brand">
                    <UserRound size={26} strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">Atlas Finance</p>
                    <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Como devemos te chamar?</h1>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Vamos personalizar suas saudações, relatórios e a conversa com sua assistente financeira.
                </p>
                <div className="mt-6">
                  <Field label="Seu nome ou apelido" error={error}>
                    <input
                      className="field !text-lg !font-medium"
                      value={name}
                      autoFocus
                      onChange={e => {
                        setName(e.target.value)
                        if (error) setError('')
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && name.trim()) handleNextFromStep0()
                      }}
                      placeholder="Ex.: Daniel"
                      maxLength={40}
                    />
                  </Field>
                </div>
              </Card>
            )}

            {/* ETAPA 2: OBJETIVO PRINCIPAL */}
            {step === 1 && (
              <div className="space-y-3">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">Seu Momento</p>
                  <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">O que você mais precisa resolver agora?</h1>
                  <p className="mt-1 text-sm text-muted">Selecione uma opção para adaptarmos as ferramentas certas.</p>
                </div>
                <div className="space-y-2.5">
                  {GOAL_OPTIONS.map(opt => {
                    const selected = goalKey === opt.key
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setGoalKey(opt.key)}
                        className={`group relative flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition-all ${
                          selected
                            ? 'border-brand bg-blue-50/50 shadow-sm'
                            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <span
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform group-active:scale-95"
                          style={{ color: opt.iconColor, backgroundColor: opt.iconBg }}
                        >
                          <Icon size={22} strokeWidth={2} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-base font-semibold leading-snug ${selected ? 'text-brand' : 'text-ink'}`}>
                            {opt.title}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted">{opt.subtitle}</p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <span
                            className={`grid h-6 w-6 place-items-center rounded-full border transition-all ${
                              selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {selected && <Check size={14} strokeWidth={2.6} />}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ETAPA 3: ESTILO DE ACOMPANHAMENTO */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">Postura & Alertas</p>
                  <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Como você quer que o Atlas te alerte?</h1>
                  <p className="mt-1 text-sm text-muted">Isso define a margem de segurança do seu gasto diário e a postura da IA.</p>
                </div>
                <div className="space-y-2.5">
                  {ALERT_OPTIONS.map(opt => {
                    const selected = alertStyle === opt.key
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setAlertStyle(opt.key)}
                        className={`group relative flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition-all ${
                          selected
                            ? 'border-brand bg-blue-50/50 shadow-sm'
                            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <span
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform group-active:scale-95"
                          style={{ color: opt.iconColor, backgroundColor: opt.iconBg }}
                        >
                          <Icon size={22} strokeWidth={2} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-base font-semibold leading-snug ${selected ? 'text-brand' : 'text-ink'}`}>
                            {opt.title}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted">{opt.subtitle}</p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <span
                            className={`grid h-6 w-6 place-items-center rounded-full border transition-all ${
                              selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {selected && <Check size={14} strokeWidth={2.6} />}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ETAPA 4: CONTA PRINCIPAL */}
            {step === 3 && (
              <Card className="p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <Landmark size={24} strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">Base Financeira</p>
                    <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Onde seu dinheiro está hoje?</h1>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">Escolha sua conta ou banco principal onde você movimenta seu saldo.</p>

                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {BANK_OPTIONS.map(bank => {
                    const selected = bankId === bank.id
                    const Icon = bank.icon
                    return (
                      <button
                        key={bank.id}
                        type="button"
                        onClick={() => setBankId(bank.id)}
                        className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center transition-all ${
                          selected
                            ? 'border-brand bg-blue-50/60 shadow-sm'
                            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm"
                          style={{ backgroundColor: bank.color }}
                        >
                          <Icon size={20} />
                        </span>
                        <span className={`text-xs font-semibold truncate max-w-full ${selected ? 'text-brand' : 'text-slate-700'}`}>
                          {bank.name}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {bankId === 'other' && (
                  <div className="mt-4">
                    <Field label="Nome da conta ou instituição">
                      <input
                        className="field"
                        value={customBankName}
                        onChange={e => setCustomBankName(e.target.value)}
                        placeholder="Ex.: C6 Bank, XP, etc."
                        maxLength={30}
                      />
                    </Field>
                  </div>
                )}

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <Field label="Saldo atual nesta conta (opcional)">
                    <MoneyInput
                      ariaLabel="Saldo atual"
                      value={initialBalance}
                      onChange={setInitialBalance}
                    />
                  </Field>
                </div>
              </Card>
            )}

            {/* ETAPA 5: RENDA PRINCIPAL */}
            {step === 4 && (
              <Card className="p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                    <Wallet size={24} strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">Fluxo de Caixa</p>
                    <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Quando o dinheiro entra?</h1>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Com o valor e o dia do seu recebimento, calculamos quanto você pode gastar por dia sem ficar no vermelho.
                </p>

                <div className="mt-6 space-y-4">
                  <Field label="Valor aproximado do recebimento (Salário / Renda)">
                    <MoneyInput
                      ariaLabel="Valor do recebimento"
                      value={salaryAmount}
                      onChange={setSalaryAmount}
                    />
                  </Field>

                  <Field label="Em qual dia do mês costuma cair?">
                    <SelectMenu
                      ariaLabel="Dia do recebimento"
                      value={salaryDueDay}
                      onChange={setSalaryDueDay}
                      options={Array.from({ length: 28 }, (_, index) => ({
                        value: String(index + 1),
                        label: `Dia ${index + 1} de cada mês`,
                      }))}
                    />
                  </Field>
                </div>
              </Card>
            )}

            {/* ETAPA 6: NAVEGAÇÃO & ASSISTENTE */}
            {step === 5 && (
              <div className="space-y-3">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">Experiência</p>
                  <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Como você prefere usar o aplicativo?</h1>
                  <p className="mt-1 text-sm text-muted">Personalize os atalhos rápidos da sua barra inferior.</p>
                </div>
                <div className="space-y-2.5">
                  {NAV_OPTIONS.map(opt => {
                    const selected = navPref === opt.key
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setNavPref(opt.key)}
                        className={`group relative flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition-all ${
                          selected
                            ? 'border-brand bg-blue-50/50 shadow-sm'
                            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <span
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform group-active:scale-95"
                          style={{ color: opt.iconColor, backgroundColor: opt.iconBg }}
                        >
                          <Icon size={22} strokeWidth={2} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-base font-semibold leading-snug ${selected ? 'text-brand' : 'text-ink'}`}>
                            {opt.title}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted">{opt.subtitle}</p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <span
                            className={`grid h-6 w-6 place-items-center rounded-full border transition-all ${
                              selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {selected && <Check size={14} strokeWidth={2.6} />}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Rodapé Fixo com Botão Continuar */}
        <div className="mt-8 pt-4 border-t border-slate-100">
          {step === 0 && (
            <button
              type="button"
              disabled={!isCurrentStepValid()}
              className="btn-primary w-full !py-3.5 !text-base shadow-lg shadow-brand/20 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              onClick={handleNextFromStep0}
            >
              Continuar <ChevronRight size={18} />
            </button>
          )}

          {step > 0 && step < TOTAL_STEPS - 1 && (
            <button
              type="button"
              disabled={!isCurrentStepValid()}
              className="btn-primary w-full !py-3.5 !text-base shadow-lg shadow-brand/20 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              onClick={() => setStep(s => s + 1)}
            >
              Continuar <ChevronRight size={18} />
            </button>
          )}

          {step === TOTAL_STEPS - 1 && (
            <button
              type="button"
              disabled={!isCurrentStepValid()}
              className="btn-primary w-full !py-3.5 !text-base shadow-lg shadow-brand/20 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              onClick={finishAll}
            >
              Concluir e Começar <Sparkles size={18} />
            </button>
          )}

          <button
            type="button"
            className="mt-3 w-full py-1 text-center text-xs font-semibold text-muted transition-colors hover:text-ink"
            onClick={skip}
          >
            Pular e configurar depois
          </button>
        </div>
      </div>
    </div>
  )
}


