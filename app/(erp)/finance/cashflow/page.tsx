import { requireUser } from '@/lib/supabase/auth'
import { FinanceCashflowWorkspace } from '@/components/finance-cashflow-workspace'

export default async function CashflowPage(){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')

  const [categoryResult,documentResult,transactionResult]=await Promise.all([
    supabase.from('finance_categories')
      .select('id,code,name,tx_type,parent_id,sort_order,is_active,is_system,note,created_at,updated_at')
      .order('tx_type')
      .order('sort_order')
      .order('name'),
    supabase.from('finance_documents')
      .select('id,document_code,document_type,document_status,occurred_at,counterparty_name,payment_method,cash_amount,transfer_amount,total_amount,source_type,source_id,note,created_by,posted_at,cancelled_at,cancellation_reason,created_at,updated_at,finance_document_lines(id,category_id,description,amount,line_order,reference_type,reference_id,finance_categories(id,code,name,tx_type,parent_id))')
      .order('occurred_at',{ascending:false})
      .limit(500),
    supabase.from('finance_transactions')
      .select('id,tx_type,category,category_id,amount,reference_type,reference_id,transaction_at,note,created_at,finance_document_id,payment_method,status,voided_at,void_reason')
      .order('transaction_at',{ascending:false})
      .limit(1000),
  ])

  const errors=[categoryResult.error,documentResult.error,transactionResult.error]
    .filter(Boolean)
    .map((x:any)=>x.message)

  return <FinanceCashflowWorkspace
    categories={(categoryResult.data??[]) as any[]}
    documents={(documentResult.data??[]) as any[]}
    transactions={(transactionResult.data??[]) as any[]}
    canEdit={['admin','operator'].includes(role)}
    loadError={errors.join(' · ')||null}
  />
}
