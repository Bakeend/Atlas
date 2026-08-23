import { categories } from '../domain'

export type ImportTransactionType = 'income' | 'expense'
export type ImportSource = 'csv' | 'ofx'

export interface ParsedImportRow {
  id: string // temp id for UI
  date: string // YYYY-MM-DD
  description: string
  rawDescription: string
  amountCents: number
  type: ImportTransactionType
  suggestedCategory: string
  source: ImportSource
  duplicate?: boolean
  invalidReason?: string
}

// ---- helpers ----
function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function normalizeAmount(value: string): number {
  if (!value) return 0
  // Remove R$, spaces, keep digits , . -
  let s = value.trim()
  // Handle (1.234,56) as negative
  let negativeParens = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negativeParens = true
    s = s.slice(1, -1)
  }
  // Keep only digits, , . -
  s = s.replace(/[^0-9,\-\.]/g, '')
  // If both . and , present: . is thousand, , is decimal
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    // only comma -> decimal
    s = s.replace(',', '.')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  let cents = Math.round(n * 100)
  if (negativeParens) cents = -Math.abs(cents)
  return cents
}

function parseDateBr(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  // OFX: 20260822120000 or 20260822
  if (/^\d{8}(\d{6})?/.test(v.replace(/\[.*\]/, ''))) {
    const d = v.slice(0, 8)
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  }
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const m = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
  if (m) {
    const day = m[1].padStart(2, '0')
    const month = m[2].padStart(2, '0')
    let year = m[3]
    if (year.length === 2) year = `20${year}`
    // basic validation
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${year}-${month}-${day}`
    }
  }
  // Try Date parse fallback (MM/DD/YYYY)
  const d = new Date(v)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return null
}

function suggestCategory(text: string): string {
  const t = text.toLowerCase()
  if (/aliment|mercado|supermerc|padaria|restaurante|ifood|rappi/.test(t)) return 'Alimentação'
  if (/moradia|aluguel|condominio|condomínio|iptu|energia|luz|agua|água|gas\b|internet|vivo|claro|tim/.test(t)) return 'Moradia'
  if (/transporte|uber|99|combust|posto|gasolina|etanol|metro|onibus|ônibus|transporte/.test(t)) return 'Transporte'
  if (/saude|saúde|farmacia|farmácia|drogaria|hospital|medico|médico|clinica|clínica/.test(t)) return 'Saúde'
  if (/lazer|cinema|netflix|spotify|prime|hbo|disney|steam|jogo|bar|balada|festa/.test(t)) return 'Lazer'
  if (/educacao|educação|escola|faculdade|curso|udemy|alura/.test(t)) return 'Educação'
  if (/assinatura|stream|tv|globoplay|youtube premium|icloud|google one/.test(t)) return 'Assinaturas'
  return 'Outros'
}

function detectType(description: string, amountCents: number, trnType?: string): ImportTransactionType {
  const d = description.toLowerCase()
  if (trnType) {
    const t = trnType.toUpperCase()
    if (t === 'CREDIT' || t === 'DEP' || t === 'XFER' && amountCents > 0) return 'income'
    if (t === 'DEBIT' || t === 'CHECK' || t === 'PAYMENT') return 'expense'
  }
  if (/pix recebido|pix.*recebido|recebido|dep[oó]sito|sal[aá]rio|rendimento|estorno.*credito|crédito recebido/.test(d)) return 'income'
  if (/pix enviado|pix.*enviado|enviado|pagamento|compra|d[eé]bito|ted enviada|doc enviado/.test(d)) return 'expense'
  // fallback by sign: banks export negative for expense
  return amountCents < 0 ? 'expense' : 'income'
}

function cleanDescription(raw: string): string {
  // OFX/CSV PIX descriptions are noisy: "PIX ENVIADO - JOAO SILVA 11:32"
  // Clean but keep recognizable
  let s = raw.trim().replace(/\s+/g, ' ')
  // Remove time at end
  s = s.replace(/\s\d{1,2}:\d{2}(:\d{2})?\s*$/, '')
  // Limit length
  if (s.length > 80) s = s.slice(0, 80)
  // Title case-ish: keep as is, just trim
  return s || 'Movimentação PIX'
}

// ---- CSV ----
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] ?? ''
  const semicolon = (firstLine.match(/;/g) || []).length
  const comma = (firstLine.match(/,/g) || []).length
  return semicolon > comma ? ';' : ','
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      result.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result.map(s => s.trim().replace(/^"|"$/g, '').trim())
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
  for (const cand of candidates) {
    const c = cand.toLowerCase()
    const idx = normalized.findIndex(h => h === c || h.includes(c))
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

  // Detect header: if first line has letters and no valid date/amount pattern
  const firstCells = splitCsvLine(lines[0], delimiter)
  const hasHeader = firstCells.some(c => /data|descricao|descri|historico|lan[cç]amento|valor|amount|date|description|memo|extrato/i.test(c))
  const headers = hasHeader ? firstCells : []
  const dataLines = hasHeader ? lines.slice(1) : lines

  let dateIdx = -1, descIdx = -1, amountIdx = -1
  if (hasHeader) {
    dateIdx = findColumnIndex(headers, ['data', 'date', 'dt', 'data lancamento', 'data lançamento'])
    descIdx = findColumnIndex(headers, ['descricao', 'descri', 'historico', 'historico', 'lancamento', 'lançamento', 'description', 'memo', 'discriminacao'])
    amountIdx = findColumnIndex(headers, ['valor', 'amount', 'quantia'])
  }
  // fallback heuristics if no header or not found
  // Heuristic: first column that looks like date, last that looks like money
  function fallbackIndexes(cells: string[]) {
    let dIdx = dateIdx, aIdx = amountIdx, descI = descIdx
    if (dIdx === -1) {
      dIdx = cells.findIndex(c => parseDateBr(c) !== null)
      if (dIdx === -1) dIdx = 0
    }
    if (aIdx === -1) {
      // find cell with money pattern
      for (let i = cells.length - 1; i >= 0; i--) {
        if (/^-?R?\$?\s*\(?[\d\.,]+\)?$/.test(cells[i].trim()) && /[\d]/.test(cells[i])) { aIdx = i; break }
      }
      if (aIdx === -1) aIdx = cells.length - 1
    }
    if (descI === -1) {
      // description is usually the column not date/amount, with most text
      let best = -1, bestLen = -1
      for (let i = 0; i < cells.length; i++) {
        if (i === dIdx || i === aIdx) continue
        if (cells[i].length > bestLen) { bestLen = cells[i].length; best = i }
      }
      descI = best !== -1 ? best : 1
    }
    return { dIdx, aIdx, descI }
  }

  const rows: ParsedImportRow[] = []
  for (const line of dataLines) {
    if (!line.trim()) continue
    const cells = splitCsvLine(line, delimiter)
    if (cells.length < 2) continue
    // skip totals / saldo lines
    const joinedLower = cells.join(' ').toLowerCase()
    if (/saldo\s*(anterior|atual|total)/.test(joinedLower) && cells.length <= 3) continue

    const { dIdx, aIdx, descI } = fallbackIndexes(cells)
    const rawDate = cells[dIdx] ?? ''
    const rawDesc = cells[descI] ?? cells[1] ?? cells[0]
    const rawAmount = cells[aIdx] ?? ''

    const date = parseDateBr(rawDate)
    const amountRaw = normalizeAmount(rawAmount)
    // Some CSV export amount without sign, but description indicates debit
    // Keep signed amount; later absolute for cents + type
    const description = cleanDescription(rawDesc)

    if (!date) {
      rows.push({
        id: uid(), date: '', description, rawDescription: rawDesc, amountCents: 0, type: 'expense', suggestedCategory: 'Outros', source: 'csv',
        invalidReason: `Data inválida: "${rawDate}"`
      })
      continue
    }
    if (amountRaw === 0 && rawAmount.trim() !== '0' && rawAmount.trim() !== '0,00') {
      // try to find amount in other column if current was not money
      let found = false
      for (let i = 0; i < cells.length; i++) {
        if (i === dIdx || i === descI) continue
        const alt = normalizeAmount(cells[i])
        if (alt !== 0) { found = true; break }
      }
      if (!found) {
        rows.push({
          id: uid(), date, description, rawDescription: rawDesc, amountCents: 0, type: 'expense', suggestedCategory: suggestCategory(description), source: 'csv',
          invalidReason: `Valor inválido: "${rawAmount}"`
        })
        continue
      }
    }

    const type = detectType(rawDesc, amountRaw)
    const absCents = Math.abs(amountRaw)
    if (absCents === 0) {
      rows.push({
        id: uid(), date, description, rawDescription: rawDesc, amountCents: 0, type, suggestedCategory: suggestCategory(description), source: 'csv',
        invalidReason: 'Valor zero'
      })
      continue
    }
    // Validate category
    let cat = suggestCategory(description)
    if (!categories.includes(cat)) cat = 'Outros'

    rows.push({
      id: uid(), date, description, rawDescription: rawDesc, amountCents: absCents, type, suggestedCategory: cat, source: 'csv'
    })
  }
  return rows
}

// ---- OFX ----
export function parseOfx(text: string): ParsedImportRow[] {
  const cleaned = text.replace(/^\uFEFF/, '')
  // OFX is SGML, not strict XML. Extract STMTTRN blocks
  const trnBlocks = [...cleaned.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map(m => m[1])
  // fallback: if no closing tag variant like <STMTTRN> without </STMTTRN>, split by <STMTTRN>
  const blocks = trnBlocks.length ? trnBlocks : cleaned.split(/<STMTTRN>/gi).slice(1).map(s => s.split(/<\/STMTTRN>/i)[0])

  const rows: ParsedImportRow[] = []
  for (const block of blocks) {
    const getTag = (tag: string) => {
      const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')
      const m = block.match(re)
      return m ? m[1].trim() : ''
    }
    const trnType = getTag('TRNTYPE')
    const dtPosted = getTag('DTPOSTED')
    const trnAmtRaw = getTag('TRNAMT')
    const fitId = getTag('FITID')
    const name = getTag('NAME')
    const memo = getTag('MEMO')
    const checkNum = getTag('CHECKNUM')

    const rawDesc = (memo || name || fitId || checkNum || 'Movimentação').trim()
    const date = parseDateBr(dtPosted)
    const amountRaw = normalizeAmount(trnAmtRaw) // TRNAMT has sign

    if (!date) {
      rows.push({
        id: uid(), date: '', description: cleanDescription(rawDesc), rawDescription: rawDesc, amountCents: 0, type: 'expense', suggestedCategory: 'Outros', source: 'ofx',
        invalidReason: `DTPOSTED inválido: "${dtPosted}"`
      })
      continue
    }
    if (amountRaw === 0 && trnAmtRaw.trim() !== '0') {
      rows.push({
        id: uid(), date, description: cleanDescription(rawDesc), rawDescription: rawDesc, amountCents: 0, type: 'expense', suggestedCategory: 'Outros', source: 'ofx',
        invalidReason: `TRNAMT inválido: "${trnAmtRaw}"`
      })
      continue
    }
    const absCents = Math.abs(amountRaw)
    const type = detectType(rawDesc, amountRaw, trnType)
    const description = cleanDescription(rawDesc)
    let cat = suggestCategory(description)
    if (!categories.includes(cat)) cat = 'Outros'

    rows.push({
      id: uid(), date, description, rawDescription: rawDesc, amountCents: absCents, type, suggestedCategory: cat, source: 'ofx'
    })
  }
  return rows
}

export function detectSource(fileName: string, content: string): ImportSource {
  const name = fileName.toLowerCase()
  if (name.endsWith('.ofx') || name.endsWith('.qfx') || content.includes('<OFX') || content.includes('<STMTTRN>')) return 'ofx'
  return 'csv'
}

export function parseImportFile(fileName: string, content: string): ParsedImportRow[] {
  const source = detectSource(fileName, content)
  return source === 'ofx' ? parseOfx(content) : parseCsv(content)
}

// ---- deduplication ----
function normalizeKey(description: string) {
  return description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function buildDuplicateKey(date: string, amountCents: number, description: string) {
  return `${date}|${amountCents}|${normalizeKey(description).slice(0, 40)}`
}

export function markDuplicates(rows: ParsedImportRow[], existingKeys: Set<string>) {
  const seen = new Set<string>()
  return rows.map(row => {
    if (row.invalidReason) return row
    const key = buildDuplicateKey(row.date, row.amountCents, row.description)
    // also try rawDescription key for existing transactions that may have slightly different cleaning
    const rawKey = buildDuplicateKey(row.date, row.amountCents, row.rawDescription)
    const isDup = existingKeys.has(key) || existingKeys.has(rawKey) || seen.has(key)
    seen.add(key)
    return isDup ? { ...row, duplicate: true } : row
  })
}
