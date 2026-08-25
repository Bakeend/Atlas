import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, ChevronLeft, FileText, Search, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, SelectMenu } from './components'
import { categories, money, uid } from './domain'
import type { FinanceTransaction } from './domain'
import { buildDuplicateKey, markDuplicates, parseImportFile, type ParsedImportRow } from './import/parse'
import { useFinanceStore } from './store'
import { getCategoryIcon } from './lib/categoryIcons'

type EditableRow = ParsedImportRow & { selected: boolean; category: string }

function formatPreviewDate(value: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)).replace('.', '')
}

export function ImportPage() {
  const navigate = useNavigate()
  const { accounts, transactions, importTransactions } = useFinanceStore()
  const { customCategories, customCategoryIcons } = useFinanceStore() as any
  const allCats = [...categories, ...((customCategories ?? []) as string[])]
  const activeAccounts = accounts.filter(a => !a.archived)
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '')
  const [rows, setRows] = useState<EditableRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'valid' | 'duplicate' | 'invalid'>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!accountId && activeAccounts[0]) setAccountId(activeAccounts[0].id) }, [accountId, activeAccounts])

  const existingKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!accountId) return keys
    for (const transaction of transactions) {
      if (transaction.deletedAt || transaction.accountId !== accountId) continue
      keys.add(buildDuplicateKey(transaction.date, transaction.amountCents, transaction.description, accountId, transaction.importExternalId))
    }
    return keys
  }, [transactions, accountId])

  const handleFiles = async (files: FileList | null) => {
    setError(''); setSuccess('')
    if (!files?.length) return
    const file = files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Arquivo muito grande (máx 5MB).'); return }
    const text = await file.text().catch(() => '')
    if (!text.trim()) { setError('Arquivo vazio ou ilegível.'); return }
    try {
      const parsed = parseImportFile(file.name, text)
      if (!parsed.length) { setError('Nenhum lançamento encontrado. Verifique se é CSV ou OFX.'); return }
      const marked = markDuplicates(parsed, existingKeys, accountId)
      const editable: EditableRow[] = marked.map(row => ({ ...row, selected: !row.duplicate && !row.invalidReason, category: row.suggestedCategory }))
      setRows(editable)
      setFileName(file.name)
      const dup = editable.filter(row => row.duplicate).length
      if (dup > editable.length / 2) setFilter('valid')
    } catch (e) {
      setError(`Falha ao ler arquivo: ${(e as Error).message}`)
    }
  }

  // Se o usuário troca a conta depois de carregar o arquivo, recalcula duplicidades para a nova conta.
  useEffect(() => {
    if (!rows.length || !accountId) return
    setRows(current => {
      const reset = current.map(row => ({ ...row, duplicate: false }))
      const marked = markDuplicates(reset, existingKeys, accountId)
      return marked.map((row, index) => ({ ...row, category: current[index].category, selected: row.invalidReason || row.duplicate ? false : current[index].selected }))
    })
    // existingKeys muda junto com accountId/transações; não dependemos de rows para evitar ciclo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, existingKeys])

  const filtered = useMemo(() => rows.filter(row => {
    if (filter === 'valid' && (row.duplicate || row.invalidReason)) return false
    if (filter === 'duplicate' && !row.duplicate) return false
    if (filter === 'invalid' && !row.invalidReason) return false
    if (query && !`${row.description} ${row.rawDescription} ${row.date}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [rows, filter, query])

  const summary = useMemo(() => {
    const total = rows.length
    const valid = rows.filter(row => !row.duplicate && !row.invalidReason).length
    const dup = rows.filter(row => row.duplicate).length
    const invalid = rows.filter(row => row.invalidReason).length
    const selectedRows = rows.filter(row => row.selected && !row.invalidReason && !row.duplicate)
    return { total, valid, dup, invalid, selected: selectedRows.length, selectedCents: selectedRows.reduce((sum, row) => sum + row.amountCents, 0) }
  }, [rows])

  const toggleSelect = (id: string) => setRows(current => current.map(row => row.id === id ? { ...row, selected: !row.selected } : row))
  const toggleAllFiltered = (value: boolean) => setRows(current => current.map(row => filtered.some(item => item.id === row.id) && !row.invalidReason && !row.duplicate ? { ...row, selected: value } : row))
  const updateCategory = (id: string, category: string) => setRows(current => current.map(row => row.id === id ? { ...row, category } : row))
  const updateType = (id: string, type: 'income' | 'expense') => setRows(current => current.map(row => {
    if (row.id !== id) return row
    const transferWarning = row.type === 'transfer' && row.invalidReason?.startsWith('Transferência entre contas')
    return { ...row, type, invalidReason: transferWarning ? undefined : row.invalidReason, selected: transferWarning ? true : row.selected }
  }))
  const removeRow = (id: string) => setRows(current => current.filter(row => row.id !== id))

  const onImport = () => {
    if (!accountId) { setError('Selecione a conta do extrato.'); return }
    const toImport = rows.filter(row => row.selected && !row.invalidReason && !row.duplicate && row.type !== 'transfer')
    if (!toImport.length) { setError('Selecione ao menos um lançamento válido.'); return }
    const txs: FinanceTransaction[] = toImport.map(row => ({
      id: uid(),
      type: row.type,
      amountCents: row.amountCents,
      description: row.description,
      category: row.category,
      accountId,
      date: row.date,
      note: row.rawDescription !== row.description ? row.rawDescription : undefined,
      importExternalId: row.externalId,
      createdAt: new Date().toISOString(),
    }))
    importTransactions(txs)
    setSuccess(`${txs.length} lançamentos importados em "${activeAccounts.find(a => a.id === accountId)?.name ?? 'conta'}"`)
    setRows(current => current.map(row => row.selected && !row.invalidReason && !row.duplicate ? { ...row, duplicate: true, selected: false } : row))
    setTimeout(() => navigate('/transactions'), 900)
  }

  return (
    <>
      <div className="page-title">
        <div>
          <button onClick={() => navigate('/transactions')} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ChevronLeft size={17}/>Transações</button>
          <h1>Importar extrato</h1>
          <span className="mt-2 block max-w-md text-xs leading-5 text-muted sm:text-sm">CSV e OFX são processados localmente. A deduplicação considera a conta e, quando disponível, o identificador do banco.</span>
        </div>
        {rows.length > 0 && <button className="btn-secondary hidden sm:inline-flex" onClick={() => { setRows([]); setFileName(''); setError(''); setSuccess('') }}><Trash2 size={16}/>Limpar</button>}
      </div>

      {!activeAccounts.length && <Card><p className="text-sm text-muted">Crie uma conta antes de importar. <button className="font-semibold text-brand" onClick={() => navigate('/accounts')}>Ir para contas</button></p></Card>}

      <Card>
        <div className="grid gap-4 sm:grid-cols-[1fr_280px]">
          <div>
            <span className="label">Conta deste extrato</span>
            <SelectMenu ariaLabel="Conta deste extrato" value={accountId} onChange={setAccountId} options={activeAccounts.map(a => ({ value: a.id, label: a.name }))} placeholder={activeAccounts.length ? 'Selecione' : 'Nenhuma conta'} />
            <p className="mt-1.5 text-xs text-muted">Duplicidades só são comparadas com lançamentos desta conta.</p>
          </div>
          <div className="rounded-xl bg-blue-50/60 p-3 text-xs leading-5 text-slate-600"><strong className="block text-sm text-ink">Transferências</strong>Movimentações identificadas como transferência entre contas não são lançadas automaticamente como gasto ou renda. Defina manualmente o tipo somente se o extrato estiver classificado de forma incorreta.</div>
        </div>
      </Card>

      <Card className="mt-4">
        <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files) }} className={`import-dropzone ${dragOver ? 'drag-over' : ''}`}>
          <div className="import-dropzone-icon"><Upload size={22}/></div><strong>Arraste o arquivo aqui ou clique para selecionar</strong><span>CSV ou OFX até 5MB • Processamento local</span>
          <button type="button" className="btn-primary mt-4" onClick={() => inputRef.current?.click()}><FileText size={16}/> Escolher arquivo</button>
          <input ref={inputRef} type="file" accept=".csv,.ofx,.qfx,.txt" className="hidden" onChange={e => { void handleFiles(e.target.files); if (e.target) e.target.value = '' }} />
          {fileName && <p className="mt-3 text-xs font-medium text-brand">Arquivo: {fileName} • {summary.total} linhas</p>}
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
        {success && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">{success}</p>}
      </Card>

      {rows.length > 0 && <>
        <section className="import-summary-grid"><Card className="import-stat"><span>Total</span><strong>{summary.total}</strong><small>linhas lidas</small></Card><Card className="import-stat ok"><span>Válidos</span><strong>{summary.valid}</strong><small>prontos</small></Card><Card className="import-stat warn"><span>Duplicados</span><strong>{summary.dup}</strong><small>já existem nesta conta</small></Card><Card className="import-stat err"><span>Revisar</span><strong>{summary.invalid}</strong><small>com bloqueio</small></Card></section>
        <Card className="mt-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="import-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar na prévia…"/></div><SelectMenu ariaLabel="Filtrar prévia" value={filter} onChange={v => setFilter(v as typeof filter)} options={[{ value: 'all', label: `Todos (${summary.total})` },{ value: 'valid', label: `Válidos (${summary.valid})` },{ value: 'duplicate', label: `Duplicados (${summary.dup})` },{ value: 'invalid', label: `Revisar (${summary.invalid})` }]}/></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><button className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700 hover:bg-blue-100" onClick={() => toggleAllFiltered(true)}>Selecionar filtrados</button><button className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200" onClick={() => toggleAllFiltered(false)}>Desmarcar filtrados</button><span className="ml-auto text-muted">{summary.selected} selecionados • {money(summary.selectedCents)}</span></div></Card>
        <Card className="mt-4 !p-0"><div className="divide-y divide-slate-100">{filtered.length ? filtered.map(row => (
          <div key={row.id} className={`import-row ${row.duplicate ? 'dup' : ''} ${row.invalidReason ? 'invalid' : ''}`}>
            <button type="button" role="checkbox" aria-checked={row.selected} aria-label={`Selecionar ${row.description}`} disabled={!!row.invalidReason || !!row.duplicate} onClick={() => toggleSelect(row.id)} className={`import-check grid h-5 w-5 shrink-0 place-items-center rounded border text-white transition ${row.selected ? 'bg-brand border-brand' : 'bg-white border-slate-300'} ${row.invalidReason || row.duplicate ? 'opacity-40 cursor-not-allowed' : 'hover:border-brand'}`}>{row.selected && <Check size={14} strokeWidth={2.6} />}</button>
            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><strong className="truncate text-sm">{row.description}</strong><span className={`import-type ${row.type}`}>{row.type === 'income' ? <ArrowDownLeft size={12}/> : row.type === 'expense' ? <ArrowUpRight size={12}/> : <ArrowLeftRight size={12}/>}{row.type === 'income' ? 'Receita' : row.type === 'expense' ? 'Despesa' : 'Transferência'}</span></div><span className="mt-1 block truncate text-xs text-muted">{formatPreviewDate(row.date)} • {row.rawDescription} • {row.source.toUpperCase()}{row.externalId ? ` • ID ${row.externalId}` : ''}</span>{row.invalidReason && <span className="mt-1 block text-xs font-medium text-red-600">{row.invalidReason}</span>}{row.duplicate && <span className="mt-1 block text-xs font-medium text-amber-600">Duplicado nesta conta</span>}</div>
            <div className="import-row-actions"><strong className={row.type === 'income' ? 'text-emerald-600' : row.type === 'transfer' ? 'text-slate-600' : 'text-red-600'}>{money(row.amountCents)}</strong><div className="mt-1 flex flex-col gap-1.5 sm:flex-row sm:items-center"><div className="min-w-[140px]"><SelectMenu ariaLabel={`Categoria de ${row.description}`} value={row.category} onChange={v => updateCategory(row.id, v)} options={allCats.map(c => ({ value: c, label: c, icon: getCategoryIcon(c, customCategoryIcons) }))} /></div><div className="min-w-[120px]"><SelectMenu ariaLabel={`Tipo de ${row.description}`} value={row.type} onChange={v => updateType(row.id, v as 'income'|'expense')} options={[{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }]} /></div><button className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={() => removeRow(row.id)} aria-label="Remover"><X size={14}/></button></div></div>
          </div>
        )) : <p className="empty-inline">Nenhum lançamento para este filtro.</p>}</div></Card>
        <div className="mt-4 flex gap-3"><button className="btn-primary flex-1" disabled={summary.selected === 0 || !accountId} onClick={onImport}><Check size={18}/>Importar {summary.selected} lançamentos</button><button className="btn-secondary" onClick={() => navigate('/transactions')}>Cancelar</button></div>
        <p className="mt-3 text-center text-xs leading-5 text-muted">Duplicidade: <code className="rounded bg-slate-100 px-1">conta + FITID</code> quando disponível; caso contrário <code className="rounded bg-slate-100 px-1">conta + data + valor + descrição</code>.</p>
      </>}
    </>
  )
}
