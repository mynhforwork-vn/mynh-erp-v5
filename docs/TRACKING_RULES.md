# MYNH ERP V5 Tracking Rules

## Source of truth

Runtime rules are stored in Postgres rather than hard-coded in the UI:

- `tracking_runtime_settings`: Auto Tracking master switch, quiet hours, provider-error retry schedule.
- `tracking_rule_configs`: interval and Auto Tracking switch for each canonical status.
- `carrier_status_mappings`: carrier raw code → MYNH canonical status.
- `destination_hub_configs.tracking_location_aliases`: exact carrier locations that MYNH is allowed to treat as configured destination HUBs.

Admins edit these values in **Cài đặt hệ thống → Tracking**. Terminal statuses remain locked to STOP.

## Canonical statuses and defaults

| Canonical status | Default | Notes |
| --- | ---: | --- |
| READY_TO_SHIP | 120 min | Waiting for carrier pickup |
| PICKUP_FAILED | 120 min | Pickup attempt failed; raw reason is retained |
| PICKED_UP | 120 min | Carrier pickup successful |
| IN_TRANSIT | 120 min | Network transit |
| ARRIVED_TRANSIT_HUB | 120 min | Intermediate/unknown HUB |
| ARRIVED_DESTINATION_HUB | 120 min | Only when raw location matches an active configured HUB/alias |
| OUT_FOR_DELIVERY | 60 min | Priority delivery phase |
| DELIVERY_FAILED | 120 min | Delivery attempt failed; may retry or enter return flow |
| RETURNING | 120 min | Return-to-sender movement |
| UNKNOWN | 120 min | Raw state not mapped yet; raw event is still stored |
| DELIVERED | STOP | Terminal |
| CANCELLED | STOP | Terminal |
| RETURNED | STOP | Terminal |

Non-terminal intervals are configurable per status from 15 to 1440 minutes.

## Scheduling

- Cron may wake every minute, but it claims only shipments with `next_track_at <= now()`.
- Default quiet hours are **02:00–06:00 Asia/Bangkok**. Auto Tracking pauses; Manual Sync remains available.
- Provider failures use configurable backoff, default **10 → 30 → 60 minutes**.
- Saving a status interval immediately reschedules active shipments currently in that status.
- Disabling Auto Tracking for a status immediately removes those shipments from the due queue.
- Express/Hỏa tốc remains manual-only unless a dedicated provider is added later.

## Raw status strategy

Carrier responses are retained with raw code/name/description/location/reason/payload.

Known raw codes are mapped through `carrier_status_mappings`. Unknown raw codes normalize to `UNKNOWN` rather than failing the tracking job. They appear in the Tracking settings mapping queue so an Admin can classify them later.

For SPX, raw-code mapping is primary. Text/name fallback is used only when no known raw-code mapping exists.

## Destination HUB rule

A carrier event is **not** considered `ARRIVED_DESTINATION_HUB` merely because its text says “Last Mile Hub” or “đến kho”.

For SPX `F599`:
- if `current_location.location_name` exactly matches an active configured `hub_code` or one of its `tracking_location_aliases`, normalize to `ARRIVED_DESTINATION_HUB` and persist that configured HUB;
- otherwise normalize to `ARRIVED_TRANSIT_HUB`.

This keeps carrier network locations separate from MYNH's configured operational destination HUBs.

## Transition safety

Tracking history is append-only and deduplicated by shipment/fingerprint.

Current shipment status is phase-aware rather than a simple numeric rank:
- `IN_TRANSIT ↔ ARRIVED_TRANSIT_HUB` may repeat through multiple SOC/HUBs.
- `OUT_FOR_DELIVERY / DELIVERY_FAILED → ARRIVED_DESTINATION_HUB` is allowed when the parcel returns to the configured delivery HUB.
- A known current state does not regress to `UNKNOWN`.
- `PICKED_UP` does not regress to pre-pickup states.
- `DELIVERED`, `CANCELLED`, and `RETURNED` are terminal and stop Auto Tracking.

## SPX direct adapter

SPX is connected through the MYNH `SPX_PUBLIC` adapter using the public SPX tracking response. The adapter stores raw SPX records and normalizes them through the mapping table.

The settings screen includes a non-mutating tracking-number connection test. Shipment Manual Sync continues to use the normal authenticated tracking path.

## Notifications

Notification/Telegram rules are intentionally separate from Tracking configuration. Tracking determines and stores status transitions; notification behavior is configured independently.
