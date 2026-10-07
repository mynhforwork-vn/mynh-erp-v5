-- Include print-template settings in the Admin full-system reset.

create or replace function public.admin_reset_erp_data(
  p_scope text,
  p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_scope text:=upper(btrim(coalesce(p_scope,'')));
  v_deleted_secrets integer:=0;
begin
  perform private.assert_admin();

  if v_scope not in ('DATA','ALL') then
    raise exception 'Phạm vi reset không hợp lệ';
  end if;

  if (v_scope='DATA' and p_confirm<>'RESET DU LIEU')
     or (v_scope='ALL' and p_confirm<>'RESET TOAN HE THONG') then
    raise exception 'Chuỗi xác nhận chưa đúng';
  end if;

  with secret_ids as (
    select password_secret_id id from public.erp_users where password_secret_id is not null
    union
    select spc_st_secret_id from public.erp_users where spc_st_secret_id is not null
    union
    select spc_f_secret_id from public.erp_users where spc_f_secret_id is not null
  )
  delete from vault.secrets s
  using secret_ids x
  where s.id=x.id;
  get diagnostics v_deleted_secrets=row_count;

  truncate table
    public.alert_events,
    public.customer_payment_allocations,
    public.customer_payments,
    public.debt_ledger,
    public.finance_document_lines,
    public.finance_documents,
    public.finance_transactions,
    public.inventory_transactions,
    public.order_items,
    public.order_vouchers,
    public.shipments,
    public.tracking_events,
    public.tracking_sync_logs,
    public.receive_batch_details,
    public.receive_batches,
    public.sale_return_items,
    public.sale_returns,
    public.sale_items,
    public.sale_payments,
    public.sales,
    public.shipper_payment_details,
    public.shipper_payments,
    public.transfer_items,
    public.transfer_batches,
    public.orders,
    public.customers,
    public.purchase_account_devices,
    public.erp_users,
    public.audit_logs
  restart identity cascade;

  if v_scope='ALL' then
    truncate table
      public.bank_transfer_configs,
      public.document_print_configs,
      public.destination_hub_shipper_assignments,
      public.destination_hub_configs,
      public.destination_shippers,
      public.sales_product_categories,
      public.product_variants,
      public.products,
      public.shipping_carrier_configs,
      public.tracking_provider_configs,
      public.warehouse_settings
    restart identity cascade;

    insert into public.warehouse_settings(id,default_receiving_warehouse_id,updated_at)
    values('main',null,now())
    on conflict(id) do update
      set default_receiving_warehouse_id=null,updated_at=excluded.updated_at;

    insert into public.document_print_configs(
      document_key,brand_name,title,header_note,paper_size,footer_text,
      show_customer_phone,show_warehouse,show_sku,show_variant,show_qr,show_signature,show_invoice_details,is_active
    )
    values
    ('SALE_INVOICE','MYNH ERP','PHIẾU BÁN HÀNG',null,'A4','Cảm ơn quý khách!',true,true,true,true,true,false,true,true),
    ('DEBT_RECEIPT','MYNH ERP','PHIẾU THU CÔNG NỢ',null,'A4','Phiếu được phát hành sau khi giao dịch đã ghi nhận trên MYNH ERP.',true,true,true,true,true,true,true,true)
    on conflict(document_key) do nothing;
  end if;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,new_value,source)
  values(
    v_actor,'SETTINGS',
    case when v_scope='ALL' then 'RESET_ALL_SYSTEM_DATA' else 'RESET_OPERATIONAL_DATA' end,
    'SYSTEM','GLOBAL',
    jsonb_build_object('scope',v_scope,'vault_secrets_deleted',v_deleted_secrets,'reset_at',now()),
    'USER'
  );

  return jsonb_build_object(
    'ok',true,
    'scope',v_scope,
    'vault_secrets_deleted',v_deleted_secrets,
    'message',case when v_scope='ALL'
      then 'Đã reset dữ liệu vận hành và cấu hình hệ thống'
      else 'Đã reset dữ liệu vận hành'
    end
  );
end;
$$;

revoke execute on function public.admin_reset_erp_data(text,text) from public,anon;
grant execute on function public.admin_reset_erp_data(text,text) to authenticated;
