import { categories } from '../domain'

export type ImportTransactionType = 'income' | 'expense' | 'transfer'
export type ImportSource = 'csv' | 'ofx'

export interface ParsedImportRow {
  id: string
  date: string
  description: string
  rawDescription: string
  amountCents: number
  type: ImportTransactionType
  suggestedCategory: string
  source: ImportSource
  externalId?: string
  duplicate?: boolean
  invalidReason?: string
}

function uid() { return Math.random().toString(36).slice(2, 9) }

function normalizeAmount(value: string): number {
  if (!value) return 0
  let s = value.trim()
  let negativeParens = false
  if (s.startsWith('(') && s.endsWith(')')) { negativeParens = true; s = s.slice(1, -1) }
  s = s.replace(/[^0-9,\-\.]/g, '')
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  let cents = Math.round(n * 100)
  if (negativeParens) cents = -Math.abs(cents)
  return cents
}

function parseDateBr(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  if (/^\d{8}(\d{6})?/.test(v.replace(/\[.*\]/, ''))) {
    const d = v.slice(0, 8)
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  }
  const m = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
  if (m) {
    const day = m[1].padStart(2, '0')
    const month = m[2].padStart(2, '0')
    let year = m[3]
    if (year.length === 2) year = `20${year}`
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) return `${year}-${month}-${day}`
  }
  const d = new Date(v)
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return null
}

function suggestCategory(text: string): string {
  const t = text.toLowerCase()
  if (/aliment|mercado|supermerc|padaria|restaurante|ifood|rappi/.test(t)) return 'Alimentação'
  if (/moradia|aluguel|condominio|condomínio|iptu|energia|luz|agua|água|gas\b|internet|vivo|claro|tim/.test(t)) return 'Moradia'
  if (/transporte|uber|99|combust|posto|gasolina|etanol|metro|onibus|ônibus/.test(t)) return 'Transporte'
  if (/saude|saúde|farmacia|farmácia|drogaria|hospital|medico|médico|clinica|clínica/.test(t)) return 'Saúde'
  if (/lazer|cinema|netflix|spotify|prime|hbo|disney|steam|jogo|bar|balada|festa/.test(t)) return 'Lazer'
  if (/educacao|educação|escola|faculdade|curso|udemy|alura/.test(t)) return 'Educação'
  if (/assinatura|stream|tv|globoplay|youtube premium|icloud|google one/.test(t)) return 'Assinaturas'
  return 'Outros'
}

function looksLikeTransfer(description: string, trnType?: string) {
  if (trnType?.toUpperCase() === 'XFER') return true
  return /\b(transfer[eê]ncia|transf\.?|ted|doc|pix)\b.*\b(mesma titularidade|minha conta|entre contas)\b/i.test(description)
}

function detectType(description: string, amountCents: number, trnType?: string): ImportTransactionType {
  const d = description.toLowerCase()
  if (looksLikeTransfer(description, trnType)) return 'transfer'
  if (trnType) {
    const t = trnType.toUpperCase()
    if (t === 'CREDIT' || t === 'DEP') return 'income'
    if (t === 'DEBIT' || t === 'CHECK' || t === 'PAYMENT') return 'expense'
  }
  if (/pix recebido|pix.*recebido|recebido|dep[oó]sito|sal[aá]rio|rendimento|estorno.*credito|crédito recebido/.test(d)) return 'income'
  if (/pix enviado|pix.*enviado|enviado|pagamento|compra|d[eé]bito|ted enviada|doc enviado/.test(d)) return 'expense'
  return amountCents < 0 ? 'expense' : 'income'
}

function cleanDescription(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ')
  s = s.replace(/\s\d{1,2}:\d{2}(:\d{2})?\s*$/, '')
  if (s.length > 80) s = s.slice(0, 80)
  return s || 'Movimentação'
}

