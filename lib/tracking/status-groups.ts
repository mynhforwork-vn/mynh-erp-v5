export const SHIPPING_TRACKING_STATUSES=[
  'READY_TO_SHIP',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED_TRANSIT_HUB',
  'OUT_FOR_DELIVERY',
] as const

const SHIPPING_TRACKING_STATUS_SET=new Set<string>(SHIPPING_TRACKING_STATUSES)

export function isShippingTrackingStatus(status:unknown){
  return SHIPPING_TRACKING_STATUS_SET.has(String(status??''))
}
