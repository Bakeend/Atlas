import { Check, type LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'

export interface OnboardingChoice {
  value: string
  label: string
  description?: string
  icon: LucideIcon
}

// Card de escolha usado nas etapas de seleção única e múltipla.
// A resposta física ao toque vem das classes CSS (.onboarding-card/:active/.selected/.shake).
export function OnboardingChoiceCard({ option, selected, shake, disabled = false, index, onSelect }: {
  option: OnboardingChoice
  selected: boolean
  shake?: boolean
  disabled?: boolean
  index: number
  onSelect: (value: string) => void
}) {
  const Icon = option.icon
  return (
    <button
      type="button"
      className={`onboarding-card ${selected ? 'selected' : ''} ${shake ? 'shake' : ''}`}
      style={{ '--delay': `${Math.min(index, 9) * 45}ms` } as CSSProperties}
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => onSelect(option.value)}
    >
      <span className={`onboarding-card-icon ${selected ? 'selected' : ''}`} aria-hidden="true"><Icon size={20} strokeWidth={1.9}/></span>
      <span className="onboarding-card-body">
        <strong>{option.label}</strong>
        {option.description && <small>{option.description}</small>}
      </span>
      {selected && <span className="onboarding-check" aria-hidden="true"><Check size={15} strokeWidth={2.6}/></span>}
    </button>
  )
}
