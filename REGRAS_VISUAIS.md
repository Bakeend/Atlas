# Regras Visuais — Atlas Finance

> **Objetivo:** garantir que qualquer nova feature use os mesmos componentes e tokens visuais do projeto. Nunca inventar um `<input>`, `<select>` ou `<input type="number|date">` nativo. Reutilizar os wrappers já existentes.

Este guia foi gerado após analisar `src/components.tsx:1`, `src/styles.css:1`, `tailwind.config.js:1` e páginas (`App.tsx`, `RecurringExpenses.tsx`, `DailySpend.tsx`, `ForecastPage.tsx`).

---

## 1) Tokens base

| Token | Valor | Uso |
|---|---|---|
| `brand` | `#2F80ED` | Primário, focus, botões, links |
| `ink` | `#111827` | Texto principal |
| `muted` | `#6B7280` | Secundário, placeholders, descrições |
| `canvas` | `#F7F8FA` | Fundo da página (`html {background:#f7f8fa}`) |
| `card` | `rounded-[20px] border-black/[0.025] shadow 0 6px 22px rgba(15,23,42,.045)` | `Card` (`styles.css:16`) |
| `shadow card hover` | `0 8px 26px rgba(15,23,42,.06)` + `translateY(-1px)` | `.dashboard-card:hover` |
| `radius trigger` | `rounded-xl` (12px) | Todos os triggers (money/select/date) |
| `radius overlay panel` | `rounded-t-[30px]` mobile / `rounded-[30px]` desktop | Overlays (money, select, calendário) |
| `radius botão` | `rounded-xl` + `rounded-full` para toggles/pills | `btn-primary`, `toggle`, `period-button` |

Fonte: `tailwind.config.js:6`, `styles.css:5`.

---

## 2) Tipografia & espaçamento

- `body`: `font-sans text-ink antialiased min-h-screen bg-canvas` (`styles.css:8`)
- `h1` dashboard: `text-[25px] font-bold tracking-[-0.025em]`; `h1` páginas internas `text-2xl sm:text-3xl font-bold tracking-tight`
- `label` (`styles.css:23`): `mb-1.5 block text-sm font-medium text-slate-700`
- `app-content`: `max-w-[680px] mx-auto px-4 sm:px-6 pt-7 sm:pt-10 pb-32` (`styles.css:15`)
- Espaçamento entre cards no dashboard: `mt-4` (16px)
- Breakpoints: `390px` (ajustes finos), `640px` (sm), `900px` (desktop background)

---

## 3) Campo padrão — a regra de ouro

### 3.1 `MoneyInput` é o padrão para **qualquer valor numérico**

```tsx
// ✅ CORRETO — até para Saldo inicial
<Field label="Saldo inicial">
  <MoneyInput ariaLabel="Saldo inicial" value={form.watch('initialBalance')} onChange={...} />
</Field>

// ✅ CORRETO — valor de transação
<Field label="Valor" error={errors.amount?.message}>
  <MoneyInput ariaLabel="Valor da movimentação" value={form.watch('amount')} onChange={...} />
</Field>

// ❌ ERRADO
<input type="number" className="field" />
<input type="text" placeholder="0,00" />
```

**Por que:** `MoneyInput` (`components.tsx:147`) já resolve máscara BRL, centavos, teclado numérico em overlay, a11y (`aria-haspopup="dialog"`), animação `digit-pop`, e garante `rounded-xl + min-h-[52px] + text-xl font-bold tabular-nums + border-slate-200 + hover:border-blue-300 + focus:border-brand focus:ring-2`. Usar outro estilo quebra consistência e validação (`parseMoney`).

Trigger tem `min-h-[52px] px-3.5 py-3` + ícone `ChevronDown 18` que rotaciona 180º quando `open` (`styles.css:26`).

Overlay sempre via `createPortal` para `document.body`, fundo `bg-slate-950/55 backdrop-blur-[2px]`, header `Digite o valor` + botão fechar, teclado `money-keypad-grid` 3 colunas (`styles.css:35-46`).

**Regra:** campo de número **tem que ser igual** campo de dinheiro → use `MoneyInput`. Se for número discreto (ex: `dueDay` 1-31), use `SelectMenu`, nunca `<input type="number">`.

### 3.2 `SelectMenu` — único select permitido

