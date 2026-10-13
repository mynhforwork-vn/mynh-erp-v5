/** Persisted per-shipment state received after a manual Tracking sync. */
export type TrackingSyncSnapshot={
  shipment_id:string
  tracking_number:string|null
  current_tracking_status:string|null
  tracking_detail:string|null
  tracking_event_time:string|null
  receive_status:string|null
}
export const TRACKING_LIVE_EVENT='mynh:tracking:live-updated'
