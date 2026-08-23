import { describe, expect, it } from 'vitest'
import { parseCsv, parseOfx, buildDuplicateKey, markDuplicates, parseImportFile } from '../import/parse'

describe('import parse', () => {
  it('parseCsv semicolon BR', () => {
    const csv = `Data;Descricao;Valor
22/08/2026;PIX ENVIADO - MERCADO CENTRAL;-78,60
22/08/2026;PIX RECEBIDO - MARIA SOUZA;6200,00
23/08/2026;Compra Cartao - UBER; -15,90
`
    const rows = parseCsv(csv)
    expect(rows.length).toBe(3)
    expect(rows[0].date).toBe('2026-08-22')
    expect(rows[0].amountCents).toBe(7860)
    expect(rows[0].type).toBe('expense')
    expect(rows[0].description).toContain('MERCADO')
    expect(rows[1].type).toBe('income')
    expect(rows[1].amountCents).toBe(620000)
    expect(rows[2].suggestedCategory).toBe('Transporte')
  })

  it('parseCsv comma US', () => {
    const csv = `Date,Description,Amount
2026-08-22,PIX RECEBIDO SALARIO,6200.00
2026-08-23,Supermarket,78.60
`
    const rows = parseCsv(csv)
    expect(rows.length).toBe(2)
    expect(rows[0].amountCents).toBe(620000)
  })

  it('parseOfx DEBIT CREDIT', () => {
    const ofx = `
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260822<TRNAMT>-78.60<MEMO>PIX ENVIADO - MERCADO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260822120000<TRNAMT>6200.00<MEMO>PIX RECEBIDO - SALARIO</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`
    const rows = parseOfx(ofx)
    expect(rows.length).toBe(2)
    expect(rows[0].type).toBe('expense')
    expect(rows[1].type).toBe('income')
    expect(rows[0].date).toBe('2026-08-22')
  })

  it('deduplication', () => {
    const row = { id: '1', date: '2026-08-22', description: 'Pix - Mercado', rawDescription: 'PIX ENVIADO - MERCADO', amountCents: 7860, type: 'expense' as const, suggestedCategory: 'Outros', source: 'csv' as const }
    const keys = new Set([buildDuplicateKey('2026-08-22', 7860, 'Pix - Mercado')])
    const marked = markDuplicates([row], keys)
    expect(marked[0].duplicate).toBe(true)
  })

  it('detect file type', () => {
    expect(parseImportFile('extrato.ofx', '<OFX>')).toHaveLength(0)
    expect(parseImportFile('extrato.csv', 'Data;Valor\n22/08/2026;10,00')).toHaveLength(1)
  })
})
