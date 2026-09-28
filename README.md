# MYNH ERP V5 — Greenfield

A completely isolated MYNH ERP implementation. It does **not** share database, environment variables, migrations, or deployment targets with legacy projects.

## Architecture

Next.js App Router → Supabase Auth/RLS/PostgreSQL → Tracking Dispatcher → Provider Adapters → Tracking Events → Alerts / Receive / Warehouse.

## Backend

Dedicated Supabase project: `mynh-erp-v5-greenfield`.

Tracking rules:
- READY_TO_SHIP / PICKED_UP / IN_TRANSIT / ARRIVED_DESTINATION_HUB / DELIVERY_FAILED: 120 minutes
- OUT_FOR_DELIVERY: 60 minutes
- DELIVERED / CANCELLED / RETURNED: stop auto tracking
- Quiet hours: 02:00–06:00 Asia/Bangkok
- Manual Sync remains available during quiet hours

## Web modules currently implemented

- Login/session shell
- Dashboard
- User Shopee
- Orders + right-side detail panel
- Create Order + Shipment
- Tracking Console
- Manual Tracking Sync
- Warehouse / Receive overview

See `docs/BUILD_STATUS.md` for current state.

## Environment

Copy `.env.example` to `.env.local` and use only credentials from the V5 Supabase project.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```
