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
export type OrderLink={id:string;shopee_order_id:string;receive_status:string}
export type AlertStep={
  id:string;type:string;label:string;created_at:string;is_read:boolean;reason:string|null;
}
export type TrackingOrderNotice={
  id:string;source:'tracking';category:'tracking';severity:'info'|'warning'|'critical';
  title:string;message:string;event_type:string;created_at:string;is_read:boolean;
  requires_action:boolean;is_resolved:false;legacy_ids:string[];notification_id:null;
  order_id:string|null;order_code:string;destination_hub:string;
  group_count:number;target_path:null;timeline:AlertStep[];
}

const codeOnly=/^(?:R[0-9]{2,4}|M[0-9]{2,4}|[A-Z]{1,4}[0-9]{2,4}|N\/?A|NULL|UNDEFINED)$/i
const priority:Record<string,number>={
  PICKUP_FAILED:90,DELIVERY_FAILED:90,DELIVERED:80,OUT_FOR_DELIVERY:70,
  ARRIVED_DESTINATION_HUB:60,PICKED_UP:50,IN_TRANSIT:40,
}
const fallback:Record<string,string>={
  DELIVERED:'Giao hàng thành công',
  OUT_FOR_DELIVERY:'Đang giao hàng',
  ARRIVED_DESTINATION_HUB:'Đến kho đích',
  PICKUP_FAILED:'Lấy hàng không thành công',
  DELIVERY_FAILED:'Giao hàng không thành công',
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
    // Stage priority is more reliable than time of RPC batching, which is the
    // max(created_at) for several events in the same time bucket.
    const ordered=[...events].sort((a,b)=>(priority[b.type]??0)-(priority[a.type]??0)||
      Date.parse(b.created_at)-Date.parse(a.created_at))
    const latest=ordered[0]
    const link=orderByCode.get(code)
    const isRead=events.every(x=>x.is_read)
    const failed=latest.type==='PICKUP_FAILED'||latest.type==='DELIVERY_FAILED'
    const waitingReceive=latest.type==='DELIVERED'&&link?.receive_status==='WAITING_RECEIVE'
    const requiresAction=failed||waitingReceive
    const title=waitingReceive?'Chờ xác nhận nhận hàng':latest.label
    output.push({
      id:'tracking-order:'+code,source:'tracking',category:'tracking',
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
