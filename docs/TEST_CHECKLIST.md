# V5 Tracking Regression Checklist

- [x] READY_TO_SHIP = 120 minutes
- [x] PICKED_UP = 120 minutes
- [x] IN_TRANSIT = 120 minutes
- [x] ARRIVED_DESTINATION_HUB = 120 minutes + transition alert
- [x] OUT_FOR_DELIVERY = 60 minutes + transition alert
- [x] DELIVERY_FAILED = 120 minutes + transition alert
- [x] DELIVERED = stop tracking + WAITING_RECEIVE
- [x] CANCELLED = stop tracking
- [x] RETURNED = stop tracking
- [x] 02:00–06:00 Asia/Bangkok auto quiet hours
- [x] Manual Sync path is not blocked by quiet hours
- [x] Duplicate event fingerprint is ignored
- [x] Shipment lease/lock prevents duplicate workers
- [x] Internal tracking RPCs restricted to service_role
- [x] Supabase Security Advisor: no current findings
- [ ] Configure real carrier/provider adapter endpoint(s)
- [ ] Telegram sender credentials and destination mapping
- [ ] Vercel deployment and production env variables
