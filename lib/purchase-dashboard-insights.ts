/**
 * Dashboard nhập hàng: ngày đặt đơn xác định phạm vi; trạng thái là snapshot hiện tại.
 * Không suy diễn HUB từ phường hoặc phường từ HUB. Hỏa tốc không tự tracking.
 */
import { orderIsCancelled, trackingNumberMeansCancelled } from '@/lib/purchase-order-cancellation'

export type PurchaseInsightShipment={
  id:string
  tracking_number:string|null
  carrier:string|null
  current_tracking_status:string|null
  is_active:boolean|null
  created_at?:string|null
}
export type PurchaseInsightOrder={
  id:string
  shopee_order_id:string|null
  order_date:string|null
  recipient_address:string|null
  area:string|null
  destination_hub:string|null
  cod:number|null
  shipping_service:string|null
  express_delivery_status:string|null
  order_status:string|null
  receive_status:string|null
  shipments:PurchaseInsightShipment[]|null
}
export type InsightStage=
  'missing'|'shipping'|'destination'|'out'|'delivered'|'cancelled'|
  'failed'|'pickup_failed'|'ready'|'express_pending'|'other'
export type InsightOrder=PurchaseInsightOrder&{
  stage:InsightStage
  isExpress:boolean
  province:string
  ward:string
  shipment:PurchaseInsightShipment|null
}

const PROVINCE_UNKNOWN='Chưa xác định tỉnh/thành'
const WARD_UNKNOWN='Chưa xác định phường/xã'
const HUB_UNKNOWN='Chưa xác định HUB'
const collator=new Intl.Collator('vi',{sensitivity:'base',numeric:true})

