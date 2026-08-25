import fs from 'node:fs'

const path = 'src/ChartsPage.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Patch target not found: ${label}`)
  source = source.replace(from, to)
}

replaceOnce(
  "import { useFinanceStore } from './store'",
  "import { useFinanceStore } from './store'\nimport { getUnrecordedOccurrencesBetween } from './recurring'",
  'recurring import',
)

replaceOnce(
`  // Totais do mês
  const totalIncome = useMemo(
    () => monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amountCents, 0),
    [monthTransactions]
  )

  const totalExpense = useMemo(
    () => monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amountCents, 0),
    [monthTransactions]
  )`,
`  // Recorrências ativas ainda não registradas como transação no mês selecionado.
  // Entram como valor comprometido/projetado, sem duplicar quando a ocorrência já foi lançada.
  const recurringCommitments = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const start = \`${'${selectedMonth}'}-01\`
    const end = \`${'${selectedMonth}'}-${'${String(new Date(year, month, 0).getDate()).padStart(2, \'0\')}'}\`

    return recurringExpenses
      .filter(expense => expense.isActive)
      .flatMap(expense => getUnrecordedOccurrencesBetween(expense, start, end, live).map(date => ({
        id: \`recurring:${'${expense.id}'}:${'${date}'}\`,
        date,
        amountCents: expense.amountInCents,
        category: expense.category || 'Outros',
        name: expense.name,
      })))
  }, [recurringExpenses, selectedMonth, live])

  const recurringCommittedTotal = useMemo(
    () => recurringCommitments.reduce((sum, item) => sum + item.amountCents, 0),
    [recurringCommitments]
  )

  // Totais do mês: despesas incluem realizado + recorrências ainda comprometidas.
  const totalIncome = useMemo(
    () => monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amountCents, 0),
    [monthTransactions]
  )

  const realizedExpense = useMemo(
    () => monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amountCents, 0),
    [monthTransactions]
  )

  const totalExpense = realizedExpense + recurringCommittedTotal`,
  'monthly totals',
)

replaceOnce(
`    monthTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const cat = t.category || 'Outros'
        map.set(cat, (map.get(cat) ?? 0) + t.amountCents)
      })`,
`    monthTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const cat = t.category || 'Outros'
        map.set(cat, (map.get(cat) ?? 0) + t.amountCents)
      })

    recurringCommitments.forEach(item => {
      const cat = item.category || 'Outros'
      map.set(cat, (map.get(cat) ?? 0) + item.amountCents)
    })`,
  'category commitments',
)

replaceOnce(
`  }, [monthTransactions, totalExpense])`,
`  }, [monthTransactions, recurringCommitments, totalExpense])`,
  'category dependencies',
)

replaceOnce(
`      const exp = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0)`,
`      const realizedExp = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0)
      const [hy, hm] = mKey.split('-').map(Number)
      const hStart = \`${'${mKey}'}-01\`
      const hEnd = \`${'${mKey}'}-${'${String(new Date(hy, hm, 0).getDate()).padStart(2, \'0\')}'}\`
      const committedExp = recurringExpenses
        .filter(expense => expense.isActive)
        .reduce((sum, expense) => sum + getUnrecordedOccurrencesBetween(expense, hStart, hEnd, live).length * expense.amountInCents, 0)
      const exp = realizedExp + committedExp`,
  'historical commitments',
)

replaceOnce(
`  }, [live, selectedMonth])`,
`  }, [live, selectedMonth, recurringExpenses])`,
  'historical dependencies',
)

replaceOnce(
`      const exp = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0)

      cumulativeIncome += inc
      cumulativeExpense += exp

      // Para dias futuros no mês atual, fazemos uma projeção aproximada baseada nas recorrências
      let isProjected = false
      if (isCurrent && day > todayDay) {
        isProjected = true
        // Soma recorrências previstas que caem neste dia
        const recForDay = recurringExpenses
          .filter(r => r.isActive && r.dueDay === day)
          .reduce((s, r) => s + r.amountInCents, 0)
        cumulativeExpense += recForDay
      }`,
`      const exp = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0)
      const committedForDay = recurringCommitments
        .filter(item => item.date === dayStr)
        .reduce((sum, item) => sum + item.amountCents, 0)

      cumulativeIncome += inc
      cumulativeExpense += exp + committedForDay

      const isProjected = committedForDay > 0 || (isCurrent && day > todayDay)`,
  'daily commitments',
)

replaceOnce(
`  }, [selectedMonth, monthTransactions, recurringExpenses])`,
`  }, [selectedMonth, monthTransactions, recurringCommitments])`,
  'daily dependencies',
)

replaceOnce(
`            <span>Despesas</span>`,
`            <span>Despesas + comprometido</span>`,
  'expense label',
)

replaceOnce(
`          {expenseChange !== 0 && (`,
`          {recurringCommittedTotal > 0 && (
            <span className="mt-1 block text-[11px] font-semibold text-blue-500">
              {money(recurringCommittedTotal, hideBalances)} recorrente previsto
            </span>
          )}
          {expenseChange !== 0 && (`,
  'committed summary',
)

replaceOnce(
`            <p className="mt-0.5 text-xs text-muted">Para onde foi o seu dinheiro em {formatMonthLabel(selectedMonth)}</p>`,
`            <p className="mt-0.5 text-xs text-muted">Realizado + gastos recorrentes comprometidos em {formatMonthLabel(selectedMonth)}</p>`,
  'category description',
)

fs.writeFileSync(path, source)
console.log('Recurring expenses chart patch applied successfully.')
