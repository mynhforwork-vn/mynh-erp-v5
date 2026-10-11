// "KHÔNG CÓ" is the user's explicit no-shipment cancellation marker.
// Do not send this placeholder to carrier detection or provider tracking.
// Existing records remain unchanged in DB until explicitly edited.
export function trackingNumberMeansCancelled(value:unknown):boolean{
  return String(value??'').trim().replace(/\s+/g,' ').toLocaleUpperCase('vi-VN')==='KHÔNG CÓ'
}
type ShipmentLike={tracking_number?:string|null,current_tracking_status?:string|null,is_active?:boolean|null}
export function orderIsCancelled(order:{
  order_status?:string|null,
  shipments?:ShipmentLike[]|null,
}):boolean{
  const orderStatus=String(order.order_status??'').trim().toUpperCase()
  if(orderStatus==='CANCELLED'||orderStatus==='CANCELED')return true
  const shipment=(order.shipments??[]).find(s=>s.is_active)??order.shipments?.[0]
  return shipment?.current_tracking_status==='CANCELLED'
    ||trackingNumberMeansCancelled(shipment?.tracking_number)
}