```tsx
// ✅ CORRETO
<Field label="Categoria">
  <SelectMenu
    ariaLabel="Categoria"              // obrigatório — vira título do overlay
    value={form.watch('category')}
    onChange={v => form.setValue('category', v)}
    options={categories.map(c => ({ value:c, label:c }))} // SEMPRE {value,label}
  />
</Field>

// ❌ ERRADO
<select><option>...</option></select>
```

Especificação `components.tsx:18` / `styles.css:47`:
- trigger: `flex min-h-11 w-full justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium`
- estados: `hover:border-blue-300 hover:bg-blue-50/30`, `open:border-blue-500 ring-2 ring-blue-500/15`, ícone `ChevronDown` rotaciona
- overlay: `control-overlay` → `control-overlay-panel select-overlay-panel` com header (`Escolha uma opção`) + lista `select-overlay-list` (`max-h-[58vh] overflow-y-auto bg-blue-50/20`)
- opção: `select-option` (`min-h-[54px] bg-white`), `highlighted:bg-blue-50`, `selected:bg-blue-100 + Check 19`
- a11y: `aria-haspopup="listbox"`, `aria-expanded`, `role="listbox"`, `role="option"`, navegação teclado `ArrowDown/Up`, `Enter`, `Escape`
- trava scroll: `document.body.style.overflow='hidden'` quando `open`

**Nunca** criar piloto com `appearance:none` ou biblioteca externa. Reutilizar.

### 3.3 `DatePicker` — único date picker

```tsx
<Field label="Data">
  <DatePicker ariaLabel="Data da movimentação" value={form.watch('date')} onChange={...} />
</Field>
```

Mesmo trigger de `SelectMenu` (`date-trigger`, `styles.css:60`) + mesmo overlay (`control-overlay`). Calendário tem `calendar-header` (mês/ano + ChevronLeft/Right), `calendar-weekdays` (D S T Q Q S S), `calendar-grid` 42 dias, `outside:text-slate-300`, `today::after •`, `selected:bg-blue-600 text-white`, botão `Hoje` (`calendar-today`). Não usar `<input type="date">`.

### 3.4 `ColorPicker` — cores de conta

Trigger `w-[58px] h-11` (`styles.css:88`) + `color-preview` 24px + ícone `Palette`. Popover `224px` com `color-grid` 4 colunas. Só 8 cores permitidas (`colorOptions` em `components.tsx:69`).

### 3.5 `Field` wrapper — obrigatório

```tsx
export function Field({ label, error, children }) {
  return <div><span className="label">{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</div>
}
// label = styles.css:23, error = text-xs text-red-600
```

Todo input **deve** estar dentro de `Field`. Erro vem de `zod` + `react-hook-form` e aparece abaixo com `mt-1`.

Para campos lado a lado: `grid gap-4 sm:grid-cols-2` ou `grid grid-cols-[1fr_auto]` quando um é `ColorPicker`.

---

## 4) Outros blocos visuais

### Card
```tsx
<Card className="dashboard-card">...</Card>
// .card: rounded-[20px] bg-white p-5 border-black/[0.025] shadow card (styles.css:16)
```

### Botões
- `btn-primary`: `inline-flex gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 focus:ring-2 focus:ring-brand/30`
- `btn-secondary`: `rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50`
- `icon-button`: `h-9 w-9 rounded-full text-muted hover:bg-slate-100 hover:text-ink`
- `toggle`: `h-6 w-11 rounded-full bg-slate-200 p-0.5` → `active:bg-brand` + `translate-x-5`

Sempre usar Lucide (`lucide-react`) com `strokeWidth 1.9` (ícones de categoria) ou `2` (triggers). Nunca emoji.

### Modal
`Modal` (`components.tsx:101`): `fixed inset-0 z-50 bg-slate-950/40`, painel `max-h-[92vh] rounded-t-3xl sm:rounded-3xl p-5 sm:max-w-lg shadow-2xl`, header com `X 20`.

### CategoryIcon
`CategoryIcon` (`components.tsx:12`): `h-10 w-10 rounded-full grid place-items-center` com `color`/`backgroundColor`. Usado em `TransactionRow`, `RecurringRow`, `SummaryCard`.

### Transação
`TransactionRow` (`components.tsx:193`): `flex gap-3 py-3.5 border-b border-slate-100`, `CategoryIcon` + `truncate text-sm font-semibold` + `text-xs text-muted` + `transaction-amount` (`rounded-lg px-2 py-1 text-sm font-bold tabular-nums` com variantes `income:bg-emerald-50 text-emerald-600`, `expense:bg-red-50`, `transfer:bg-blue-50`).

---

## 5) Overlays — regra geral

