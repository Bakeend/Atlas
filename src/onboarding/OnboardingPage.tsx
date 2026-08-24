import { Check, FileUp, Sparkles, Wallet } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccountModal, DatePicker, Field, MoneyInput } from '../components'
import type { OnboardingCompletionInput } from '../domain'
import { parseMoney, today, uid } from '../domain'
import { waitForPersist, useFinanceStore } from '../store'
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft, type OnboardingDraft } from './draft'
import {
  DIFFICULTIES_STEP_FEEDBACK, DIFFICULTY_OPTIONS, GOAL_LABELS, GOAL_OPTIONS, INCOME_OPTIONS,
  LEVEL_LABELS, LEVEL_OPTIONS, PRIORITIES_STEP_FEEDBACK, PRIORITY_OPTIONS, type FeedbackText,
} from './onboardingConfig'
import { buildFinancialProfile, sanitizeFinancialProfile } from './onboardingProfile'
import { OnboardingChoiceCard } from './OnboardingChoiceCard'
import { OnboardingShell } from './OnboardingShell'

const PROGRESS_TOTAL = 7
const COMPLETE_STEP = 8
const EXIT_MS = 210
const MAX_DIFFICULTIES = 2
const MAX_PRIORITIES = 3

// Háptico curto apenas em seleção/conclusão — sem dependência nova (spec §38).
function triggerHaptic() {
  try { navigator.vibrate?.(10) } catch {}
}

function draftFromStoredProfile(profileName: string, profile: ReturnType<typeof sanitizeFinancialProfile>): OnboardingDraft {
  return {
    version: 1,
    step: 1,
    profileName,
    primaryGoal: profile?.primaryGoal,
    incomePattern: profile?.incomePattern,
    difficulties: profile?.difficulties ?? [],
    priorities: profile?.priorities ?? [],
    organizationLevel: profile?.organizationLevel,
  }
}

