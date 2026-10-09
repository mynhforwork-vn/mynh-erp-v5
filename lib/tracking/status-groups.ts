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

/**
 * Giai đoạn trước khi vận đơn tới HUB kho đích.
 * Cần có MVD thật. Các trạng thái đã đến HUB, đang giao cuối,
 * giao thành công/thất bại, hủy và trả hàng không thuộc trung chuyển.
 *
 * UNKNOWN/không có trạng thái không được mặc nhiên coi là đang trung chuyển:
 * vận đơn chưa được provider xác thực giai đoạn vận chuyển.
 */
export const PRE_DESTINATION_TRANSIT_STATUSES=[
  'READY_TO_SHIP',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED_TRANSIT_HUB',
] as const

const PRE_DESTINATION_TRANSIT_SET=new Set<string>(PRE_DESTINATION_TRANSIT_STATUSES)

export function isPreDestinationTransit(trackingNumber:unknown,status:unknown){
  return typeof trackingNumber==='string'
    && trackingNumber.trim().length>0
    && PRE_DESTINATION_TRANSIT_SET.has(String(status??''))
}
