import { useMemo, useState } from 'react'
import { Wallet, PiggyBank, CircleDollarSign, ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react'
import { Card, SelectMenu, Modal, DatePicker } from './components'
import { money } from './domain'
import { useFinanceStore } from './store'
import { calculateFreeMoney } from './services/financialEngine'

type PeriodOpt = 'nextIncome' | 'thisMonth' | 'next30' | 'custom'

export function FreeMoneyCard() {
  const store = useFinanceStore()
  const [period, setPeriod] = useState<PeriodOpt>('nextIncome')
  const [customEnd, setCustomEnd] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const { hideBalances } = store as any

  const result = useMemo(() => {
    try {
      return calculateFreeMoney({ period, customEnd: customEnd || undefined })
    } catch {
      return null
    }
  }, [store.accounts, store.transactions, store.budgets, store.recurringExpenses, store.goals, store.paymentAllocationPlans, store.safetyMarginPercent, period, customEnd])

  if (!result) return null

  // insufficient data
  if (result.isInsufficientData) {
    return (
      <Card className="dashboard-card animate-enter">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-amber-700"><Wallet size={16} /></span>
          <div>
            <h2 className="text-sm font-semibold">Dinheiro livre</h2>
            <p className="text-xs text-muted">Planejamento</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-800">Ainda não conseguimos calcular seu dinheiro livre.</p>
          <p className="mt-1 text-xs leading-5 text-amber-700">Cadastre seus próximos recebimentos e compromissos para melhorar o planejamento.</p>
        </div>
      </Card>
    )
  }

  const isNegative = result.isNegative

  return (
    <>
      <Card className="dashboard-card animate-enter relative overflow-hidden">
        <div className="card-heading">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><PiggyBank size={18} /></span>
            <div>
              <h2 className="text-base font-bold tracking-tight">Dinheiro livre</h2>
              <p className="text-xs text-muted">{result.period.label}</p>
            </div>
          </div>
          <div className="min-w-[140px]">
            <SelectMenu
              ariaLabel="Período do dinheiro livre"
              value={period}
              onChange={v => setPeriod(v as PeriodOpt)}
              options={[
                { value: 'nextIncome', label: 'Até próximo salário' },
                { value: 'thisMonth', label: 'Este mês' },
                { value: 'next30', label: 'Próximos 30 dias' },
                { value: 'custom', label: 'Data personalizada' },
              ]}
            />
          </div>
        </div>

        {period === 'custom' && (
          <div className="mt-3">
            <DatePicker
              value={customEnd}
              onChange={setCustomEnd}
              ariaLabel="Data final do dinheiro livre"
            />
          </div>
        )}

        <div className="mt-4">
          <p className={`text-3xl font-bold tracking-tight tabular-nums ${isNegative ? 'text-red-600' : 'text-emerald-600'}`}>{money(result.freeCents, hideBalances)}</p>
          <p className="mt-1 text-xs text-muted">
            Saldo {money(result.totalCents, hideBalances)} • Comprometido {money(result.committedCents + result.essentialBudgetsCents + result.goalsCents + result.safetyMarginCents, hideBalances)}
          </p>
          {isNegative ? (
            <div className="mt-3 flex gap-2 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>Seus compromissos previstos ultrapassam o saldo disponível em {money(result.deficitCents, hideBalances)}.</span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">Livre para gastar até {result.period.end}</p>
          )}
        </div>

        <button className="btn-secondary mt-4 w-full" onClick={() => setShowDetails(true)}>Ver detalhes</button>
      </Card>

      {showDetails && <FreeMoneyDetailsModal result={result} close={() => setShowDetails(false)} />}
    </>
  )
}

function FreeMoneyDetailsModal({ result, close }: { result: ReturnType<typeof calculateFreeMoney>; close: () => void }) {
  const { hideBalances } = useFinanceStore() as any
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setOpen(s => ({ ...s, [k]: !s[k] }))

  const Row = ({ label, cents, onToggle, expanded, children }: { label: string; cents: number; onToggle?: () => void; expanded?: boolean; children?: React.ReactNode }) => (
    <div className="rounded-xl border bg-white">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-3 text-left">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-center gap-2">
          <strong className="tabular-nums">{money(cents, hideBalances)}</strong>
          {onToggle && (expanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />)}
        </span>
      </button>
      {expanded && children && <div className="border-t bg-slate-50 p-3 text-xs">{children}</div>}
    </div>
  )

  return (
    <Modal title="Seu dinheiro" close={close}>
      <div className="space-y-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex justify-between text-sm"><span className="text-muted">Saldo total</span><strong className="tabular-nums">{money(result.totalCents, hideBalances)}</strong></div>
          <p className="mt-1 text-xs text-muted">{result.period.label} • {result.period.start} → {result.period.end}</p>
        </div>

        <Row label="Separado para contas" cents={result.committedCents} onToggle={() => toggle('contas')} expanded={!!open['contas']}>
          {result.committedDetails.length ? (
            <div className="space-y-1.5">
              {result.committedDetails.map((d: (typeof result.committedDetails)[number]) => (
                <div key={d.id + d.dueDate} className="flex justify-between gap-2">
                  <span>{d.name} <small className="text-muted">• {d.dueDate} {d.isEstimated ? '• Estimado' : ''}</small></span>
                  <span className="font-semibold">{d.amountFormatted} {d.isEstimated && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">Estimado</span>}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">Nenhuma conta prevista no período.</p>
          )}
        </Row>

        <Row label="Orçamentos essenciais" cents={result.essentialBudgetsCents} onToggle={() => toggle('orc')} expanded={!!open['orc']}>
          {result.essentialBudgetsDetails.length ? (
            <div className="space-y-1.5">
              {result.essentialBudgetsDetails.map((b: (typeof result.essentialBudgetsDetails)[number]) => (
                <div key={b.category + b.month} className="flex justify-between"><span>{b.category} • {b.month}</span><span className="font-semibold">{b.limitFormatted}</span></div>
              ))}
            </div>
          ) : (
            <p className="text-muted">Nenhum orçamento essencial no período.</p>
          )}
        </Row>

        <Row label="Metas e reservas" cents={result.goalsCents} onToggle={() => toggle('metas')} expanded={!!open['metas']}>
          {result.goalsDetails.length ? (
            <div className="space-y-1.5">
              {result.goalsDetails.map((g: (typeof result.goalsDetails)[number]) => (
                <div key={g.id} className="flex justify-between"><span>{g.title} {g.isVirtual ? '• Reservado' : ''}</span><span className="font-semibold">{g.amountFormatted}</span></div>
              ))}
            </div>
          ) : (
            <p className="text-muted">Nenhuma meta com reserva no período.</p>
          )}
          {result.virtualReservesCents > 0 && <p className="mt-2 text-[11px] text-muted">Valores já reservados (virtual): {money(result.virtualReservesCents, hideBalances)}</p>}
        </Row>

        <Row label={`Margem de segurança (${result.safetyMarginPercent}%)`} cents={result.safetyMarginCents} />

        <div className="h-px bg-slate-200" />

        <div className={`flex justify-between rounded-xl p-3 text-base font-bold ${result.isNegative ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <span>Livre</span><span className="tabular-nums">{money(result.freeCents, hideBalances)}</span>
        </div>
        {result.isNegative && (
          <div className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700 flex gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Seus compromissos previstos ultrapassam o saldo disponível em {result.deficitFormatted}.
          </div>
        )}
        {!result.period.hasNextIncome && (
          <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800 flex gap-2">
            <Info size={14} className="mt-0.5 shrink-0" /> Sem próximo recebimento cadastrado. Cálculo considera próximos 30 dias. Cadastre seu salário para melhorar.
          </div>
        )}
      </div>
    </Modal>
  )
}
