import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { OnboardingProgress } from './OnboardingProgress'

// Estrutura fixa: topo (voltar + progresso com safe-area), conteúdo scrollável e CTA inferior próximo ao polegar.
export function OnboardingShell({ step, total, showChrome, canGoBack, onBack, children, footer }: {
  step: number
  total: number
  showChrome: boolean
  canGoBack: boolean
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="onboarding-root">
      <header className="onboarding-top">
        <div className="onboarding-container onboarding-top-row">
          {showChrome && <>
            <button type="button" className="icon-button onboarding-back" onClick={onBack} aria-label="Voltar" disabled={!canGoBack}><ChevronLeft size={22} strokeWidth={2}/></button>
            <OnboardingProgress step={step} total={total}/>
          </>}
        </div>
      </header>
      <main className="onboarding-stage">
        <div className="onboarding-container">{children}</div>
      </main>
      {footer && <footer className="onboarding-footer"><div className="onboarding-container">{footer}</div></footer>}
    </div>
  )
}