export function OnboardingPage({ mode = 'first' }: { mode?: 'first' | 'edit' }) {
  const navigate = useNavigate()
  const accounts = useFinanceStore(state => state.accounts)
  const saveRecurringIncome = useFinanceStore(state => state.saveRecurringIncome)
  const completeOnboarding = useFinanceStore(state => state.completeOnboarding)
  const storedProfileName = useFinanceStore(state => state.profileName)
  const storedProfile = useFinanceStore(state => state.financialProfile)

  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    if (mode === 'edit') return draftFromStoredProfile(storedProfileName ?? '', sanitizeFinancialProfile(storedProfile))
    const restored = loadOnboardingDraft()
    return { ...restored, step: Math.min(restored.step, COMPLETE_STEP - 1) }
  })
  const [nav, setNav] = useState<{ from: number; to: number; dir: 'forward' | 'back' } | null>(null)
  const [lastDir, setLastDir] = useState<'forward' | 'back'>('forward')
  const [feedback, setFeedback] = useState<FeedbackText | null>(null)
  const [limitHint, setLimitHint] = useState('')
  const [shakeValue, setShakeValue] = useState('')
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [setupView, setSetupView] = useState<'menu' | 'account' | 'income'>('menu')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeDate, setIncomeDate] = useState(today())
  const [setupError, setSetupError] = useState('')
  const [saveError, setSaveError] = useState(false)
  const pendingInput = useRef<OnboardingCompletionInput | undefined>(undefined)
  const finishedRef = useRef(false)
  const feedbackTimer = useRef<number>(undefined)
  const hintTimer = useRef<number>(undefined)

  // Rascunho vai para o localStorage a cada mudança — restaurável se o app fechar no meio (spec §47).
  useEffect(() => { if (!finishedRef.current) saveOnboardingDraft(draft) }, [draft])

  useEffect(() => {
    if (!nav) return
    const timer = window.setTimeout(() => { setStep(nav.to); setNav(null); window.scrollTo(0, 0) }, EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [nav])

  useEffect(() => () => { window.clearTimeout(feedbackTimer.current); window.clearTimeout(hintTimer.current) }, [])

  const step = draft.step
  const busy = nav !== null || feedback !== null
  const effectiveStep = nav?.to ?? step

  const setStep = (next: number) => setDraft(current => ({ ...current, step: next }))
  const patch = (partial: Partial<OnboardingDraft>) => setDraft(current => ({ ...current, ...partial }))

  const go = (to: number, dir: 'forward' | 'back' = 'forward') => {
    if (busy || finishedRef.current || to === step || to < 0 || to > COMPLETE_STEP - 1) return
    setLastDir(dir)
    setNav({ from: step, to, dir })
  }

  const back = () => {
    if (busy) return
    if (mode === 'edit' && step <= 1) { navigate('/profile'); return }
    if (step <= 1) { go(0, 'back'); return }
    go(step - 1, 'back')
  }

  const flashLimit = (value: string, message: string) => {
    triggerHaptic()
    setShakeValue(value)
    setLimitHint(message)
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => { setShakeValue(''); setLimitHint('') }, 1600)
  }

  const buildCompletionInput = (): OnboardingCompletionInput => ({
    profileName: draft.profileName,
    financialProfile: draft.primaryGoal ? buildFinancialProfile({
      primaryGoal: draft.primaryGoal,
      incomePattern: draft.incomePattern ?? 'unknown',
      difficulties: draft.difficulties,
      priorities: draft.priorities,
      organizationLevel: draft.organizationLevel ?? 'guided',
    }) : undefined,
  })

  // Persistência única via store; draft só é limpo depois do sucesso confirmado (ajuste nº 3).
  const finalize = async (input: OnboardingCompletionInput): Promise<boolean> => {
    pendingInput.current = input
    setSaveError(false)
    try {
      completeOnboarding(input)
      await waitForPersist()
      finishedRef.current = true
      clearOnboardingDraft()
      return true
    } catch {
      setSaveError(true)
      return false
    }
  }

  const retryFinalize = async () => {
    if (!pendingInput.current) return
    const ok = await finalize(pendingInput.current)
    if (ok && mode === 'edit') navigate('/')
  }

  const enterAtlas = async () => {
    triggerHaptic()
    const ok = await finalize(buildCompletionInput())
    if (ok && mode === 'edit') navigate('/')
  }

  const skipEverything = async () => {
    const ok = await finalize({})
    if (ok && mode === 'edit') navigate('/')
  }

  const chooseImport = async () => {
    const ok = await finalize(buildCompletionInput())
    if (ok) navigate('/import')
  }

  const finishSetupAndContinue = async () => {
    setStep(COMPLETE_STEP)
  }

  const saveIncome = async () => {
    const cents = parseMoney(incomeAmount)
    if (cents <= 0) { setSetupError('Informe o valor do recebimento.'); return }
    if (!accounts.length) { setSetupError('Crie uma conta antes de registrar o recebimento.'); return }
    saveRecurringIncome({
      id: uid(), name: 'Salário', amountInCents: cents, category: 'Salário',
      accountId: accounts[0].id, frequency: 'monthly' as const,
      startDate: incomeDate, isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    setSetupError('')
    finishSetupAndContinue()
  }

  const toggleDifficulties = (value: string) => {
    if (busy) return
    const has = draft.difficulties.includes(value)
    if (has) patch({ difficulties: draft.difficulties.filter(item => item !== value) })
    else if (draft.difficulties.length >= MAX_DIFFICULTIES) flashLimit(value, `Escolha até ${MAX_DIFFICULTIES} dificuldades.`)
    else patch({ difficulties: [...draft.difficulties, value] })
  }

  const togglePriorities = (value: string) => {
    if (busy) return
    const has = draft.priorities.includes(value)
    if (has) patch({ priorities: draft.priorities.filter(item => item !== value) })
    else if (draft.priorities.length >= MAX_PRIORITIES) flashLimit(value, `Escolha até ${MAX_PRIORITIES} prioridades.`)
    else patch({ priorities: [...draft.priorities, value] })
  }

  const selectGoal = (value: string) => {
    if (busy) return
    patch({ primaryGoal: value as OnboardingDraft['primaryGoal'] })
  }

  const selectIncome = (value: string) => {
    if (busy) return
    patch({ incomePattern: value as OnboardingDraft['incomePattern'] })
  }

  const selectLevel = (value: string) => {
    if (busy) return
    patch({ organizationLevel: value as OnboardingDraft['organizationLevel'] })
  }

  // Feedback sempre no Continuar — nunca na seleção (não atrapalha a multisseleção).
  const continueFromQuestion = () => {
    if (busy) return
    const feedback =
      step === 1 ? GOAL_OPTIONS.find(item => item.value === draft.primaryGoal)?.feedback
        : step === 2 ? INCOME_OPTIONS.find(item => item.value === draft.incomePattern)?.feedback
          : step === 3 ? DIFFICULTIES_STEP_FEEDBACK
            : step === 4 ? PRIORITIES_STEP_FEEDBACK
              : step === 5 ? LEVEL_OPTIONS.find(item => item.value === draft.organizationLevel)?.feedback
                : undefined
    if (!feedback) { go(step + 1); return }
    triggerHaptic()
    setFeedback(feedback)
    feedbackTimer.current = window.setTimeout(() => { setFeedback(null); go(step + 1) }, 950)
  }

  const firstName = draft.profileName.trim().split(/\s+/)[0]
  const hasName = Boolean(firstName)

  const contentFor = (stepIndex: number) => {
    switch (stepIndex) {
      case 0:
        return (
          <div className="onboarding-welcome">
            <span className="onboarding-logo" aria-hidden="true"><Sparkles size={30}/></span>
            <h1 className="onboarding-title">Seu dinheiro,<br/>do seu jeito.</h1>
            <p className="onboarding-subtitle">Responda algumas perguntas e o Atlas monta sua experiência.</p>
            <button type="button" className="btn-primary onboarding-welcome-cta" onClick={() => go(1)}>Começar</button>
            <p className="onboarding-note">Leva menos de 1 minuto</p>
            <button type="button" className="onboarding-skip-link" onClick={skipEverything}>Pular configuração</button>
          </div>
        )
      case 1:
        return (
          <>
            <h1 className="onboarding-title">O que você mais quer melhorar?</h1>
            <div className="onboarding-options">
              {GOAL_OPTIONS.map((option, index) => (
                <OnboardingChoiceCard key={option.value} option={option} index={index}
                  selected={draft.primaryGoal === option.value} onSelect={selectGoal}/>
              ))}
            </div>
          </>
        )
      case 2:
        return (
          <>
            <h1 className="onboarding-title">Como seu dinheiro costuma entrar?</h1>
            <div className="onboarding-options">
              {INCOME_OPTIONS.map((option, index) => (
                <OnboardingChoiceCard key={option.value} option={option} index={index} disabled={busy}
                  selected={draft.incomePattern === option.value} onSelect={selectIncome}/>
              ))}
            </div>
          </>
        )
      case 3:
        return (
          <>
            <h1 className="onboarding-title">O que mais atrapalha hoje?</h1>
            <p className="onboarding-hint">Selecione de 1 a {MAX_DIFFICULTIES}</p>
            <div className="onboarding-options">
              {DIFFICULTY_OPTIONS.map((option, index) => (
                <OnboardingChoiceCard key={option.value} option={option} index={index} disabled={busy}
                  shake={shakeValue === option.value}
                  selected={draft.difficulties.includes(option.value)} onSelect={toggleDifficulties}/>
              ))}
            </div>
            {limitHint && <p className="onboarding-limit-hint" role="status">{limitHint}</p>}
          </>
        )
      case 4: {
        const count = Math.min(draft.priorities.length, MAX_PRIORITIES)
        return (
          <>
            <h1 className="onboarding-title">O que é mais importante proteger?</h1>
            <p className={`onboarding-hint ${count === MAX_PRIORITIES ? 'complete' : ''}`} role="status">
              {count === 0 ? `Selecione de 1 a ${MAX_PRIORITIES}` : `${count} de ${MAX_PRIORITIES} selecionados`}
            </p>
            <div className="onboarding-options">
              {PRIORITY_OPTIONS.map((option, index) => (
                <OnboardingChoiceCard key={option.value} option={option} index={index} disabled={busy}
                  shake={shakeValue === option.value}
                  selected={draft.priorities.includes(option.value)} onSelect={togglePriorities}/>
              ))}
            </div>
            {limitHint && <p className="onboarding-limit-hint" role="status">{limitHint}</p>}
          </>
        )
      }
      case 5:
        return (
          <>
            <h1 className="onboarding-title">Como você quer que o Atlas te ajude?</h1>
            <div className="onboarding-options">
              {LEVEL_OPTIONS.map((option, index) => (
                <OnboardingChoiceCard key={option.value} index={index} disabled={busy}
                  option={{ value: option.value, label: option.subtitle, description: option.description, icon: option.icon }}
                  selected={draft.organizationLevel === option.value}
                  onSelect={selectLevel}/>
              ))}
            </div>
          </>
        )
      case 6:
        return (
          <>
            <div className="onboarding-avatar" aria-hidden="true">
              <span key={hasName ? 'named' : 'anon'} className="onboarding-greeting">{hasName ? `Olá, ${firstName}` : 'Olá!'}</span>
            </div>
            <h1 className="onboarding-title">Como podemos chamar você?</h1>
            <div className="mt-5">
              <Field label="Seu nome">
                <input className="field" value={draft.profileName} maxLength={40}
                  placeholder="Ex.: Claudio" aria-label="Seu nome"
                  onChange={event => patch({ profileName: event.target.value })}/>
              </Field>
            </div>
          </>
        )
      case 7:
        if (setupView === 'account') {
          return (
            <>
              <h1 className="onboarding-title">Sua primeira conta</h1>
              <p className="onboarding-hint">Conta bancária, carteira ou dinheiro vivo.</p>
              {accounts.length ? (
                <div className="onboarding-success-row"><Check size={17}/> Conta criada com sucesso.</div>
              ) : (
                <button type="button" className="btn-secondary mt-5 w-full" onClick={() => setShowAccountModal(true)}>
                  <Wallet size={18}/> Criar conta
                </button>
              )}
            </>
          )
        }
        if (setupView === 'income') {
          return (
            <>
              <h1 className="onboarding-title">Quando costuma receber?</h1>
              <div className="mt-5 space-y-4">
                <Field label="Valor">
                  <MoneyInput ariaLabel="Valor do recebimento" value={incomeAmount} onChange={setIncomeAmount}/>
                </Field>
                <Field label="Data">
                  <DatePicker ariaLabel="Data do recebimento" value={incomeDate} onChange={setIncomeDate}/>
                </Field>
                {setupError && <p className="text-xs font-medium text-red-600" role="alert">{setupError}</p>}
              </div>
            </>
          )
        }
        return (
          <>
            <h1 className="onboarding-title">Vamos dar contexto ao Atlas?</h1>
            <p className="onboarding-hint">Você pode fazer isso depois — nada aqui é obrigatório.</p>
            <div className="onboarding-options">
              <button type="button" className="onboarding-card" style={{ '--delay': '0ms' } as CSSProperties} onClick={() => setSetupView('account')}>
                <span className="onboarding-card-icon" aria-hidden="true"><Wallet size={20} strokeWidth={1.9}/></span>
                <span className="onboarding-card-body"><strong>Adicionar minha primeira conta</strong></span>
              </button>
              <button type="button" className="onboarding-card" style={{ '--delay': '45ms' } as CSSProperties} onClick={chooseImport}>
                <span className="onboarding-card-icon" aria-hidden="true"><FileUp size={20} strokeWidth={1.9}/></span>
                <span className="onboarding-card-body"><strong>Importar meu extrato</strong></span>
              </button>
              <button type="button" className="onboarding-card" style={{ '--delay': '90ms' } as CSSProperties} onClick={finishSetupAndContinue}>
                <span className="onboarding-card-icon" aria-hidden="true"><Check size={20} strokeWidth={1.9}/></span>
                <span className="onboarding-card-body"><strong>Fazer isso depois</strong></span>
              </button>
            </div>
          </>
        )
      default:
        return (
          <div className="onboarding-complete">
            <span className="onboarding-logo pop" aria-hidden="true"><Check size={30} strokeWidth={2.4}/></span>
            <h1 className="onboarding-title">Seu Atlas está pronto</h1>
            {[['Objetivo', draft.primaryGoal ? GOAL_LABELS[draft.primaryGoal] : 'Acompanhar finanças'],
              ['Prioridades', draft.priorities.length ? draft.priorities.join(' · ') : 'Você escolhe depois'],
              ['Estilo', LEVEL_LABELS[draft.organizationLevel ?? 'guided']],
            ].map(([label, value], index) => (
              <div key={label} className="onboarding-complete-item" style={{ '--delay': `${120 + index * 90}ms` } as CSSProperties}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
            {saveError && (
              <div className="onboarding-error" role="alert">
                <p>Não conseguimos salvar sua configuração.</p>
                <small>Seus dados não foram perdidos.</small>
                <button type="button" className="btn-primary mt-3 w-full" onClick={retryFinalize}>Tentar novamente</button>
              </div>
            )}
            {!saveError && (
              <button type="button" className="btn-primary onboarding-complete-cta" onClick={enterAtlas}>Entrar no Atlas</button>
            )}
          </div>
        )
    }
  }

  const footerFor = (stepIndex: number) => {
    if (stepIndex === 0 || stepIndex >= COMPLETE_STEP) return undefined
    if (stepIndex === 7) {
      if (setupView === 'income') {
        return (
          <>
            <button type="button" className="btn-primary onboarding-cta w-full" disabled={busy} onClick={saveIncome}>Salvar recebimento</button>
            <button type="button" className="onboarding-skip-link" onClick={finishSetupAndContinue}>Pular por enquanto</button>
          </>
        )
      }
      return (
        <>
          <button type="button" className="btn-primary onboarding-cta w-full" disabled={!accounts.length || busy} onClick={finishSetupAndContinue}>Continuar</button>
          {!accounts.length && <button type="button" className="onboarding-skip-link" onClick={finishSetupAndContinue}>Pular por enquanto</button>}
        </>
      )
    }
    // Perguntas (1–6): resposta obrigatória libera o Continuar; feedback aparece só no clique.
    const continueDisabled =
      busy ||
      (stepIndex === 1 && !draft.primaryGoal) ||
      (stepIndex === 2 && !draft.incomePattern) ||
      (stepIndex === 3 && draft.difficulties.length === 0) ||
      (stepIndex === 4 && draft.priorities.length === 0) ||
      (stepIndex === 5 && !draft.organizationLevel)
    return (
      <>
        <button type="button" className="btn-primary onboarding-cta w-full" disabled={continueDisabled} onClick={continueFromQuestion}>Continuar</button>
        {stepIndex === 6 && <button type="button" className="onboarding-skip-link" onClick={finishSetupAndContinue}>Pular esta etapa</button>}
      </>
    )
  }

  return (
    <>
      <OnboardingShell
        step={Math.min(effectiveStep, PROGRESS_TOTAL)}
        total={PROGRESS_TOTAL}
        showChrome={effectiveStep >= 1 && effectiveStep <= PROGRESS_TOTAL}
        canGoBack={!busy && (mode === 'edit' || step >= 1)}
        onBack={back}
        footer={footerFor(effectiveStep)}
      >
        {/* A camada atual assume a chave do DESTINO já no clique e mantém a classe de entrada após o commit:
            nenhuma remontagem nem troca de classe interrompe as animações internas (causa das piscadas). */}
        <div key={`cur-${nav ? nav.to : step}`} className={`onboarding-layer on-enter-${nav ? nav.dir : lastDir}`}>
          {contentFor(nav ? nav.to : step)}
        </div>
        {nav && (
          <div key={`out-${nav.from}-${nav.to}-${nav.dir}`} className={`onboarding-layer onboarding-layer-leaving on-exit-${nav.dir}`} aria-hidden="true">
            {contentFor(nav.from)}
          </div>
        )}
      </OnboardingShell>
      {showAccountModal && (
        <AccountModal close={() => {
          setShowAccountModal(false)
          if (accounts.length && draft.incomePattern === 'fixed') setSetupView('income')
        }}/>
      )}
      {feedback && (
        <div className="onboarding-feedback-overlay" role="status">
          <span className="onboarding-feedback-check" aria-hidden="true"><Check size={24} strokeWidth={2.4}/></span>
          <strong>{feedback.title}</strong>
          <p>{feedback.text}</p>
        </div>
      )}
    </>
  )
}