function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] ?? ''
  return (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let cur = ''; let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) { result.push(cur); cur = '' } else cur += ch
  }
  result.push(cur)
  return result.map(s => s.trim().replace(/^"|"$/g, '').trim())
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
  for (const cand of candidates) {
    const idx = normalized.findIndex(h => h === cand.toLowerCase() || h.includes(cand.toLowerCase()))
    if (idx !== -1) return idx
  }
  return -1
}

export function parseCsv(text: string): ParsedImportRow[] {
  const cleaned = text.replace(/^\uFEFF/, '').trim()
  if (!cleaned) return []
  const delimiter = detectDelimiter(cleaned)
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (!lines.length) return []
  const firstCells = splitCsvLine(lines[0], delimiter)
  const hasHeader = firstCells.some(c => /data|descricao|descri|historico|lan[cç]amento|valor|amount|date|description|memo|extrato/i.test(c))
  const headers = hasHeader ? firstCells : []
  const dataLines = hasHeader ? lines.slice(1) : lines
  let dateIdx = -1, descIdx = -1, amountIdx = -1
  if (hasHeader) {
    dateIdx = findColumnIndex(headers, ['data', 'date', 'dt', 'data lancamento', 'data lançamento'])
    descIdx = findColumnIndex(headers, ['descricao', 'descri', 'historico', 'lancamento', 'lançamento', 'description', 'memo', 'discriminacao'])
    amountIdx = findColumnIndex(headers, ['valor', 'amount', 'quantia'])
  }
  function fallbackIndexes(cells: string[]) {
    let dIdx = dateIdx, aIdx = amountIdx, descI = descIdx
    if (dIdx === -1) { dIdx = cells.findIndex(c => parseDateBr(c) !== null); if (dIdx === -1) dIdx = 0 }
    if (aIdx === -1) {
      for (let i = cells.length - 1; i >= 0; i--) if (/^-?R?\$?\s*\(?[\d\.,]+\)?$/.test(cells[i].trim()) && /[\d]/.test(cells[i])) { aIdx = i; break }
      if (aIdx === -1) aIdx = cells.length - 1
    }
    if (descI === -1) {
      let best = -1, bestLen = -1
      for (let i = 0; i < cells.length; i++) if (i !== dIdx && i !== aIdx && cells[i].length > bestLen) { bestLen = cells[i].length; best = i }
      descI = best !== -1 ? best : 1
    }
    return { dIdx, aIdx, descI }
  }
  const rows: ParsedImportRow[] = []
  for (const line of dataLines) {
    if (!line.trim()) continue
    const cells = splitCsvLine(line, delimiter)
    if (cells.length < 2) continue
    const joinedLower = cells.join(' ').toLowerCase()
    if (/saldo\s*(anterior|atual|total)/.test(joinedLower) && cells.length <= 3) continue
    const { dIdx, aIdx, descI } = fallbackIndexes(cells)
    const rawDate = cells[dIdx] ?? ''; const rawDesc = cells[descI] ?? cells[1] ?? cells[0]; const rawAmount = cells[aIdx] ?? ''
    const date = parseDateBr(rawDate); const amountRaw = normalizeAmount(rawAmount); const description = cleanDescription(rawDesc)
    if (!date) { rows.push({ id: uid(), date: '', description, rawDescription: rawDesc, amountCents: 0, type: 'expense', suggestedCategory: 'Outros', source: 'csv', invalidReason: `Data inválida: "${rawDate}"` }); continue }
    const absCents = Math.abs(amountRaw)
    if (!absCents) { rows.push({ id: uid(), date, description, rawDescription: rawDesc, amountCents: 0, type: 'expense', suggestedCategory: suggestCategory(description), source: 'csv', invalidReason: `Valor inválido: "${rawAmount}"` }); continue }
    const type = detectType(rawDesc, amountRaw)
    let cat = suggestCategory(description); if (!categories.includes(cat)) cat = 'Outros'
    rows.push({ id: uid(), date, description, rawDescription: rawDesc, amountCents: absCents, type, suggestedCategory: cat, source: 'csv', invalidReason: type === 'transfer' ? 'Transferência entre contas detectada: confirme origem e destino manualmente.' : undefined })
  }
  return rows
}

