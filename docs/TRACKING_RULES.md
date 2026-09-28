# MYNH ERP V5 Tracking Rules

- READY_TO_SHIP: 120 minutes
- PICKED_UP: 120 minutes
- IN_TRANSIT: 120 minutes
- ARRIVED_DESTINATION_HUB: 120 minutes + alert
- OUT_FOR_DELIVERY: 60 minutes + alert
- DELIVERY_FAILED: 120 minutes + alert
- DELIVERED: alert + stop auto tracking
- CANCELLED: stop auto tracking
- RETURNED: stop auto tracking
- Quiet hours: 02:00–06:00 Asia/Bangkok. Auto tracking is disabled; Manual Sync remains allowed.
- Alerts are emitted only on a valid status transition.
- Tracking events are append-only and deduplicated by shipment/fingerprint.
