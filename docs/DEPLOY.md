# Deploy MYNH ERP V5

## Isolation rule
Use only the Supabase project `mynh-erp-v5-greenfield` (`nvgxwqapfaslavhtpauh`). Never copy legacy project keys into this application.

## Required Vercel variables
- `NEXT_PUBLIC_SUPABASE_URL=https://nvgxwqapfaslavhtpauh.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<V5 publishable key>`

No service-role key is required by the Next.js frontend. Privileged tracking work stays inside the Supabase Edge Function.

## Runtime
- Next.js App Router
- Vercel region: Singapore (`sin1`)
- Tracking cron remains in Supabase, not Vercel Cron

## Authentication
The web requires a Supabase Auth user. Write actions require `app_metadata.role` equal to `admin` or `operator`; `viewer` is read-only.

## Tracking provider
Auto/Manual tracking does not call any carrier until a row is configured in `tracking_provider_configs`. Do not insert a fake carrier endpoint.
