import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, CategoryIcon, Field, Modal } from '../components'
import { categories as defaultCategories } from '../domain'
import { useFinanceStore } from '../store'
import { iconPack, getCategoryIcon } from '../lib/categoryIcons'

export function CategoryManager({ close }: { close: () => void }) {
  const store = useFinanceStore() as any
  const { customCategories, customCategoryIcons, addCustomCategory, deleteCustomCategory, setCustomCategoryIcon } = store
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('Package')
  const [error, setError] = useState('')
  const allCats = [...defaultCategories, ...(customCategories ?? [])]

  const isReferenced = (name: string) =>
    store.transactions.some((t:any)=>!t.deletedAt && t.category===name) ||
    store.budgets.some((b:any)=>b.category===name) ||
    store.recurringExpenses.some((r:any)=>r.category===name) ||
    (store.recurringIncomes ?? []).some((r:any)=>r.category===name) ||
    (store.goals ?? []).some((g:any)=>g.category===name) ||
    (store.allocationPlans ?? []).some((p:any)=>p.allocations?.some((i:any)=>i.categoryId===name)) ||
    (store.paymentAllocationPlans ?? []).some((p:any)=>p.items?.some((i:any)=>i.categoryId===name))

  const handleCreate = () => {
    const name = newName.trim()
    if (name.length < 2) { setError('Nome muito curto (mín 2)'); return }
    if (allCats.some((c: string) => c.toLowerCase() === name.toLowerCase())) { setError('Categoria já existe'); return }
    addCustomCategory(name, newIcon)
    setNewName(''); setError('')
  }

  const handleDelete = (name: string) => {
    if (isReferenced(name)) {
      setError(`A categoria "${name}" ainda está em uso. Mova ou renomeie os lançamentos, orçamentos e recorrências antes de excluir.`)
      return
    }
    deleteCustomCategory(name)
    setError('')
  }

  return (
    <Modal title="Categorias" close={close}>
      <div className="space-y-5">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
        <div className="grid gap-2">
          {allCats.map((cat: string) => {
            const isCustom = (customCategories ?? []).includes(cat)
            const Icon = getCategoryIcon(cat, customCategoryIcons)
            const referenced = isCustom && isReferenced(cat)
            return <div key={cat} className="flex items-center gap-3 rounded-xl border p-3">
              <CategoryIcon icon={Icon} />
              <span className="flex-1 text-sm font-medium">{cat}</span>
              {referenced && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-brand">em uso</span>}
              {isCustom ? <div className="flex items-center gap-1">
                <button className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-slate-100" onClick={() => { const current = customCategoryIcons?.[cat] ?? 'Package'; const nextIdx = (iconPack.findIndex(p => p.name === current) + 1) % iconPack.length; setCustomCategoryIcon(cat, iconPack[nextIdx].name) }} aria-label={`Trocar ícone de ${cat}`}><Pencil size={14} /></button>
                <button className={`grid h-8 w-8 place-items-center rounded-full ${referenced ? 'cursor-not-allowed text-slate-300' : 'text-red-500 hover:bg-red-50'}`} onClick={() => handleDelete(cat)} aria-label={`Excluir ${cat}`} title={referenced ? 'Categoria em uso' : 'Excluir categoria'}><Trash2 size={14} /></button>
              </div> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-muted">padrão</span>}
            </div>
          })}
        </div>
        <Card className="!p-4">
          <h3 className="text-sm font-semibold">Nova categoria</h3>
          <div className="mt-3"><Field label="Nome"><input className="field" placeholder="Ex.: Pets" value={newName} onChange={e => { setNewName(e.target.value); setError('') }} /></Field></div>
          <div className="mt-3"><span className="label">Ícone</span><div className="grid grid-cols-6 gap-2 rounded-xl border bg-slate-50 p-2 sm:grid-cols-8">{iconPack.map(p => <button key={p.name} type="button" aria-label={p.label} aria-pressed={newIcon === p.name} onClick={() => setNewIcon(p.name)} className={`grid h-10 w-10 place-items-center rounded-xl border bg-white transition ${newIcon === p.name ? 'border-brand bg-blue-50 text-brand ring-2 ring-brand/20' : 'border-slate-200 hover:border-brand hover:bg-blue-50'}`}><p.icon size={18} /></button>)}</div></div>
          <button className="btn-primary mt-4 w-full" onClick={handleCreate}><Plus size={16} /> Criar categoria</button>
        </Card>
      </div>
    </Modal>
  )
}
