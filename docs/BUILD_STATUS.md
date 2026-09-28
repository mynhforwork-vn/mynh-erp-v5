# MYNH ERP V5 — Build status

## Connected production-isolated backend
- Supabase project: `mynh-erp-v5-greenfield`
- Tracking dispatcher Edge Function: active
- Cron dispatcher: every minute
- Quiet hours: 02:00–06:00 Asia/Bangkok
- Internal tracking RPCs: service_role only
- Security advisor: clean at last verification

## Web implemented
- Supabase SSR auth + session refresh
- Dense Rounded Enterprise application shell
- Dashboard from live V5 tables
- User Shopee list + create
- Order list + right detail panel + create Order/Shipment
- Tracking Console + rules + queue + sync logs
- Manual Tracking Sync with role check
- Warehouse/receive overview
- Health API

## Intentionally not faked
- Carrier provider endpoint/config: not configured until a real provider exists
- Telegram credentials/chat routing: not invented
- Receive confirmation: must create a Receive Batch transaction, not a direct status toggle
- Inventory mutation: only after physical warehouse confirmation
