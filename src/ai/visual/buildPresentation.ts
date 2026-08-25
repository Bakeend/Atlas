import type { AiPresentation, AiVisualBlock, AiAction } from './types'
import { money, parseMoney, uid } from '../../domain'

// Converte toolCalls + texto da IA em AiPresentation validada
// (01:58) — se IA não retornou JSON, sintetizamos blocks a partir dos tool results (seguro, sem HTML arbitrário)
export function buildPresentationFromTools(
  content: string,
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>
): AiPresentation {
  const blocks: AiVisualBlock[] = []
  const actions: AiAction[] = []
  let speech: string | undefined

  // speech curto para TTS (01:44) — primeira frase do content
  if (content) {
    const firstSentence = content.split(/[.!?]\s/)[0]?.slice(0, 180)
    if (firstSentence) speech = firstSentence.trim()
  }

  const hasSuccessfulCreate = toolCalls.some(tc =>
    (tc.name === 'createTransaction' || tc.name === 'updateTransaction') &&
    (tc.result as any)?.success === true
  )
  for (const tc of toolCalls) {
    const r = tc.result as Record<string, unknown> | null
    if (!r) continue

    // Erro de tool → ErrorBlock (suprime erro de conta placeholder quando já houve sucesso posterior)
    if ((r as { success?: boolean }).success === false && (r as { error?: string }).error) {
      const errMsg = String((r as { error: string }).error)
      const isAccountPlaceholderError = errMsg.includes('Conta não encontrada') && (errMsg.includes('sua_conta') || errMsg.includes('sua conta'))
      // se já houve createTransaction com sucesso, não exibe erro de placeholder (retry interno do agente)
      if (isAccountPlaceholderError && hasSuccessfulCreate) continue
      // se sucesso posterior para mesmo tool existe, suprime erro genérico duplicado para evitar bubble com sucesso + erro contraditórios
      if (hasSuccessfulCreate && (tc.name === 'createTransaction' || tc.name === 'createCategory')) {
        // quando há sucesso posterior, o erro foi tentiva intermediária já superada
        // mantém apenas sucesso visual
        continue
      }
      blocks.push({
        type: 'error',
        title: 'Não foi possível concluir',
        description: errMsg.slice(0, 280),
        retryAction: { type: 'retry', label: 'Tentar novamente' },
      } as AiVisualBlock)
      continue
    }

    // Mapeia cada tool para block correspondente
    if (tc.name === 'createTransaction' || tc.name === 'updateTransaction') {
      const tx = (r as { transaction?: { description?: string; amountCents?: number; category?: string; date?: string; type?: string; id?: string } }).transaction ?? (r as unknown as { description?: string; id?: string })
      const amount = (r as { transaction?: { amountCents?: number } }).transaction?.amountCents ?? (r as { amountCents?: number }).amountCents
      blocks.push({
        type: 'success',
        title: tc.name === 'createTransaction' ? 'Transação registrada' : 'Transação atualizada',
        description: `${(tx as { description?: string }).description ?? 'Movimentação'} · ${amount !== undefined ? money(amount) : ''}`,
        entity: (tx as { id?: string }).id ? { type: 'transaction', id: (tx as { id?: string }).id! } : undefined,
      } as AiVisualBlock)
      // entity-preview para confirmação futura já foi feita via tool, então success basta
      if (!speech) speech = `Despesa ${(tx as { description?: string }).description ?? ''} registrada.`
    } else if (tc.name === 'createCategory' || tc.name === 'updateCategory') {
      const cat = (r as { category?: { name?: string; id?: string } }).category ?? (r as unknown as { name?: string; id?: string })
      blocks.push({
        type: 'success',
        title: 'Categoria criada',
        description: (cat as { name?: string }).name ? `A categoria ${(cat as { name?: string }).name} está pronta para ser usada.` : 'Categoria pronta.',
        entity: (cat as { id?: string }).id ? { type: 'category', id: (cat as { id?: string }).id! } : undefined,
      } as AiVisualBlock)
      if (!speech) speech = `Categoria ${cat.name ?? ''} criada.`
    } else if (tc.name === 'deleteCategory' || tc.name === 'deleteTransaction') {
      blocks.push({
        type: 'success',
        title: 'Excluído',
        description: String((r as { message?: string }).message ?? 'Ação concluída.'),
      } as AiVisualBlock)
    } else if (tc.name === 'createRecurringExpense' || tc.name === 'createRecurringIncome') {
      const rec = (r as { recurringExpense?: { name?: string; amountCents?: number; id?: string; dueDay?: number } }).recurringExpense ?? (r as unknown as { name?: string; amountCents?: number; id?: string; dueDay?: number })
      blocks.push({
        type: 'recurring',
        recurringId: (rec as { id?: string }).id ?? (r as { id?: string }).id ?? 'rec',
        label: (rec as { name?: string }).name ?? 'Recorrência',
        amountInCents: (rec as { amountCents?: number }).amountCents ?? 0,
        dueLabel: (rec as { dueDay?: number }).dueDay ? `Dia ${ (rec as { dueDay?: number }).dueDay}` : 'Recorrente',
      } as AiVisualBlock)
    } else if (tc.name === 'getFinancialSummary' || tc.name === 'getSpendingAnalysis') {
      const data = r as { totalFormatted?: string; breakdown?: Array<{ category?: string; title?: string; formatted?: string; cents?: number; percent?: number }> }
      if (data.breakdown || (r as { anomalies?: unknown[] }).anomalies) {
        const items = (data.breakdown as Array<{ category?: string; formatted?: string }>) ?? []
        blocks.push({
          type: 'transactions',
          title: 'Análise por categoria',
          items: items.slice(0, 5).map((it, idx) => ({
            id: String(idx),
            description: (it as { category?: string; title?: string }).category ?? (it as { title?: string }).title ?? 'Item',
            amountCents: (it as { cents?: number }).cents ?? 0,
            category: (it as { category?: string }).category ?? '',
            date: '',
          })),
          maxItems: 5,
          actions: [{ type: 'open-transactions', label: 'Ver todas' }],
        } as AiVisualBlock)
      } else if (data.totalFormatted) {
        blocks.push({
          type: 'metric',
          title: 'Resumo financeiro',
          value: data.totalFormatted,
          subtitle: (r as { message?: string }).message as string | undefined,
        } as AiVisualBlock)
      }
    } else if (tc.name === 'getCashFlowForecast') {
      const data = r as { summary?: { endBalance?: string; minBalance?: string }; points?: Array<{ label?: string; value?: number }> }
      if (data.points) {
        blocks.push({
          type: 'chart',
          title: 'Previsão próximos dias',
          chartType: 'line',
          data: data.points.slice(0, 12).map(p => ({ label: p.label ?? '', value: p.value ?? 0 })),
        } as AiVisualBlock)
      }
    } else if (tc.name === 'preparePaymentAllocationPlan' || tc.name === 'getPaymentAllocationPlan') {
      const plan = (r as { plan?: { items?: Array<{ label: string; amountInCents: number; type: string }>; receivedAmountInCents?: number; period?: string } }).plan ?? r as unknown as { items?: unknown[] }
      if (plan && (plan as { items?: unknown[] }).items) {
        const p = plan as { items: Array<{ label: string; amountInCents: number; type: string }>; receivedAmountInCents?: number; id?: string }
        blocks.push({
          type: 'plan',
          title: 'Organização sugerida',
          items: p.items.slice(0, 6).map(it => ({ label: it.label, amountCents: it.amountInCents, type: it.type })),
          actions: [
            { type: 'edit-plan', label: 'Editar' },
            { type: 'apply-plan', label: 'Aplicar' },
          ],
        } as AiVisualBlock)
        if (!speech) {
          const livre = (r as { plan?: { freeAmountInCents?: number } }).plan?.freeAmountInCents
          speech = livre !== undefined ? `Preparei sua organização. ${money(livre)} permanecem livres.` : 'Organização preparada.'
        }
      }
    } else if (tc.name === 'getSafeDailySpend' || tc.name === 'simulateDailySpend') {
      const data = r as { safeDaily?: string; remainingToday?: string; freeMoney?: string; amount?: string; freeBefore?: string; freeAfter?: string; newDaily?: string; message?: string }
      blocks.push({
        type: 'metric',
        title: tc.name === 'simulateDailySpend' ? 'Simulação' : 'Quanto posso gastar hoje',
        value: data.remainingToday ?? data.safeDaily ?? data.newDaily ?? '—',
        subtitle: data.freeMoney ? `Dinheiro livre ${data.freeMoney}` : data.message,
      } as AiVisualBlock)
    } else if (tc.name === 'getTransactions' || tc.name === 'getTransactionsByCategory' || tc.name === 'getTransactionsByPeriod') {
      const data = r as { transactions?: Array<{ id?: string; description?: string; amountCents?: number; amount?: string; category?: string; date?: string; type?: string }>; count?: number }
      const list = (data.transactions ?? []) as Array<{ id?: string; description?: string; amountCents?: number; amount?: string; category?: string; date?: string; type?: string }>
      if (list.length) {
        const toCents = (tx: { amountCents?: number; amount?: string }) => {
          if (typeof tx.amountCents === 'number') return tx.amountCents
          if (typeof tx.amount === 'string') { try { return parseMoney(tx.amount) } catch { return 0 } }
          return 0
        }
        blocks.push({
          type: 'transactions',
          title: list.length === 1 ? 'Lançamento encontrado' : `Lançamentos (${list.length})`,
          items: list.slice(0, 5).map(tx => ({
            id: tx.id ?? uid(),
            description: tx.description ?? 'Movimentação',
            amountCents: toCents(tx as any),
            category: tx.category ?? '',
            date: tx.date ?? '',
            type: (tx.type as 'income'|'expense'|'transfer') ?? 'expense',
          })),
          maxItems: 5,
          actions: [{ type: 'open-transactions', label: 'Ver todas' }],
        } as AiVisualBlock)
        if (!speech) speech = `Encontrei ${list.length} lançamento${list.length>1?'s':''}.`
      }
    }
  }

  // Sem fallback "Resposta": quando não há toolCalls, o bubble já exibe `content`
  // criar um metric duplicado (content.slice 0-120) gerava duplicação visual
  // (bubble + card "Resposta" com mesmo texto). Mantém blocks vazio.

  // Ações contextuais (01:76) — 2-3 sugestões reais
  if (!actions.length && blocks.length) {
    const lastBlock = blocks[blocks.length - 1]
    if (lastBlock.type === 'transactions') {
      actions.push({ type: 'open-transactions', label: 'Ver todas' })
    } else if (lastBlock.type === 'plan') {
      actions.push({ type: 'apply-plan', label: 'Aplicar' })
    }
  }

  return {
    speech,
    text: content.slice(0, 800),
    summary: content.slice(0, 160),
    blocks: blocks.slice(0, 4), // 01:54 máx 1 dashboard + 1 complementar + ações
    actions: actions.slice(0, 3),
  }
}
