import { describe, it, expect } from 'vitest'
import { DEFAULT_SHORTCUTS, MAX_SHORTCUTS, sanitizeShortcuts, resolveShortcutItems } from '../navigation'

describe('sanitizeShortcuts', () => {
  it('retorna o padrão quando o valor é ausente ou inválido', () => {
    expect(sanitizeShortcuts(undefined)).toEqual(DEFAULT_SHORTCUTS)
    expect(sanitizeShortcuts(null)).toEqual(DEFAULT_SHORTCUTS)
    expect(sanitizeShortcuts('lixo')).toEqual(DEFAULT_SHORTCUTS)
    expect(sanitizeShortcuts(42)).toEqual(DEFAULT_SHORTCUTS)
    expect(sanitizeShortcuts({ to: '/planning' })).toEqual(DEFAULT_SHORTCUTS)
  })

  it('descarta rotas desconhecidas e rotas fixas', () => {
    expect(sanitizeShortcuts(['/profile', '/nope', '/', '/forecast'])).toEqual(['/forecast', DEFAULT_SHORTCUTS[0]])
  })

  it('remove duplicatas preservando a ordem', () => {
    expect(sanitizeShortcuts(['/planning', '/planning', '/recurring'])).toEqual(['/planning', '/recurring'])
  })

  it('limita ao máximo de atalhos', () => {
    const todas = ['/transactions', '/organizar', '/planning', '/recurring', '/forecast']
    expect(sanitizeShortcuts(todas)).toHaveLength(MAX_SHORTCUTS)
  })

  it('completa com padrões quando fica abaixo do máximo', () => {
    expect(sanitizeShortcuts([])).toEqual(DEFAULT_SHORTCUTS)
    expect(sanitizeShortcuts(['/assistant'])).toEqual(['/assistant', DEFAULT_SHORTCUTS[0]])
  })
})

describe('resolveShortcutItems', () => {
  it('sempre devolve Início + atalhos + Perfil (máximo de colunas fixo)', () => {
    const items = resolveShortcutItems(['/planning', '/accounts'])
    expect(items).toHaveLength(MAX_SHORTCUTS + 2)
    expect(items[0].to).toBe('/')
    expect(items[items.length - 1].to).toBe('/profile')
    expect(items.map(item => item.to)).toEqual(['/', '/planning', '/accounts', '/profile'])
  })

  it('cai no padrão com entrada corrompida do storage', () => {
    const items = resolveShortcutItems([123, null])
    expect(items.map(item => item.to)).toEqual(['/', ...DEFAULT_SHORTCUTS, '/profile'])
  })
})
