import { DailySpendCard } from './DailySpend'
import { PaymentOrganizerCard } from './PaymentAllocationCard'
import { FreeMoneyCard } from './FreeMoneyCard'
import { RecurringDashboardCard } from './RecurringExpenses'
import { ForecastDashboardCard } from './ForecastPage'
import { PageTitle } from './components'

export function OrganizePage() {
  return <>
    <PageTitle eyebrow="Organização" title="Organizar"/>
    <DailySpendCard/>
    <PaymentOrganizerCard/>
    <FreeMoneyCard/>
    <RecurringDashboardCard/>
    <ForecastDashboardCard/>
  </>
}
