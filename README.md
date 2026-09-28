# MYNH ERP V5 — Greenfield

A completely isolated MYNH ERP implementation. It does **not** share database, environment variables, migrations, or deployment targets with legacy projects.

## Architecture

Next.js App Router → Supabase Auth/RLS/PostgreSQL → Tracking Dispatcher → Provider Adapters → Tracking Events → Alerts / Receive / Warehouse.

## Backend

Dedicated Supabase project: `mynh-erp-v5-greenfield`.

## Design baseline

Option 1 — Hiện đại & Chuyên nghiệp:
- Inter only
- Brand navy #22324A
- Supporting blue #365072
- Background #F5F7FA
- Vietnamese UI
- DD/MM/YYYY HH:mm
- Dense enterprise layout

## Environment

Copy `.env.example` to `.env.local` and use only credentials from the V5 Supabase project.
