import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { DatePicker, Field, Modal, MoneyInput, SelectMenu } from '../components'
import { money, parseMoney, today } from '../domain'
import { useFinanceStore } from '../store'

const schema = z.object({
  accountId: z.string().min(1, 'Selecione a conta'),
  amount: z.string().min(1, 'Informe o valor'),
  date: z.string().min(1),
  note: z.string().optional(),
}).superRefine((v, ctx) => {
  if (parseMoney(v.amount) <= 0) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Valor deve ser maior que zero' })
})

type FormValues = z.infer<typeof schema>

export function PaymentModal({
  close,
  cardId,
  invoiceClosingDate,
  remainingCents,
  totalCents,
  dueDate,
}: {
  close: () => void
  cardId: string
  invoiceClosingDate: string
  remainingCents: number
  totalCents: number
  dueDate: string
}) {
  const { accounts, payCreditCardInvoice } = useFinanceStore()
  const activeAccounts = accounts.filter(a => !a.archived)
  const defaultAccount = activeAccounts[0]?.id ?? ''
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { accountId: defaultAccount, amount: (remainingCents / 100).toFixed(2).replace('.', ','), date: today(), note: '' },
  })

  const onSubmit = (values: FormValues) => {
    const cents = parseMoney(values.amount)
    if (cents > remainingCents) {
      form.setError('amount', { message: `Máximo ${money(remainingCents)}` })
      return
    }
    const ok = payCreditCardInvoice({ cardId, invoiceClosingDate, amountCents: cents, accountId: values.accountId, date: values.date, note: values.note?.trim() })
    if (ok) close()
  }

  return (
    <Modal title="Pagar fatura" close={close}>
      <div className="mb-4 rounded-2xl bg-slate-50 p-4">
        <p className="text-xs text-muted">Fatura com vencimento {dueDate}</p>
        <p className="mt-1 text-sm">Total {money(totalCents)} • Restante {money(remainingCents)}</p>
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <Field label="Conta de pagamento" error={form.formState.errors.accountId?.message}>
          <SelectMenu ariaLabel="Conta" value={form.watch('accountId')} onChange={v => form.setValue('accountId', v, { shouldDirty: true, shouldValidate: true })} options={activeAccounts.map(a => ({ value: a.id, label: a.name }))} />
        </Field>
        <Field label="Valor a pagar" error={form.formState.errors.amount?.message}>
          <MoneyInput ariaLabel="Valor a pagar" value={form.watch('amount')} onChange={v => form.setValue('amount', v, { shouldDirty: true, shouldValidate: true })} />
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => form.setValue('amount', (remainingCents / 100).toFixed(2).replace('.', ','), { shouldDirty: true, shouldValidate: true })}>Total</button>
            <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => form.setValue('amount', (Math.round(remainingCents * 0.5) / 100).toFixed(2).replace('.', ','), { shouldDirty: true })}>50%</button>
          </div>
        </Field>
        <Field label="Data do pagamento">
          <DatePicker ariaLabel="Data do pagamento" value={form.watch('date')} onChange={v => form.setValue('date', v, { shouldDirty: true })} />
        </Field>
        <Field label="Observação (opcional)">
          <input className="field" {...form.register('note')} placeholder="Ex.: pagamento parcial" />
        </Field>
        <p className="text-xs text-muted">O valor será debitado do saldo da conta e abatido da fatura. O pagamento não gera nova despesa duplicada nos relatórios.</p>
        <button className="btn-primary w-full" type="submit"><Check size={18} />Confirmar pagamento</button>
      </form>
    </Modal>
  )
}
