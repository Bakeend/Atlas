import { ArrowUpRight, ArrowDownLeft, Check, X, AlertTriangle, PiggyBank, ReceiptText, Repeat2, Wallet, ChartPie, Package, Sparkles, RefreshCw } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { money } from '../../domain'
import type { AiVisualBlock, AiAction } from './types'
import { useResolvedTheme } from '../../lib/theme'

// Props do renderer central (01:57)
export function AiVisualRenderer({
  blocks,
  actions,
  onAction,
}: {
  blocks: AiVisualBlock[]
  actions?: AiAction[]
  onAction?: (action: AiAction) => void
}) {
  if (!blocks.length && !actions?.length) return null
  return (
    <div className="ai-visual-stack">
      {blocks.map((block, i) => (
        <div key={i} className="ai-visual-block">
          <BlockRenderer block={block} onAction={onAction} />
        </div>
      ))}
      {actions && actions.length > 0 && (
        <div className="ai-visual-actions">
          {actions.slice(0, 3).map((a, i) => (
            <button
              key={i}
              className={a.type === 'cancel' ? 'btn-secondary' : 'btn-primary'}
              onClick={() => onAction?.(a)}
              aria-label={a.label}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BlockRenderer({ block, onAction }: { block: AiVisualBlock; onAction?: (a: AiAction) => void }) {
  switch (block.type) {
    case 'metric': return <MetricBlock block={block} onAction={onAction} />
    case 'category': return <CategoryBlock block={block} />
    case 'chart': return <ChartBlock block={block} />
    case 'transactions': return <TransactionsBlock block={block} onAction={onAction} />
    case 'budget': return <BudgetBlock block={block} />
    case 'recurring': return <RecurringBlock block={block} onAction={onAction} />
    case 'plan': return <PlanBlock block={block} onAction={onAction} />
    case 'entity-preview': return <EntityPreviewBlock block={block} onAction={onAction} />
    case 'confirmation': return <ConfirmationBlock block={block} onAction={onAction} />
    case 'success': return <SuccessBlock block={block} />
    case 'error': return <ErrorBlock block={block} onAction={onAction} />
    case 'form': return <FormBlock block={block} onAction={onAction} />
    default: return null
  }
}

function MetricBlock({ block, onAction }: { block: Extract<AiVisualBlock, { type: 'metric' }>; onAction?: (a: AiAction) => void }) {
  const deltaUp = block.delta && block.delta.value >= 0
  const isDark = useResolvedTheme() === 'dark'
  const gridColor = isDark ? '#334155' : '#E9EDF3'
  const tickColor = isDark ? '#94A3B8' : '#7A8392'
  const tickColorY = isDark ? '#94A3B8' : '#8A93A1'
  return (
    <div className="ai-card ai-metric">
      <div className="ai-card-header">
        <Wallet size={16} className="text-brand" />
        <strong>{block.title}</strong>
        {block.delta && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${deltaUp ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {deltaUp ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
            {deltaUp ? '+' : ''}{block.delta.value}% {block.delta.label ?? ''}
          </span>
        )}
      </div>
      <div className="ai-card-body">
        <strong className="text-lg tabular-nums">{block.value}</strong>
        {block.subtitle && <small>{block.subtitle}</small>}
        {block.chart && block.chart.length > 0 && (
          <div className="h-[86px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={block.chart} margin={{ top: 6, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: tickColor }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: tickColorY }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#2F80ED" strokeWidth={2.5} fill="rgba(47,128,237,0.12)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {block.actions && (
          <div className="ai-visual-actions mt-2">
            {block.actions.map((a, i) => (
              <button key={i} className="btn-secondary text-xs" onClick={() => onAction?.(a)}>{a.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryBlock({ block }: { block: Extract<AiVisualBlock, { type: 'category' }> }) {
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Package size={16} className="text-brand" /> <strong>{block.title ?? 'Categoria'}</strong></div>
      <div className="ai-card-body">
        <strong>{block.label}</strong>
        {block.value && <span className="text-brand font-bold">{block.value}</span>}
        {block.categoryId && <small>{block.categoryId}</small>}
      </div>
    </div>
  )
}

function ChartBlock({ block }: { block: Extract<AiVisualBlock, { type: 'chart' }> }) {
  const isDark = useResolvedTheme() === 'dark'
  const gridColor = isDark ? '#334155' : '#E9EDF3'
  const tickColor = isDark ? '#94A3B8' : '#7A8392'
  const tickColorY = isDark ? '#94A3B8' : '#8A93A1'
  return (
    <div className="ai-card">
      <div className="ai-card-header"><ChartPie size={16} className="text-brand" /> <strong>{block.title}</strong></div>
      <div className="h-[180px] w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={block.data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColorY }} />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#2F80ED" strokeWidth={3} fill="rgba(47,128,237,0.15)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TransactionsBlock({ block, onAction }: { block: Extract<AiVisualBlock, { type: 'transactions' }>; onAction?: (a: AiAction) => void }) {
  const items = block.items.slice(0, block.maxItems ?? 5)
  return (
    <div className="ai-card">
      <div className="ai-card-header"><ReceiptText size={16} className="text-brand" /> <strong>{block.title}</strong></div>
      <div className="divide-y divide-slate-100 mt-2">
        {items.map(tx => (
          <div key={tx.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <strong className="block truncate text-ink">{tx.description}</strong>
              <small className="text-muted">{tx.category} · {tx.date}</small>
            </div>
            <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-bold tabular-nums ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{money(tx.amountCents)}</span>
          </div>
        ))}
      </div>
      {block.actions && (
        <div className="ai-visual-actions mt-3">
          {block.actions.map((a, i) => (
            <button key={i} className="btn-secondary text-xs" onClick={() => onAction?.(a)}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function BudgetBlock({ block }: { block: Extract<AiVisualBlock, { type: 'budget' }> }) {
  const pct = Math.min(100, Math.round(block.percentage))
  const over = block.usedInCents > block.limitInCents
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Wallet size={16} className="text-brand" /> <strong>{block.label}</strong></div>
      <div className="mt-3">
        <div className="flex justify-between text-sm">
          <span className="font-semibold">{block.label}</span>
          <span className={over ? 'font-semibold text-red-600' : 'text-muted'}>{money(block.usedInCents)} de {money(block.limitInCents)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div style={{ width: `${pct}%` }} className={`h-full rounded-full ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-brand'}`} />
        </div>
        <p className="mt-1 text-xs text-muted">{over ? 'Limite excedido' : `${pct}% utilizado`}{block.remainingInCents !== undefined ? ` · Restam ${money(block.remainingInCents)}` : ''}</p>
      </div>
    </div>
  )
}

function RecurringBlock({ block, onAction }: { block: Extract<AiVisualBlock, { type: 'recurring' }>; onAction?: (a: AiAction) => void }) {
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Repeat2 size={16} className="text-brand" /> <strong>{block.label}</strong></div>
      <div className="ai-card-body">
        <span className="text-sm font-bold tabular-nums">{money(block.amountInCents)}</span>
        <small>{block.dueLabel}{block.category ? ` · ${block.category}` : ''}</small>
      </div>
      {block.actions && (
        <div className="ai-visual-actions mt-2">
          {block.actions.map((a, i) => (
            <button key={i} className="btn-secondary text-xs" onClick={() => onAction?.(a)}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function PlanBlock({ block, onAction }: { block: Extract<AiVisualBlock, { type: 'plan' }>; onAction?: (a: AiAction) => void }) {
  return (
    <div className="ai-card ai-plan">
      <div className="ai-card-header"><PiggyBank size={16} className="text-brand" /> <strong>{block.title}</strong></div>
      <div className="ai-plan-list mt-3">
        {block.items.map((it, i) => (
          <div key={i} className="ai-plan-item"><span>{it.label} {it.type && <small>{it.type}</small>}</span><strong>{money(it.amountCents)}</strong></div>
        ))}
      </div>
      {block.actions && (
        <div className="ai-plan-actions">
          {block.actions.map((a, i) => (
            <button key={i} className={a.type === 'cancel' ? 'btn-secondary' : 'btn-primary'} onClick={() => onAction?.(a)}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function EntityPreviewBlock({ block, onAction }: { block: Extract<AiVisualBlock, { type: 'entity-preview' }>; onAction?: (a: AiAction) => void }) {
  const isCreate = block.operation === 'create'
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Sparkles size={16} className="text-brand" /> <strong>{block.title}</strong> <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${isCreate ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{block.operation}</span></div>
      <div className="mt-3 space-y-2">
        {block.fields.map((f, i) => (
          <div key={i} className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <span className="text-muted">{f.label}</span><strong className="text-ink">{f.value}</strong>
          </div>
        ))}
      </div>
      {block.confirmationRequired && (
        <div className="ai-visual-actions mt-3">
          <button className="btn-secondary" onClick={() => onAction?.({ type: 'cancel', label: 'Cancelar' })}><X size={16} /> Cancelar</button>
          <button className="btn-primary" onClick={() => onAction?.({ type: `create-${block.entityType}` as AiAction['type'], label: `Criar ${block.entityType}`, payload: Object.fromEntries(block.fields.map(f => [f.label, f.value])) })}><Check size={16} /> Confirmar</button>
        </div>
      )}
    </div>
  )
}

function ConfirmationBlock({ block, onAction }: { block: Extract<AiVisualBlock, { type: 'confirmation' }>; onAction?: (a: AiAction) => void }) {
  const isDanger = block.severity === 'danger'
  return (
    <div className={`ai-card ${isDanger ? 'border-red-200 bg-red-50' : 'bg-white'}`}>
      <div className="ai-card-header">
        <AlertTriangle size={16} className={isDanger ? 'text-red-600' : 'text-amber-600'} />
        <strong>{block.title}</strong>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">{block.description}</p>
      <div className="ai-visual-actions mt-4">
        {block.cancelAction && <button className="btn-secondary" onClick={() => onAction?.(block.cancelAction!)}>{block.cancelAction.label}</button>}
        <button className={isDanger ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700' : 'btn-primary'} onClick={() => onAction?.(block.confirmAction)}>{block.confirmAction.label}</button>
      </div>
    </div>
  )
}

function SuccessBlock({ block }: { block: Extract<AiVisualBlock, { type: 'success' }> }) {
  return (
    <div className="ai-card border-emerald-200 bg-emerald-50">
      <div className="ai-card-header"><Check size={16} className="text-emerald-600" /> <strong className="text-emerald-800">{block.title}</strong></div>
      {block.description && <p className="mt-2 text-sm leading-6 text-emerald-800">{block.description}</p>}
      {block.entity && <small className="mt-1 text-emerald-700">{block.entity.type} · {block.entity.id.slice(0, 8)}</small>}
    </div>
  )
}

function ErrorBlock({ block, onAction }: { block: Extract<AiVisualBlock, { type: 'error' }>; onAction?: (a: AiAction) => void }) {
  return (
    <div className="ai-card border-red-200 bg-red-50">
      <div className="ai-card-header"><AlertTriangle size={16} className="text-red-600" /> <strong>{block.title}</strong></div>
      <p className="mt-2 text-sm leading-6 text-red-700">{block.description}</p>
      {block.retryAction && <button className="btn-secondary mt-3" onClick={() => onAction?.(block.retryAction!)}><RefreshCw size={16} /> {block.retryAction.label}</button>}
    </div>
  )
}

function FormBlock({ block, onAction }: { block: Extract<AiVisualBlock, { type: 'form' }>; onAction?: (a: AiAction) => void }) {
  return (
    <div className="ai-card bg-white">
      {block.title && <div className="ai-card-header"><Sparkles size={16} className="text-brand" /> <strong>{block.title}</strong></div>}
      {block.description && <p className="mt-2 text-sm text-muted">{block.description}</p>}
      <div className="mt-3 space-y-3">
        {block.fields.map(f => (
          <div key={f.name}>
            <label className="label">{f.label}</label>
            {f.type === 'select' && f.options ? (
              <select className="field" aria-label={f.label}>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input className="field" placeholder={f.placeholder} aria-label={f.label} />
            )}
          </div>
        ))}
      </div>
      <div className="ai-visual-actions mt-4">
        {block.cancelAction && <button className="btn-secondary" onClick={() => onAction?.(block.cancelAction!)}>{block.cancelAction.label}</button>}
        {block.submitAction && <button className="btn-primary" onClick={() => onAction?.(block.submitAction!)}>{block.submitAction.label}</button>}
      </div>
    </div>
  )
}
