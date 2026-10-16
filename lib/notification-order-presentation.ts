/**
 * Pure presentation model for legacy tracking alerts.
 * Groups by Shopee order, not by status or HUB; read != requires action.
 * Does not write to Supabase or change the underlying tracking history.
 */
export type LegacyAlert={
  alert_ids:string[];alert_type:string;label:string;destination_hub:string;
  alert_count:number;order_codes:string[];primary_order_id:string|null;
  reason_summary:string|null;created_at:string;is_read:boolean;
}
export type OrderLink={
  id:string;shopee_order_id:string;receive_status:string;
  order_status?:string|null;
  shipments?:{
    is_active?:boolean|null;tracking_number?:string|null;
    current_tracking_status?:string|null;
  }[]|null;
}
export type AlertStep={
  id:string;type:string;label:string;created_at:string;is_read:boolean;reason:string|null;
}
export type TrackingOrderNotice={
  id:string;source:'tracking';category:'tracking';severity:'info'|'warning'|'critical';
  // Only a current failed-delivery state is actionable; past failures stay in history.
  reminder_active:boolean;
  title:string;message:string;event_type:string;created_at:string;is_read:boolean;
  requires_action:boolean;is_resolved:false;legacy_ids:string[];notification_id:null;
  order_id:string|null;order_code:string;destination_hub:string;
  group_count:number;target_path:null;timeline:AlertStep[];
}

const codeOnly=/^(?:R[0-9]{2,4}|M[0-9]{2,4}|[A-Z]{1,4}[0-9]{2,4}|N\/?A|NULL|UNDEFINED)$/i
const fallback:Record<string,string>={
  READY_TO_SHIP:'Chờ lấy hàng',
  PICKED_UP:'Đã lấy hàng',
  IN_TRANSIT:'Đang vận chuyển',
  ARRIVED_TRANSIT_HUB:'Đến HUB trung chuyển',
  ARRIVED_DESTINATION_HUB:'Đến kho đích',
  OUT_FOR_DELIVERY:'Đang giao hàng',
  DELIVERY_FAILED:'Giao hàng không thành công',
  PICKUP_FAILED:'Lấy hàng không thành công',
  DELIVERED:'Giao hàng thành công',
  RETURNED:'Đã hoàn hàng',
}
export function cleanTrackingReason(input:string|null|undefined):string|null{
  if(!input)return null
  const pieces=input.split(/\s*[·|;,]\s*/).map(x=>x.trim())
    .filter(x=>x.length>0&&!codeOnly.test(x))
  return pieces.length?pieces.join(' · '):null
}
export function buildOrderNotices(rows:LegacyAlert[],orderLinks:OrderLink[]):TrackingOrderNotice[]{
  const orderByCode=new Map(orderLinks.map(x=>[x.shopee_order_id,x]))
  const groups=new Map<string,{code:string;events:AlertStep[];hub:string}>()
  for(const row of rows){
    const codes=Array.isArray(row.order_codes)?row.order_codes:[]
    const ids=Array.isArray(row.alert_ids)?row.alert_ids:[]
    // Legacy RPC aggregates alert_ids and order_codes in matching order.
    for(let i=0;i<codes.length;i++){
      const code=String(codes[i]??'').trim()
      const id=ids[i]
      if(!code||!id)continue
      const value=groups.get(code)??{code,events:[],hub:''}
      if(value.events.some(x=>x.id===id))continue
      value.events.push({
        id,type:row.alert_type,label:row.label||fallback[row.alert_type]||'Cập nhật vận chuyển',
        created_at:row.created_at,is_read:row.is_read,
        reason:cleanTrackingReason(row.reason_summary),
      })
      if(row.destination_hub)value.hub=row.destination_hub
      groups.set(code,value)
    }
  }
  const output:TrackingOrderNotice[]=[]
  for(const {code,events,hub} of groups.values()){
    const link=orderByCode.get(code)
    const activeShipment=link?.shipments?.find(s=>s.is_active)??link?.shipments?.[0]
    const liveStatus=String(activeShipment?.current_tracking_status??'').toUpperCase()
    // The route already applies orderIsCancelled, including no-MVD markers;
    // keep this pure order-level fallback for archived/legacy render callers.
    const orderStatus=String(link?.order_status??'').trim().toUpperCase()
    if(orderStatus==='CANCELLED'||orderStatus==='CANCELED'||liveStatus==='CANCELLED')continue
    // The timeline remains chronological, not severity-sorted; a past
    // failure must not obscure subsequent transport or a redelivery attempt.
    const ordered=[...events].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
    const recent=ordered[0]
    // Use the current shipment status if recognized, even if no corresponding
    // alert event was emitted. Do not invent timeline events or timestamps.
    const matchingLive=ordered.find(x=>x.type===liveStatus)
    const latest=link&&fallback[liveStatus]
      ?{...recent,type:liveStatus,label:fallback[liveStatus],
        reason:matchingLive?.reason??null,
        created_at:matchingLive?.created_at??recent.created_at}
      :recent
    // Only a CURRENT DELIVERY_FAILED status stays actionable/unread. Retry,
    // return, delivery and cancellation clear the pin, not the audit history.
    const reminderActive=Boolean(link)&&events.some(x=>x.type==='DELIVERY_FAILED')
      &&(liveStatus==='DELIVERY_FAILED'||(!liveStatus&&recent.type==='DELIVERY_FAILED'))
    const isRead=!reminderActive&&events.every(x=>x.is_read)
    const failed=latest.type==='PICKUP_FAILED'||latest.type==='DELIVERY_FAILED'
    const waitingReceive=latest.type==='DELIVERED'&&link?.receive_status==='WAITING_RECEIVE'
    const requiresAction=failed||waitingReceive
    const title=waitingReceive?'Chờ xác nhận nhận hàng':latest.label
    output.push({
      id:'tracking-order:'+code,source:'tracking',category:'tracking',
      reminder_active:reminderActive,
      severity:failed?'critical':requiresAction?'warning':latest.type==='DELIVERED'?'info':'warning',
      title,message:code+(hub?' · '+hub:''),
      event_type:latest.type,created_at:latest.created_at,
      is_read:isRead,requires_action:requiresAction,is_resolved:false,
      legacy_ids:events.map(x=>x.id),notification_id:null,
      order_id:link?.id??null,order_code:code,destination_hub:hub,
      group_count:events.length,target_path:null,timeline:ordered,
    })
  }
  return output.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
}
