# MYNH ERP — Cloudflare Rebuild

Baseline: commit 407fc93168237ca6e5ac891d9827f1ad5b360643 (last known successful Cloudflare Workers build).

Rules:
- GitHub + Cloudflare are the source of truth.
- Floot is frozen as a visual reference only.
- Do not modify main during rebuild.
- Rebuild visual system and responsive UI incrementally on this branch.
- Validate build after each coherent change before porting the next module.

Build environment note:
- Preview build variables for Supabase were configured in Cloudflare on 2026-10-02.
- This commit intentionally retriggers the Preview build after that configuration change.

- Preview build variables verified in Cloudflare Builds > Previews Base on 2026-10-02.

- Preview commands verified: OpenNext build + wrangler preview.

- Retrigger after recursive build fix confirmed at branch head d091fb6.

- Retrigger after cancelling stale recursive build and saving Preview Base commands.
