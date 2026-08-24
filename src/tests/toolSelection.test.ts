import { describe, it, expect } from 'vitest'
import { selectToolsForMessage } from '../ai/tools/toolSelection'
import { openRouterTools } from '../ai/tools/registry'

describe('AI — Seleção de tools por intenção (custo)', () => {
  it('seleção nunca fica vazia e nunca excede o catálogo total', () => {
    const total = openRouterTools.length
    for (const message of ['', 'oi', 'gastei 50 reais', 'organizar pagamento', 'previsão de saldo']) {
      const selected = selectToolsForMessage(message)
      expect(selected.length).toBeGreaterThan(0)
      expect(selected.length).toBeLessThanOrEqual(total)
    }
  })

  it('mensagem genérica envia apenas o núcleo enxuto', () => {
    const selected = selectToolsForMessage('tudo bem?')
    expect(selected.length).toBeLessThan(openRouterTools.length)
    const names = selected.map(tool => tool.function.name)
    expect(names).toContain('getFinancialSummary')
    expect(names).toContain('createTransaction')
  })

  it('pedido de registro de despesa inclui escrita de transação', () => {
    const names = selectToolsForMessage('Gastei R$ 50 no mercado hoje').map(tool => tool.function.name)
    expect(names).toContain('createTransaction')
  })

  it('organizar pagamento traz as tools do plano de pagamento', () => {
    const names = selectToolsForMessage('Recebi meu salário, organiza meu pagamento até o próximo').map(tool => tool.function.name)
    expect(names).toContain('preparePaymentAllocationPlan')
    expect(names).toContain('applyPaymentAllocationPlan')
  })

  it('núcleo nunca inclui tools destrutivas sem intenção explícita', () => {
    const names = selectToolsForMessage('oi').map(tool => tool.function.name)
    expect(names).not.toContain('deleteTransaction')
    expect(names).not.toContain('deleteGoal')
  })
})
