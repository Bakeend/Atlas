import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { DatePicker, Field, Modal, MoneyInput, SelectMenu } from '../components'
import { categories, money, parseMoney, today, uid, type CreditCard, type CreditCardPurchase } from '../domain'
import { getCategoryIcon } from '../lib/categoryIcons'
import { useFinanceStore } from '../store'
import { getInstallmentClosingDates, getInstallmentAmount, dueDateFromClosing } from './creditCardService'

const schema = z.object({
  cardId: z.string().min(1, 'Selecione o cartão'),
  description: z.string().trim().min(2, 'Informe a descrição'),
  category: z.string().min(1),
  totalAmount: z.string().min(1, 'Informe o valor'),
  installments: z.string().min(1),
  purchaseDate: z.string().min(1, 'Informe a data'),
  note: z.string().optional(),
}).superRefine((v, ctx) => {
  if (parseMoney(v.totalAmount) <= 0) ctx.addIssue({ code: 'custom', path: ['totalAmount'], message: 'Valor deve ser maior que zero' })
  const inst = Number(v.installments)
  if (!Number.isInteger(inst) || inst < 1 || inst > 48) ctx.addIssue({ code: 'custom', path: ['installments'], message: 'Entre 1 e 48 parcelas' })
})

type FormValues = z.infer<typeof schema>

export function PurchaseModal({ close, cardId, purchase }: { close: () => void; cardId?: string; purchase?: CreditCardPurchase }) {
  const { creditCards, saveCreditCardPurchase, customCategoryIcons } = useFinanceStore() as any
  const { customCategories } = useFinanceStore() as any
  const allCats = [...categories, ...(customCategories ?? [])]
  const activeCards = (creditCards as CreditCard[]).filter(c => !c.archived)
  const defaultCard = cardId ?? purchase?.cardId ?? activeCards[0]?.id ?? ''
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: purchase
      ? { cardId: purchase.cardId, description: purchase.description, category: purchase.category, totalAmount: (purchase.totalAmountCents / 100).toFixed(2).replace('.', ','), installments: String(purchase.installments), purchaseDate: purchase.purchaseDate, note: purchase.note ?? '' }
      : { cardId: defaultCard, description: '', category: 'Outros', totalAmount: '', installments: '1', purchaseDate: today(), note: '' },
  })
  const watchCardId = form.watch('cardId')
  const watchTotal = form.watch('totalAmount')
  const watchInst = form.watch('installments')
  const watchDate = form.watch('purchaseDate')
  const selectedCard = activeCards.find(c => c.id === watchCardId)
  const totalCents = parseMoney(watchTotal)
  const instCount = Number(watchInst) || 1
  const preview = (() => {
    if (!selectedCard || totalCents <= 0 || instCount < 1) return null
    const closings = getInstallmentClosingDates(selectedCard, watchDate || today(), instCount)
    const firstDue = closings[0] ? dueDateFromClosing(closings[0], selectedCard.dueDay) : ''
    const per = getInstallmentAmount(totalCents, instCount, 0)
    // mostra 3 primeiras
    return { per, firstDue, closings: closings.slice(0, 3), remaining: instCount - 3 }
  })()

  const onSubmit = (values: FormValues) => {
    const p: CreditCardPurchase = {
      id: purchase?.id ?? uid(),
      cardId: values.cardId,
      description: values.description.trim(),
      category: values.category,
      totalAmountCents: parseMoney(values.totalAmount),
      installments: Number(values.installments),
      purchaseDate: values.purchaseDate,
      createdAt: purchase?.createdAt ?? new Date().toISOString(),
      status: 'active',
      note: values.note?.trim() || undefined,
    }
    saveCreditCardPurchase(p)
    close()
  }

  if (!activeCards.length) {
    return <Modal title="Nova compra" close={close}><p className="text-sm text-muted">Cadastre um cartão antes de lançar compras.</p></Modal>
  }

  return (
    <Modal title={purchase ? 'Editar compra' : 'Nova compra no cartão'} close={close}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <Field label="Cartão" error={form.formState.errors.cardId?.message}>
          <SelectMenu ariaLabel="Cartão" value={form.watch('cardId')} onChange={v => form.setValue('cardId', v, { shouldDirty: true, shouldValidate: true })} options={activeCards.map(c => ({ value: c.id, label: `${c.name} • ${c.bank}` }))} />
        </Field>
        <Field label="Descrição" error={form.formState.errors.description?.message}>
          <input className="field" placeholder="Ex.: Supermercado" {...form.register('description')} autoFocus />
        </Field>
        <Field label="Categoria">
          <SelectMenu ariaLabel="Categoria" value={form.watch('category')} onChange={v => form.setValue('category', v, { shouldDirty: true })} options={allCats.map(cat => ({ value: cat, label: cat, icon: getCategoryIcon(cat, customCategoryIcons) }))} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor total" error={form.formState.errors.totalAmount?.message}>
            <MoneyInput ariaLabel="Valor total" value={form.watch('totalAmount')} onChange={v => form.setValue('totalAmount', v, { shouldDirty: true, shouldValidate: true })} />
          </Field>
          <Field label="Parcelas" error={form.formState.errors.installments?.message}>
            <SelectMenu ariaLabel="Parcelas" value={form.watch('installments')} onChange={v => form.setValue('installments', v, { shouldDirty: true })} options={Array.from({ length: 24 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}x` })).concat([{ value: '36', label: '36x' }, { value: '48', label: '48x' }])} />
          </Field>
        </div>
        <Field label="Data da compra" error={form.formState.errors.purchaseDate?.message}>
          <DatePicker ariaLabel="Data da compra" value={form.watch('purchaseDate')} onChange={v => form.setValue('purchaseDate', v, { shouldDirty: true, shouldValidate: true })} />
        </Field>
        <Field label="Observação (opcional)">
          <input className="field" placeholder="Ex.: 6x sem juros" {...form.register('note')} />
        </Field>
        {preview && (
          <div className="rounded-xl bg-slate-50 p-3 text-xs">
            <p className="font-semibold">{instCount}x de {money(preview.per)} {instCount > 1 ? `(total ${money(totalCents)})` : ''}</p>
            <p className="mt-1 text-muted">1ª parcela na fatura com fechamento {preview.closings[0]} (venc. {preview.firstDue})</p>
            {preview.closings.length > 1 && <p className="mt-1 text-muted">Parcelas: {preview.closings.join(', ')}{preview.remaining > 0 ? ` +${preview.remaining} mais` : ''}</p>}
            <p className="mt-1 text-muted">Distribuição segue o dia de fechamento do cartão.</p>
          </div>
        )}
        <button className="btn-primary w-full" type="submit"><Check size={18} />Salvar compra</button>
      </form>
    </Modal>
  )
}
