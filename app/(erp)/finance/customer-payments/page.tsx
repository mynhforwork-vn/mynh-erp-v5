import { redirect } from 'next/navigation'

export default function CustomerPaymentsLegacyPage(){
  redirect('/finance/shipper-payments?mode=customer')
}
