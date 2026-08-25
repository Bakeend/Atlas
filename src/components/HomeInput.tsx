import { Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function HomeInput() {
  const [value, setValue] = useState('')
  const navigate = useNavigate()
  const submit = () => {
    const text = value.trim()
    if (!text) return
    // navega para assistente com prompt; AiAssistantPage pode pré-preencher
    navigate(`/assistant?q=${encodeURIComponent(text)}`)
  }
  return <div className="mt-6">
    <div className="ai-input-wrap !rounded-2xl shadow-sm">
      <Sparkles size={18} className="ml-2 shrink-0 text-brand" />
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        placeholder="Pergunte sobre suas finanças..."
        aria-label="Perguntar à assistente"
        className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-slate-400"
      />
      <button className="ai-send shrink-0" onClick={submit} disabled={!value.trim()} aria-label="Enviar para assistente">
        <Send size={18} />
      </button>
    </div>
    <p className="mt-2 text-center text-[11px] text-muted">Pressione Enter para falar com a assistente</p>
  </div>
}
