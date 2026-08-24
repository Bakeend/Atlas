// Barra fina animada por transform: scaleX — nunca width (spec §23).
export function OnboardingProgress({ step, total }: { step: number; total: number }) {
  const fraction = Math.max(0, Math.min(1, step / total))
  return (
    <div className="onboarding-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step} aria-label={`Etapa ${step} de ${total}`}>
      <span className="onboarding-progress-fill" style={{ transform: `scaleX(${fraction})` }}/>
    </div>
  )
}