export function parseOfx(text: string): ParsedImportRow[] {
  const cleaned = text.replace(/^\uFEFF/, '')
  const trnBlocks = [...cleaned.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map(m => m[1])
  const blocks = trnBlocks.length ? trnBlocks : cleaned.split(/<STMTTRN>/gi).slice(1).map(s => s.split(/<\/STMTTRN>/i)[0])
  const rows: ParsedImportRow[] = []
  for (const block of blocks) {
    const getTag = (tag: string) => { const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : '' }
    const trnType = getTag('TRNTYPE'); const dtPosted = getTag('DTPOSTED'); const trnAmtRaw = getTag('TRNAMT'); const fitId = getTag('FITID'); const name = getTag('NAME'); const memo = getTag('MEMO'); const checkNum = getTag('CHECKNUM')
    const rawDesc = (memo || name || fitId || checkNum || 'Movimentação').trim(); const date = parseDateBr(dtPosted); const amountRaw = normalizeAmount(trnAmtRaw); const description = cleanDescription(rawDesc)
    if (!date) { rows.push({ id: uid(), date: '', description, rawDescription: rawDesc, amountCents: 0, type: 'expense', suggestedCategory: 'Outros', source: 'ofx', externalId: fitId || undefined, invalidReason: `DTPOSTED inválido: "${dtPosted}"` }); continue }
    const absCents = Math.abs(amountRaw)
    if (!absCents) { rows.push({ id: uid(), date, description, rawDescription: rawDesc, amountCents: 0, type: 'expense', suggestedCategory: 'Outros', source: 'ofx', externalId: fitId || undefined, invalidReason: `TRNAMT inválido: "${trnAmtRaw}"` }); continue }
    const type = detectType(rawDesc, amountRaw, trnType)
    let cat = suggestCategory(description); if (!categories.includes(cat)) cat = 'Outros'
    rows.push({ id: uid(), date, description, rawDescription: rawDesc, amountCents: absCents, type, suggestedCategory: cat, source: 'ofx', externalId: fitId || undefined, invalidReason: type === 'transfer' ? 'Transferência entre contas detectada: confirme origem e destino manualmente.' : undefined })
  }
  return rows
}

export function detectSource(fileName: string, content: string): ImportSource {
  const name = fileName.toLowerCase()
  if (name.endsWith('.ofx') || name.endsWith('.qfx') || content.includes('<OFX') || content.includes('<STMTTRN>')) return 'ofx'
  return 'csv'
}

export function parseImportFile(fileName: string, content: string): ParsedImportRow[] {
  return detectSource(fileName, content) === 'ofx' ? parseOfx(content) : parseCsv(content)
}

function normalizeKey(description: string) {
  return description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function buildDuplicateKey(date: string, amountCents: number, description: string, accountId = '', externalId?: string) {
  if (externalId) return `${accountId}|external:${externalId}`
  return `${accountId}|${date}|${amountCents}|${normalizeKey(description).slice(0, 40)}`
}

export function markDuplicates(rows: ParsedImportRow[], existingKeys: Set<string>, accountId = '') {
  const seen = new Set<string>()
  return rows.map(row => {
    if (row.invalidReason) return row
    const key = buildDuplicateKey(row.date, row.amountCents, row.description, accountId, row.externalId)
    const rawKey = buildDuplicateKey(row.date, row.amountCents, row.rawDescription, accountId, row.externalId)
    const isDup = existingKeys.has(key) || existingKeys.has(rawKey) || seen.has(key)
    seen.add(key)
    return isDup ? { ...row, duplicate: true } : row
  })
}
