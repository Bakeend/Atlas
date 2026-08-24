import { CalendarClock, ChevronRight, Sparkles, UserRound, Wallet } from 'lucide-react'
import { useState } from 'react'
import { AccountModal, Card, Field, MoneyInput, SelectMenu } from './components'
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

export function OnboardingPage() {
  const accounts = useFinanceStore(state => state.accounts)
  const saveRecurringIncome = useFinanceStore(state => state.saveRecurringIncome)
  const setProfileName = useFinanceStore(state => state.setProfileName)
  const completeOnboarding = useFinanceStore(state => state.completeOnboarding)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDay, setDueDay] = useState('5')
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [error, setError] = useState('')

  const finish = () => completeOnboarding()

  const startWithName = () => {
    if (!name.trim()) { setError('Diga como quer ser chamado ou pule esta etapa.'); return }
    setError('')
    setProfileName(name)
    setStep(1)
  }

  const finishWithIncome = () => {
    const cents = parseMoney(amount)
    if (cents <= 0) { setError('Informe o valor do recebimento.'); return }
    if (!accounts.length) { setError('Crie uma conta antes de registrar o recebimento.'); return }
    saveRecurringIncome({
      id: uid(), name: 'Salário', amountInCents: cents, category: 'Salário',
      accountId: accounts[0].id, frequency: 'monthly' as const,
      startDate: nextIncomeDate(Number(dueDay)), isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    finish()
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-1.5" aria-hidden="true">
          {['Bem-vindo', 'Conta', 'Recebimento'].map((label, index) => (
            <span key={label} className={`h-1.5 rounded-full transition-all ${index === step ? 'w-7 bg-brand' : 'w-3 bg-slate-200'}`} title={label}/>
          ))}
        </div>

        {step === 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-3"><span className="category-icon !h-11 !w-11" style={{ color: '#fff', backgroundColor: '#2F80ED' }}><Sparkles size={22}/></span><div><p className="text-sm font-medium text-brand">Atlas Finance</p><h1 className="text-xl font-bold tracking-tight">Bem-vindo!</h1></div></div>
            <p className="mt-4 text-sm leading-6 text-muted">Vamos configurar em menos de um minuto: seu nome, uma conta e quando o dinheiro entra.</p>
            <div className="mt-5">
              <Field label="Como quer ser chamado?">
                <input className="field" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Daniel" aria-label="Seu nome" maxLength={40}/>
              </Field>
              {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
            </div>
            <button className="btn-primary mt-5 w-full" onClick={startWithName}><UserRound size={18}/> Continuar</button>
            <button className="mt-3 w-full text-xs font-semibold text-muted" onClick={finish}>Pular configuração</button>
          </Card>
        )}

        {step === 1 && (
          <Card className="p-6">
            <div className="flex items-center gap-3"><span className="category-icon !h-11 !w-11" style={{ color: '#fff', backgroundColor: '#16A36A' }}><Wallet size={22}/></span><div><p className="text-sm font-medium text-brand">Passo 1 de 2</p><h1 className="text-xl font-bold tracking-tight">Sua primeira conta</h1></div></div>
            <p className="mt-4 text-sm leading-6 text-muted">Conta bancária, carteira ou dinheiro vivo — é dela que saem e entram seus lançamentos.</p>
            {accounts.length > 0 ? (
              <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">✓ Conta criada com sucesso.</p>
            ) : (
              <button className="btn-secondary mt-4 w-full" onClick={()=> setShowAccountModal(true)}><Wallet size={18}/> Criar conta</button>
            )}
            <button className="btn-primary mt-3 w-full disabled:opacity-40" disabled={!accounts.length} onClick={()=> setStep(2)}>Continuar <ChevronRight size={16}/></button>
            <button className="mt-3 w-full text-xs font-semibold text-muted" onClick={finish}>Pular por agora</button>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-6">
            <div className="flex items-center gap-3"><span className="category-icon !h-11 !w-11" style={{ color: '#fff', backgroundColor: '#F2B323' }}><CalendarClock size={22}/></span><div><p className="text-sm font-medium text-brand">Passo 2 de 2</p><h1 className="text-xl font-bold tracking-tight">Quando o dinheiro entra?</h1></div></div>
            <p className="mt-4 text-sm leading-6 text-muted">Com a data do seu recebimento principal, o app calcula quanto você pode gastar por dia.</p>
            <div className="mt-5 space-y-4">
              <Field label="Valor do recebimento">
                <MoneyInput ariaLabel="Valor do recebimento" value={amount} onChange={setAmount}/>
              </Field>
              <Field label="Dia do mês">
                <SelectMenu ariaLabel="Dia do recebimento" value={dueDay} onChange={setDueDay} options={Array.from({ length: 28 }, (_, index) => ({ value: String(index + 1), label: `Dia ${index + 1}` }))}/>
              </Field>
              {error && <p className="text-xs font-medium text-red-600">{error}</p>}
            </div>
            <button className="btn-primary mt-5 w-full" onClick={finishWithIncome}>Concluir configuração</button>
            <button className="mt-3 w-full text-xs font-semibold text-muted" onClick={finish}>Pular por agora</button>
          </Card>
        )}

        {showAccountModal && <AccountModal close={()=> setShowAccountModal(false)}/>}
      </div>
    </div>
  )
}
