import type { FinanceData } from '../domain'
import { emptyData } from '../domain'

const TABLE = 'finance_data'
const KEY = 'finance-data'
const LS_KEY = 'atlas-sql-finance-data'
const LS_META_KEY = 'atlas-sql-meta'

// In-memory fallback for tests / SSR onde window/localStorage não existe
const memoryStore = new Map<string, string>()

let alasql: any = null
let initialized = false
let useAlasql = false

async function getAlasql(): Promise<any> {
  if (alasql !== null) return alasql
  if (typeof window === 'undefined') return null
  try {
    const mod = await import('alasql')
    alasql = (mod as any).default ?? mod
    return alasql
  } catch {
    alasql = null
    return null
  }
}

async function ensureTable(): Promise<void> {
  if (initialized) return
  const a = await getAlasql()
  if (!a) {
    initialized = true
    return
  }
  try {
    // Tenta usar INDEXEDDB para suportar dados maiores que localStorage (5MB)
    // Fallback para LOCALSTORAGE se INDEXEDDB falhar
    let dbType = 'INDEXEDDB'
    try {
      a('CREATE INDEXEDDB DATABASE IF NOT EXISTS atlas')
      a('ATTACH INDEXEDDB DATABASE atlas')
      a('USE atlas')
    } catch {
      dbType = 'LOCALSTORAGE'
      a('CREATE LOCALSTORAGE DATABASE IF NOT EXISTS atlas')
      a('ATTACH LOCALSTORAGE DATABASE atlas')
      a('USE atlas')
    }
    // Cria tabela chave-valor
    try {
      a(`CREATE TABLE IF NOT EXISTS ${TABLE} (k STRING PRIMARY KEY, v TEXT, updated_at STRING)`)
    } catch {
      // tabela já existe ou sintaxe alternativa
      try {
        a(`CREATE TABLE IF NOT EXISTS ${TABLE} (k STRING, v TEXT, updated_at STRING)`)
      } catch {}
    }
    useAlasql = true
    initialized = true
    // eslint-disable-next-line no-console
    console.debug(`[SQL] inicializado com ${dbType}`)
  } catch (e) {
    // fallback para localStorage puro
    initialized = true
    useAlasql = false
  }
}

function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

// Fallback direto para localStorage / memória quando alasql não disponível
function lsGet(): string | null {
  if (isLocalStorageAvailable()) {
    try {
      return window.localStorage.getItem(LS_KEY)
    } catch {
      return null
    }
  }
  return memoryStore.get(LS_KEY) ?? null
}

function lsSet(value: string): void {
  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.setItem(LS_KEY, value)
      window.localStorage.setItem(LS_META_KEY, new Date().toISOString())
      return
    } catch {}
  }
  memoryStore.set(LS_KEY, value)
}

// Migração do IndexedDB legado (antigo indexedDbRepository)
async function loadFromLegacyIndexedDb(): Promise<FinanceData | null> {
  if (typeof indexedDB === 'undefined') return null
  const DB_NAME = 'atlas-finance'
  const STORE = 'state'
  const LEGACY_KEY = 'finance-data'
  try {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const result: FinanceData | null = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(LEGACY_KEY)
      req.onsuccess = () => resolve((req.result as FinanceData) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result
  } catch {
    return null
  }
}

export interface FinanceRepository {
  load(): Promise<FinanceData>
  save(data: FinanceData): Promise<void>
  // exposto para debug / auditoria
  getStorageInfo(): Promise<{ engine: string; hasData: boolean }>
}

export const sqlRepository: FinanceRepository & { _memoryStoreForTests?: Map<string, string> } = {
  async load(): Promise<FinanceData> {
    await ensureTable()

    // 1) Tenta SQL via alasql
    if (useAlasql && alasql) {
      try {
        const rows: any[] = alasql(`SELECT v FROM ${TABLE} WHERE k = ?`, [KEY])
        if (rows && rows.length > 0 && rows[0].v) {
          const parsed = JSON.parse(rows[0].v) as FinanceData
          // também espelha em localStorage para fallback rápido
          lsSet(rows[0].v)
          return parsed
        }
      } catch (e) {
        // continua para fallback
      }
    }

    // 2) Fallback localStorage / memória
    const lsRaw = lsGet()
    if (lsRaw) {
      try {
        const parsed = JSON.parse(lsRaw) as FinanceData
        // se veio do LS mas SQL estava vazio, hidrata SQL
        if (useAlasql && alasql) {
          try {
            alasql(`DELETE FROM ${TABLE} WHERE k = ?`, [KEY])
            alasql(`INSERT INTO ${TABLE} (k, v, updated_at) VALUES (?, ?, ?)`, [KEY, lsRaw, new Date().toISOString()])
          } catch {}
        }
        return parsed
      } catch {}
    }

    // 3) Migração do IndexedDB legado
    const legacy = await loadFromLegacyIndexedDb()
    if (legacy && (legacy.accounts?.length || legacy.transactions?.length)) {
      // migra automaticamente para SQL
      try {
        await sqlRepository.save(legacy)
        console.info('[SQL] migração do IndexedDB legado concluída')
      } catch {}
      return legacy
    }

    return emptyData()
  },

  async save(data: FinanceData): Promise<void> {
    await ensureTable()
    const json = JSON.stringify(data)
    const now = new Date().toISOString()

    // 1) SQL via alasql
    if (useAlasql && alasql) {
      try {
        // alasql não tem INSERT OR REPLACE em todas versões, faz DELETE + INSERT
        alasql(`DELETE FROM ${TABLE} WHERE k = ?`, [KEY])
        alasql(`INSERT INTO ${TABLE} (k, v, updated_at) VALUES (?, ?, ?)`, [KEY, json, now])
      } catch (e) {
        // se falhar, continua para LS
      }
    }

    // 2) Espelho em localStorage / memória (garante persistência mesmo se SQL falhar)
    lsSet(json)

    // 3) Mantém IndexedDB legado sincronizado para downgrade seguro (opcional, pode remover após migração estável)
    // Não sobrescreve para evitar loop, mas deixa disponível
  },

  async getStorageInfo() {
    await ensureTable()
    let engine = 'memory'
    if (useAlasql && alasql) engine = 'alasql-sql'
    else if (isLocalStorageAvailable()) engine = 'localStorage-sql-mirror'
    else engine = 'memory'

    let hasData = false
    if (useAlasql && alasql) {
      try {
        const rows: any[] = alasql(`SELECT v FROM ${TABLE} WHERE k = ?`, [KEY])
        hasData = !!(rows && rows.length)
      } catch {}
    }
    if (!hasData) {
      hasData = !!lsGet()
    }
    if (!hasData) {
      const legacy = await loadFromLegacyIndexedDb()
      hasData = !!(legacy && (legacy.accounts?.length || legacy.transactions?.length))
      if (hasData) engine += '+indexeddb-legacy'
    }
    return { engine, hasData }
  },

  _memoryStoreForTests: memoryStore,
}

// Alias para compatibilidade com código que ainda importa indexedDbRepository
export const indexedDbRepositoryAlias = sqlRepository
