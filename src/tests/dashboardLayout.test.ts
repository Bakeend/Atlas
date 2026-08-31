import { describe, expect, it } from 'vitest'
import { DASHBOARD_WIDGETS, sanitizeDashboardWidgets } from '../dashboardLayout'

describe('sanitizeDashboardWidgets', () => {
  it('descarta dados inválidos e completa os blocos ausentes', () => {
    expect(sanitizeDashboardWidgets([{ key: 'chart', visible: false }, { key: 'desconhecido', visible: true }])).toEqual(
      DASHBOARD_WIDGETS.map(widget => ({ key: widget.key, visible: widget.key !== 'chart' })),
    )
  })

  it('preserva a ordem escolhida pela pessoa', () => {
    expect(sanitizeDashboardWidgets([{ key: 'recent', visible: true }, { key: 'balance', visible: false }])?.slice(0, 2)).toEqual([
      { key: 'recent', visible: true },
      { key: 'balance', visible: false },
    ])
  })

  it('não aceita preferências sem nenhum bloco válido', () => {
    expect(sanitizeDashboardWidgets([{ key: 'chart', visible: 'sim' }])).toBeUndefined()
  })
})
