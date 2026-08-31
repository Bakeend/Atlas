import { CreditCard as CardIcon, ChevronRight } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Card, CategoryIcon, PageTitle } from './components'
import { DailySpendCard } from './DailySpend'
import { PaymentOrganizerCard } from './PaymentAllocationCard'
import { FreeMoneyCard } from './FreeMoneyCard'
import { RecurringDashboardCard } from './RecurringExpenses'
import { ForecastDashboardCard } from './ForecastPage'

export function OrganizePage() {
  return <>
    <PageTitle eyebrow="Organização" title="Organizar"/>
    <NavLink to="/cards" className="card flex items-center gap-3 !p-4 no-underline">
      <CategoryIcon icon={CardIcon} color="#2F80ED" backgroundColor="#E8F1FE" size={22} />
      <div className="min-w-0 flex-1 text-left">
        <strong className="block text-sm">Cartões de crédito</strong>
        <span className="block text-xs text-muted">Faturas, limites e parcelas</span>
      </div>
      <ChevronRight size={18} className="text-slate-300" />
    </NavLink>
    <DailySpendCard/>
    <PaymentOrganizerCard/>
    <FreeMoneyCard/>
    <RecurringDashboardCard/>
    <ForecastDashboardCard/>
  </>
}