export function areaFromAddress(address:unknown){
  // Chỉ nhận địa giới được viết tường minh sau dấu phẩy/chấm phẩy.
  const chunks=String(address??'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)
  const provincePiece=[...chunks].reverse().find(x=>/^(?:thành\s*phố|tỉnh|tp\.?\s+)/i.test(x))
  const wardPiece=[...chunks].reverse().find(x=>/^(?:phường|xã|thị\s*trấn)\s+/i.test(x))
  const province=provincePiece?.replace(/\s+/g,' ').trim()??PROVINCE_UNKNOWN
  const ward=wardPiece?.replace(/\s+/g,' ').trim()??WARD_UNKNOWN
  return {province,ward}
}
export function latestActiveShipment(order:PurchaseInsightOrder){
  const arr=order.shipments??[]
  return arr.find(x=>x.is_active===true)??arr[0]??null
}
export function classifyPurchaseOrder(order:PurchaseInsightOrder):InsightStage{
  const shipment=latestActiveShipment(order)
  if(orderIsCancelled(order))return 'cancelled'
  if(order.shipping_service==='EXPRESS'){
    if(order.express_delivery_status==='DELIVERED')return 'delivered'
    if(order.express_delivery_status==='FAILED')return 'failed'
    return 'express_pending'
  }
  const number=String(shipment?.tracking_number??'').trim()
  if(!number||trackingNumberMeansCancelled(number))return 'missing'
  switch(shipment?.current_tracking_status){
    case 'DELIVERED':return 'delivered'
    case 'ARRIVED_DESTINATION_HUB':return 'destination'
    case 'OUT_FOR_DELIVERY':return 'out'
    case 'DELIVERY_FAILED':return 'failed'
    case 'PICKUP_FAILED':return 'pickup_failed'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'ARRIVED_TRANSIT_HUB':return 'shipping'
    case 'READY_TO_SHIP':return 'ready'
    default:return 'other'
  }
}

export function toInsightOrder(order:PurchaseInsightOrder):InsightOrder{
  return {
    ...order,
    ...areaFromAddress(order.recipient_address),
    shipment:latestActiveShipment(order),
    stage:classifyPurchaseOrder(order),
    isExpress:order.shipping_service==='EXPRESS',
  }
}
export type InsightCount={
  name:string
  total:number
  missing:number
  shipping:number
  destination:number
  out:number
  delivered:number
  cancelled:number
}
export function groupInsightOrders(rows:InsightOrder[],getName:(o:InsightOrder)=>string){
  const groups=new Map<string,InsightCount>()
  for(const o of rows){
    const name=getName(o)
    const x=groups.get(name)??{name,total:0,missing:0,shipping:0,destination:0,out:0,delivered:0,cancelled:0}
    x.total++
    if(o.stage==='missing')x.missing++
    if(o.stage==='shipping')x.shipping++
    if(o.stage==='destination')x.destination++
    if(o.stage==='out')x.out++
    if(o.stage==='delivered')x.delivered++
    if(o.stage==='cancelled')x.cancelled++
    groups.set(name,x)
  }
  return [...groups.values()].sort((a,b)=>{
    const aActive=a.missing+a.shipping+a.destination+a.out+a.delivered
    const bActive=b.missing+b.shipping+b.destination+b.out+b.delivered
    return bActive-aActive||b.total-a.total||collator.compare(a.name,b.name)
  })
}
/** Hỏa tốc là tồn đọng xác nhận giao, không phải lượng đặt đơn theo ngày. */
export function isExpressAwaitingDeliveryConfirmation(order:PurchaseInsightOrder){
  if(order.shipping_service!=='EXPRESS'||orderIsCancelled(order))return false
  // Khi đã ghi giao thành công hoặc đã bước sang xác nhận nhận hàng thì không đếm.
  if(String(order.express_delivery_status??'').toUpperCase()==='DELIVERED')return false
  return !['WAITING_RECEIVE','RECEIVED'].includes(String(order.receive_status??'').toUpperCase())
}
export function isAwaitingReceipt(o:InsightOrder){
  return o.stage==='delivered' && o.receive_status==='WAITING_RECEIVE'
}
export function issuePriority(o:InsightOrder){
  if(isAwaitingReceipt(o))return 0
  if(o.stage==='failed'||o.stage==='pickup_failed')return 1
  if(o.stage==='missing')return 2
  if(o.stage==='destination')return 3
  if(o.stage==='out')return 4
  if(o.isExpress&&o.stage==='express_pending')return 5
  return 99
}
export function issueLabel(o:InsightOrder){
  if(isAwaitingReceipt(o))return 'Chờ xác nhận nhận'
  if(o.stage==='pickup_failed')return 'Lấy hàng thất bại'
  if(o.stage==='failed')return o.isExpress?'Hỏa tốc giao lỗi':'Giao thất bại'
  if(o.stage==='missing')return 'Bổ sung mã vận đơn'
  if(o.stage==='destination')return 'Đến HUB đích'
  if(o.stage==='out')return 'Đang giao · Theo dõi'
  if(o.isExpress&&o.stage==='express_pending')return 'Theo dõi Hỏa tốc thủ công'
  return 'Chưa cần thao tác'
}
export function sumInsightCounts(rows:InsightOrder[]){
  const counters={
    total:rows.length,express:0,missing:0,shipping:0,destination:0,out:0,
    delivered:0,cancelled:0,failed:0,pickup_failed:0,ready:0,express_pending:0,
    waiting:0,unknownRegion:0,unknownHub:0,
  }
  for(const o of rows){
    if(isExpressAwaitingDeliveryConfirmation(o))counters.express++
    if(o.stage in counters){
      const k=o.stage as keyof typeof counters
      counters[k]++
    }
    if(isAwaitingReceipt(o))counters.waiting++
    if(o.ward===WARD_UNKNOWN||o.province===PROVINCE_UNKNOWN)counters.unknownRegion++
    if(o.destination_hub===null||!String(o.destination_hub).trim())counters.unknownHub++
  }
  return counters
}
export function wardGroupKey(o:InsightOrder){
  return o.province+'|'+o.ward
}
export const insightUnknownLabels={province:PROVINCE_UNKNOWN,ward:WARD_UNKNOWN,hub:HUB_UNKNOWN}
