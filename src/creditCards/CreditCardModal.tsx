import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Card, ColorPicker, Field, Modal, MoneyInput, SelectMenu } from '../components'
import { money, parseMoney, today, uid, type CreditCard } from '../domain'
import { useFinanceStore } from '../store'

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do cartão'),
  bank: z.string().trim().min(2, 'Informe o banco'),
  limit: z.string().min(1, 'Informe o limite'),
  closingDay: z.string().min(1, 'Selecione o fechamento'),
  dueDay: z.string().min(1, 'Selecione o vencimento'),
  color: z.string().min(1),
  paymentAccountId: z.string().min(1, 'Selecione a conta de pagamento'),
}).superRefine((v, ctx) => {
  if (parseMoney(v.limit) <= 0) ctx.addIssue({ code: 'custom', path: ['limit'], message: 'Limite deve ser maior que zero' })
  const c = Number(v.closingDay); if (c < 1 || c > 31) ctx.addIssue({ code: 'custom', path: ['closingDay'], message: 'Dia inválido' })
  const d = Number(v.dueDay); if (d < 1 || d > 31) ctx.addIssue({ code: 'custom', path: ['dueDay'], message: 'Dia inválido' })
})

type FormValues = z.infer<typeof schema>

export function CreditCardModal({ close, item }: { close: () => void; item?: CreditCard }) {
  const { accounts, saveCreditCard } = useFinanceStore()
  const activeAccounts = accounts.filter(a => !a.archived)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: item
      ? { name: item.name, bank: item.bank, limit: (item.limitCents / 100).toFixed(2).replace('.', ','), closingDay: String(item.closingDay), dueDay: String(item.dueDay), color: item.color, paymentAccountId: item.paymentAccountId }
      : { name: '', bank: 'Nubank', limit: '', closingDay: '10', dueDay: '20', color: '#2F80ED', paymentAccountId: activeAccounts[0]?.id ?? '' },
  })

  const onSubmit = (values: FormValues) => {
    const timestamp = new Date().toISOString()
    const card: CreditCard = {
      id: item?.id ?? uid(),
      name: values.name.trim(),
      bank: values.bank.trim(),
      limitCents: parseMoney(values.limit),
      closingDay: Number(values.closingDay),
      dueDay: Number(values.dueDay),
      color: values.color,
      paymentAccountId: values.paymentAccountId,
      archived: item?.archived ?? false,
      createdAt: item?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    saveCreditCard(card)
    close()
  }

  return (
    <Modal title={item ? 'Editar cartão' : 'Novo cartão'} close={close}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <Field label="Nome do cartão" error={form.formState.errors.name?.message}>
          <input className="field" placeholder="Ex.: Nubank Roxinho" {...form.register('name')} autoFocus />
        </Field>
        <Field label="Banco / Instituição" error={form.formState.errors.bank?.message}>
          <input className="field" placeholder="Ex.: Nubank, Itaú, Inter" {...form.register('bank')} />
          <p className="mt-1 text-xs text-muted">Dados do cadastro do cartão — exibidos como cadastrado em toda a interface.</p>
        </Field>
        <Field label="Limite total" error={form.formState.errors.limit?.message}>
          <MoneyInput ariaLabel="Limite total" value={form.watch('limit')} onChange={v => form.setValue('limit', v, { shouldDirty: true, shouldValidate: true })} />
          <p className="mt-1 text-xs text-muted">Valor total liberado: {money(parseMoney(form.watch('limit')) || 0)}</p>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dia de fechamento" error={form.formState.errors.closingDay?.message}>
            <SelectMenu ariaLabel="Dia de fechamento" value={form.watch('closingDay')} onChange={v => form.setValue('closingDay', v, { shouldDirty: true, shouldValidate: true })} options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Dia ${i + 1}` }))} />
          </Field>
          <Field label="Dia de vencimento" error={form.formState.errors.dueDay?.message}>
            <SelectMenu ariaLabel="Dia de vencimento" value={form.watch('dueDay')} onChange={v => form.setValue('dueDay', v, { shouldDirty: true, shouldValidate: true })} options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Dia ${i + 1}` }))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conta para pagar fatura" error={form.formState.errors.paymentAccountId?.message}>
            <SelectMenu ariaLabel="Conta de pagamento" value={form.watch('paymentAccountId')} onChange={v => form.setValue('paymentAccountId', v, { shouldDirty: true, shouldValidate: true })} options={activeAccounts.map(a => ({ value: a.id, label: a.name }))} />
          </Field>
          <Field label="Cor de identificação">
            <ColorPicker ariaLabel="Cor do cartão" value={form.watch('color')} onChange={v => form.setValue('color', v, { shouldDirty: true })} />
          </Field>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-muted">
          Compras feitas até o dia de fechamento entram na fatura atual; após, vão para a próxima. O vencimento é calculado automaticamente a partir do fechamento.
        </div>
        <button className="btn-primary w-full" type="submit"><Check size={18} />Salvar cartão</button>
      </form>
    </Modal>
  )
}
