-- Fix finance posting on PostgreSQL where min(uuid) is undefined.
do $$
declare
  v_oid oid;
  v_def text;
  v_old text := 'select count(distinct category_id),min(category_id)';
  v_new text := 'select count(distinct category_id),min(category_id::text)::uuid';
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='save_finance_document'
    and pg_get_function_identity_arguments(p.oid)=
      'p_document_id uuid, p_document_type finance_tx_type, p_occurred_at timestamp with time zone, p_counterparty_name text, p_payment_method text, p_cash_amount numeric, p_transfer_amount numeric, p_note text, p_lines jsonb, p_post boolean';

  if v_oid is null then
    raise exception 'save_finance_document signature not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);
  if position(v_old in v_def)=0 then
    raise exception 'Expected min(uuid) expression not found in save_finance_document';
  end if;

  execute replace(v_def,v_old,v_new);
end $$;