Todos os overlays (Money, Select, Date) **devem**:

1. Usar `createPortal(..., document.body)`
2. Ter `control-overlay`/`money-overlay` com `fixed inset-0 z-[120] bg-slate-950/55 backdrop-blur-[2px]`
3. Ter painel `rounded-t-[30px] sm:rounded-[30px] border border-white/70 bg-white p-5 shadow-[0_28px_80px_rgba(...)]`
4. Header `control-overlay-header` com `span` (ariaLabel) + `p` (subtexto) + botão fechar `ChevronDown 22` dentro de `h-10 w-10 rounded-full bg-slate-100`
5. Travar scroll do body (`overflow:hidden`) quando aberto
6. Fechar em `onMouseDown` no backdrop (`event.target===event.currentTarget`) + `Escape`

Não criar drawer/tooltip próprio.

---

## 6) Anti-padrões (o que **não** fazer)

| ❌ Errado | ✅ Correto |
|---|---|
| `<input type="number" />` | `MoneyInput` (dinheiro) ou `SelectMenu` (1-31) |
| `<input type="date" />` | `DatePicker` |
| `<select>` nativo | `SelectMenu` |
| `<input placeholder="R$ 0,00">` solto | `Field` + `MoneyInput` |
| `style={{borderRadius:8}}` inline | `className="rounded-xl"` + tokens |
| Cor aleatória `#27c47d` | `colorOptions` fixas + `#2F80ED` padrão |
| Emoji ✦ texto | `Sparkles` do Lucide |
| `alert()` / `confirm()` | `Modal` ou `notification-overlay` |

---

## 7) Checklist para nova feature (copiar no PR)

- [ ] Todos os valores monetários usam `MoneyInput` (trigger `money-trigger`, não `field`)
- [ ] Todos os selects usam `SelectMenu` com `ariaLabel` e `options: {value,label}[]`
- [ ] Todas as datas usam `DatePicker`
- [ ] Cada campo está dentro de `<Field label="..." error={...}>`
- [ ] Botões usam `btn-primary` / `btn-secondary` / `icon-button`
- [ ] Overlays usam `control-overlay` + `createPortal` + trava scroll
- [ ] Cores vêm de `colorOptions` ou `tailwind brand/ink/muted/canvas`
- [ ] Ícones Lucide com `strokeWidth 1.9-2`, nunca emoji
- [ ] `Card` tem `rounded-[20px] p-5` e `dashboard-card:hover` se for dashboard
- [ ] Erros de validação vêm de `zod` + `zodResolver` e aparecem como `text-xs text-red-600` abaixo do `Field`
- [ ] Responsivo testado em 390px, 640px, 900px (`styles.css:357`)

---

## 8) Exemplos canônicos

**Transação**
`components.tsx:110` — 3 botões tipo (Despesa/Receita/Transferir) com `border-brand bg-blue-50` quando ativo, `Field` Valor → `MoneyInput`, Descrição → `field` input, Categoria → `SelectMenu`, Conta → `SelectMenu`, Data → `DatePicker`, Observação → `textarea field resize-none`.

**Conta**
`components.tsx:132` — Nome `field`, Tipo `SelectMenu` (checking/savings/cash/wallet/investment), Saldo `MoneyInput` + Cor `ColorPicker` lado a lado `grid-cols-[1fr_auto]`.

**Recorrência**
`RecurringExpenses.tsx:124` — Nome `field`, Valor `MoneyInput`, Categoria/Conta `SelectMenu`, Frequência `SelectMenu` (recurrenceFrequencies), Dia vencimento `SelectMenu 1-31`, Início/Fim `DatePicker`, toggles `settings-row + toggle`.

**Filtros**
`App.tsx:130` — `filter-grid` (`grid gap-3 sm:grid-cols-2`, primeiro filho `sm:col-span-2`) com `field` busca + dois `SelectMenu`.

---

## 9) Onde estender

- Precisa novo tipo de campo numérico? **Estenda `MoneyInput`** (ex: prop `suffix`), não crie `NumberInput`.
- Precisa novo select com busca? Estenda `SelectMenu` com filtro, não use `react-select`.
- Precisa cor nova? Adicione em `colorOptions` (`components.tsx:69`) e em `tailwind brand`.

Manter `styles.css` como única fonte de verdade visual; nunca espalhar `style={{}}` inline para bordas/cores.

---

*Última verificação: build `vite build` OK (948kB), `tsc -b` OK. Se quebrar este guia, o review deve bloquear.*
