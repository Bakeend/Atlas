import {
  Activity, BellRing, CalendarClock, Car, ChartPie, CreditCard, Eye, EyeOff, FileUp, Gamepad2,
  Gauge, HeartPulse, HelpCircle, House, Layers, PiggyBank, ReceiptText, Repeat2, ShoppingCart,
  Sparkles, Target, TrendingDown, Wallet, Zap, type LucideIcon,
} from 'lucide-react'
import type { IncomePattern, OrganizationLevel, PrimaryGoal } from '../domain'
import type { OnboardingChoice } from './OnboardingChoiceCard'

export interface FeedbackText { title: string; text: string }

export const GOAL_OPTIONS: Array<OnboardingChoice & { value: PrimaryGoal; feedback: FeedbackText }> = [
  { value: 'organize', label: 'Organizar meu dinheiro', icon: Wallet, feedback: { title: 'Vamos organizar.', text: 'Seu painel vai mostrar o que importa primeiro.' } },
  { value: 'reduce-spending', label: 'Gastar menos', icon: TrendingDown, feedback: { title: 'Entendido.', text: 'O Atlas vai destacar onde o dinheiro está vazando.' } },
  { value: 'save', label: 'Juntar dinheiro', icon: Target, feedback: { title: 'Boa escolha.', text: 'O Atlas vai destacar o que sobra para guardar.' } },
  { value: 'debt', label: 'Sair das dívidas', icon: ReceiptText, feedback: { title: 'Anotado.', text: 'Vamos organizar seus compromissos primeiro.' } },
  { value: 'safe-spend', label: 'Saber quanto posso gastar', icon: Gauge, feedback: { title: 'Perfeito.', text: 'Você vai ver quanto pode gastar hoje, todo dia.' } },
  { value: 'tracking', label: 'Só acompanhar minhas finanças', icon: ChartPie, feedback: { title: 'Combinado.', text: 'Um painel simples, sem complicação.' } },
]

export const GOAL_LABELS: Record<PrimaryGoal, string> = Object.fromEntries(
  GOAL_OPTIONS.map(option => [option.value, option.label]),
) as Record<PrimaryGoal, string>

export const INCOME_OPTIONS: Array<OnboardingChoice & { value: IncomePattern; feedback: FeedbackText }> = [
  { value: 'fixed', label: 'Salário fixo', icon: CalendarClock, feedback: { title: 'Anotado.', text: 'Vamos usar seu salário como base do planejamento.' } },
  { value: 'variable', label: 'Renda variável', icon: Activity, feedback: { title: 'Tudo bem.', text: 'Vamos deixar uma margem maior para meses imprevisíveis.' } },
  { value: 'multiple', label: 'Várias fontes de renda', icon: Layers, feedback: { title: 'Ótimo.', text: 'Somamos tudo para uma visão completa.' } },
  { value: 'unknown', label: 'Ainda não quero informar', icon: EyeOff, feedback: { title: 'Sem problema.', text: 'Você pode configurar isso depois no Perfil.' } },
]

export const DIFFICULTY_OPTIONS: Array<OnboardingChoice & { value: string }> = [
  { value: 'no-clue', label: 'Não sei para onde o dinheiro vai', icon: HelpCircle },
  { value: 'daily-overspend', label: 'Gasto demais no dia a dia', icon: ShoppingCart },
  { value: 'many-bills', label: 'Tenho muitas contas fixas', icon: Repeat2 },
  { value: 'forget-due-dates', label: 'Esqueço vencimentos', icon: BellRing },
  { value: 'hard-to-save', label: 'Tenho dificuldade para guardar', icon: PiggyBank },
  { value: 'variable-income', label: 'Minha renda varia muito', icon: Activity },
  { value: 'card-control', label: 'Quero controlar melhor o cartão', icon: CreditCard },
]

// Feedback por etapa (multisseleção): dispara no Continuar, não a cada toque.
export const DIFFICULTIES_STEP_FEEDBACK: FeedbackText = { title: 'Isso ajuda muito.', text: 'O Atlas vai focar nesses pontos.' }

export const PRIORITY_OPTIONS: Array<OnboardingChoice & { value: string }> = [
  { value: 'Moradia', label: 'Moradia', icon: House },
  { value: 'Alimentação', label: 'Alimentação', icon: ShoppingCart },
  { value: 'Transporte', label: 'Transporte', icon: Car },
  { value: 'Saúde', label: 'Saúde', icon: HeartPulse },
  { value: 'Dívidas', label: 'Dívidas', icon: ReceiptText },
  { value: 'Reserva', label: 'Reserva', icon: PiggyBank },
  { value: 'Metas', label: 'Metas', icon: Target },
  { value: 'Lazer', label: 'Lazer', icon: Gamepad2 },
]

export const PRIORITIES_STEP_FEEDBACK: FeedbackText = { title: 'Anotado.', text: 'Seu painel vai proteger essas áreas.' }

export interface LevelOption {
  value: OrganizationLevel
  title: string
  subtitle: string
  description: string
  icon: LucideIcon
  feedback: FeedbackText
}

export const LEVEL_OPTIONS: LevelOption[] = [
  { value: 'tracking', title: 'Simples', subtitle: 'Só quero acompanhar', description: 'Saldo, gastos e histórico.', icon: Eye, feedback: { title: 'Feito.', text: 'Painel enxuto, sem excessos.' } },
  { value: 'guided', title: 'Guiado', subtitle: 'Quero sugestões', description: 'Alertas, limites e recomendações.', icon: BellRing, feedback: { title: 'Boa.', text: 'Alertas e limites te acompanham.' } },
  { value: 'assisted', title: 'Assistido', subtitle: 'Quero organizar junto com o Atlas', description: 'Planejamento, dinheiro livre e IA.', icon: Sparkles, feedback: { title: 'Perfeito.', text: 'Planejamento, dinheiro livre e IA juntos.' } },
  { value: 'automatic', title: 'Automático', subtitle: 'Quero automatizar o máximo possível', description: 'O Atlas prepara tudo e você revisa.', icon: Zap, feedback: { title: 'Avante.', text: 'O Atlas prepara e você só revisa.' } },
]

export const LEVEL_LABELS: Record<OrganizationLevel, string> = Object.fromEntries(
  LEVEL_OPTIONS.map(option => [option.value, option.title]),
) as Record<OrganizationLevel, string>

export const SETUP_ICONS = { account: Wallet, import: FileUp, later: CalendarClock } satisfies Record<string, LucideIcon>
