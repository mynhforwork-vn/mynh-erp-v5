-- Finance ledger hardening after Supabase advisor review.
revoke execute on function public.save_finance_category(uuid,text,public.finance_tx_type,uuid,text,boolean) from anon;
revoke execute on function public.save_finance_category(uuid,text,public.finance_tx_type,uuid,text,boolean) from public;
grant execute on function public.save_finance_category(uuid,text,public.finance_tx_type,uuid,text,boolean) to authenticated;

revoke execute on function public.save_finance_document(uuid,public.finance_tx_type,timestamptz,text,text,numeric,numeric,text,jsonb,boolean) from anon;
revoke execute on function public.save_finance_document(uuid,public.finance_tx_type,timestamptz,text,text,numeric,numeric,text,jsonb,boolean) from public;
grant execute on function public.save_finance_document(uuid,public.finance_tx_type,timestamptz,text,text,numeric,numeric,text,jsonb,boolean) to authenticated;

revoke execute on function public.cancel_finance_document(uuid,text) from anon;
revoke execute on function public.cancel_finance_document(uuid,text) from public;
grant execute on function public.cancel_finance_document(uuid,text) to authenticated;

create index if not exists finance_transactions_category_idx
  on public.finance_transactions(category_id);
