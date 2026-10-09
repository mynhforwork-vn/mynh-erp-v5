/**
 * Non-persistent operational task signals. Unlike tracking alerts, these
 * represent pending work derived from current order state, not delivery events.
 * Recompute from Supabase on the existing 5-minute notification GET only.
 */
export type TaskOrder={
 id:string;shopee_order_id:string|null;order_date:string;
 order_status:string|null;shipping_service:string|null;
 receive_status:string|null;warehouse_status:string|null;
 destination_hub:string|null;cod:number|null;
 recipient_name?:string|null;recipient_phone?:string|null;recipient_address?:string|null;
 erp_users?:{username?:string|null}|{username?:string|null}[]|null;
 order_items?:Array<{product_name:string;variant?:string|null;quantity:number}>|null;
 shipments?:Array<{id:string;tracking_number:string|null;carrier:string|null;is_active:boolean;current_tracking_status?:string|null}>|null;
}
export type OrderWorkType='tracking_missing'|'warehouse_intake'
export type OrderWorkNotice={
 id:string;source:'work';work_type:OrderWorkType;category:'purchase'|'warehouse';
 severity:'warning'|'info';title:string;message:string;event_type:string;
 created_at:string;is_read:true;requires_action:true;is_resolved:false;
 legacy_ids:[];notification_id:null;order_id:string;order_code:string;
 destination_hub:string;group_count:0;target_path:string;
 receive_status:string;warehouse_status:string;shipping_service:string;
 username:string|null;cod:number|null;recipient_name:string|null;
 recipient_phone:string|null;recipient_address:string|null;
 tracking_number:string|null;carrier:string|null;
 products:Array<{product_name:string;variant:string|null;quantity:number}>;
}
export function missingMvd(order:TaskOrder){
 if(order.receive_status==='RECEIVED'||order.receive_status==='WAITING_RECEIVE')return false
 if(['CANCELLED','RETURNED','COMPLETED'].includes(String(order.order_status??'').toUpperCase()))return false
 return !(order.shipments??[]).some(s=>s.is_active&&Boolean(String(s.tracking_number??'').trim()))
}
export function pendingIntake(order:TaskOrder){
 return order.receive_status==='RECEIVED'&&order.warehouse_status==='READY_TO_TRANSFER'
}
export function buildOrderWorkNotices(orders:TaskOrder[]):OrderWorkNotice[]{
 const notices:OrderWorkNotice[]=[]
 for(const order of orders){
  const type:OrderWorkType|null=missingMvd(order)?'tracking_missing'
   :pendingIntake(order)?'warehouse_intake':null
  if(!type)continue
  const username=Array.isArray(order.erp_users)?order.erp_users[0]?.username:order.erp_users?.username
  const shipment=(order.shipments??[]).find(s=>s.is_active)??null
  const missing=type==='tracking_missing'
  notices.push({
   id:'work:'+type+':'+order.id,source:'work',work_type:type,
   category:missing?'purchase':'warehouse',severity:missing?'warning':'info',
   title:missing?'Cập nhật mã vận đơn':'Chờ nhập kho',
   message:missing?'Đơn vừa tạo/chưa có MVD':'Đơn đã nhận, cần bóc tách hoặc nhập kho',
   event_type:missing?'MISSING_TRACKING':'WAREHOUSE_INTAKE',
   created_at:order.order_date,is_read:true,requires_action:true,is_resolved:false,
   legacy_ids:[],notification_id:null,order_id:order.id,
   order_code:order.shopee_order_id||order.id,destination_hub:missing?String(order.destination_hub??''):'',
   group_count:0,target_path:missing?'/purchase/orders?order='+encodeURIComponent(order.id):
     '/warehouse/receive?state=all',receive_status:String(order.receive_status??''),
   warehouse_status:String(order.warehouse_status??''),shipping_service:String(order.shipping_service??'STANDARD'),
   username:username??null,cod:order.cod===null?null:Number(order.cod),
   recipient_name:order.recipient_name??null,recipient_phone:order.recipient_phone??null,
   recipient_address:order.recipient_address??null,
   tracking_number:shipment?.tracking_number??null,carrier:shipment?.carrier??null,
   products:(order.order_items??[]).map(item=>({
    product_name:item.product_name,variant:item.variant??null,quantity:Number(item.quantity)||1,
   })),
  })
 }
 return notices.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
}
