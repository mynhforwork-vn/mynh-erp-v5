import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

type Mode="AUTO"|"MANUAL";
type AlertRow={
  id:string;
  order_id:string;
  shipment_id:string;
  alert_type:string;
  destination_hub:string|null;
  delivery_attempt_count:number;
  created_at:string;
};
type Runtime={
  enabled:boolean;
  default_chat_id:string|null;
  bot_token:string|null;
  retry_minutes:number[];
  max_attempts:number;
  enabled_at:string|null;
};
type Destination={
  destination_hub:string;
  chat_id:string;
  alert_types:string[]|null;
  is_active:boolean;
};

const supabaseUrl=Deno.env.get("SUPABASE_URL");
const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(!supabaseUrl||!serviceRoleKey)throw new Error("Missing Supabase runtime variables");

const db=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{"content-type":"application/json; charset=utf-8"},
  });
}

async function authorize(req:Request):Promise<Mode|null>{
  const cron=req.headers.get("x-cron-secret")??"";
  if(cron){
    const {data,error}=await db.rpc("verify_telegram_cron_secret",{p_secret:cron});
    if(!error&&data===true)return "AUTO";
  }

  const auth=req.headers.get("authorization")??"";
  if(auth.toLowerCase().startsWith("bearer ")){
    const token=auth.slice(7).trim();
    const {data,error}=await db.auth.getUser(token);
    const role=data.user?.app_metadata?.role;
    if(!error&&data.user&&(role==="admin"||role==="operator"))return "MANUAL";
  }
  return null;
}

function money(value:unknown){
  const n=Number(value??0);
  return new Intl.NumberFormat("vi-VN").format(Number.isFinite(n)?n:0)+" ₫";
}

function title(type:string){
  if(type==="PICKUP_FAILED")return "⚠️ LẤY HÀNG KHÔNG THÀNH CÔNG";
  if(type==="ARRIVED_DESTINATION_HUB")return "📦 ĐƠN ĐẾN KHO";
  if(type==="OUT_FOR_DELIVERY")return "🛵 ĐƠN ĐANG GIAO";
  if(type==="DELIVERED")return "✅ GIAO THÀNH CÔNG";
  if(type==="DELIVERY_FAILED")return "⚠️ GIAO KHÔNG THÀNH CÔNG";
  return "🔔 CẢNH BÁO VẬN CHUYỂN";
}

async function sendMessage(token:string,chatId:string,text:string){
  const res=await fetch("https://api.telegram.org/bot"+encodeURIComponent(token)+"/sendMessage",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      chat_id:chatId,
      text,
      disable_web_page_preview:true,
    }),
  });
  const body=await res.json().catch(()=>({ok:false,description:"Invalid Telegram response"}));
  if(!res.ok||body?.ok!==true){
    throw new Error(String(body?.description??("Telegram HTTP "+res.status)));
  }
  return String(body?.result?.message_id??"");
}

function chunks(header:string,entries:string[]){
  const out:string[]=[];
  let current=header;
  for(const entry of entries){
    const next=current+"\n\n"+entry;
    if(next.length>3800&&current!==header){
      out.push(current);
      current=header+"\n\n"+entry;
    }else{
      current=next;
    }
  }
  if(current!==header)out.push(current);
  return out;
}

async function loadRuntime():Promise<Runtime|null>{
  const {data,error}=await db.rpc("get_telegram_alert_runtime_settings").maybeSingle();
  if(error)throw error;
  return data as Runtime|null;
}

async function markFailure(ids:string[],message:string){
  if(!ids.length)return;
  const {error}=await db.rpc("mark_telegram_alert_failure",{
    p_alert_ids:ids,
    p_error:message.slice(0,1000),
  });
  if(error)throw error;
}

async function completeDelivery(ids:string[],chatId:string,messageIds:string[]){
  if(!ids.length)return;
  const {error}=await db.rpc("complete_telegram_alert_delivery",{
    p_alert_ids:ids,
    p_chat_id:chatId,
    p_message_ids:messageIds.filter(Boolean).join(","),
  });
  if(error)throw error;
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);

  const mode=await authorize(req);
  if(!mode)return json({error:"Unauthorized"},401);

  let body:{limit?:number;test?:boolean;chat_id?:string}={};
  try{body=await req.json()}catch{}

  let runtime:Runtime|null=null;
  try{
    runtime=await loadRuntime();
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},500);
  }

  if(mode==="AUTO"&&!runtime?.enabled){
    return json({ok:true,enabled:false,claimed:0,results:[]});
  }

  if(!runtime?.bot_token){
    return json({error:"Telegram Bot Token chưa được cấu hình"},409);
  }

  if(mode==="MANUAL"&&body.test){
    const chatId=String(body.chat_id??runtime.default_chat_id??"").trim();
    if(!chatId)return json({error:"Chưa cấu hình Chat ID"},409);
    try{
      const messageId=await sendMessage(
        runtime.bot_token,
        chatId,
        "✅ MYNH ERP · Kết nối Telegram thành công\nThời gian: "+
          new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})
      );
      return json({ok:true,test:true,chat_id:chatId,message_id:messageId});
    }catch(error){
      return json({ok:false,error:error instanceof Error?error.message:String(error)},502);
    }
  }

  const limit=Math.min(Math.max(Number(body.limit??100),1),500);
  const {data:rawAlerts,error:claimError}=await db.rpc("claim_due_telegram_alerts",{p_limit:limit});
  if(claimError)return json({error:claimError.message},500);

  const alerts=(rawAlerts??[]) as AlertRow[];
  if(!alerts.length){
    return json({ok:true,enabled:true,claimed:0,results:[]});
  }

  const orderIds=[...new Set(alerts.map(x=>x.order_id))];
  const shipmentIds=[...new Set(alerts.map(x=>x.shipment_id))];

  const [
    {data:orders,error:ordersError},
    {data:items,error:itemsError},
    {data:shipments,error:shipmentsError},
    {data:destinations,error:destError},
  ]=await Promise.all([
    db.from("orders")
      .select("id,shopee_order_id,cod,recipient_address,recipient_name,recipient_phone,destination_hub")
      .in("id",orderIds),
    db.from("order_items")
      .select("order_id,product_name,variant,quantity")
      .in("order_id",orderIds),
    db.from("shipments")
      .select("id,tracking_number")
      .in("id",shipmentIds),
    db.from("telegram_alert_destinations")
      .select("destination_hub,chat_id,alert_types,is_active")
      .eq("is_active",true),
  ]);

  const dataError=ordersError??itemsError??shipmentsError??destError;
  if(dataError){
    try{
      await markFailure(alerts.map(x=>x.id),"ALERT_DATA_LOAD_ERROR: "+dataError.message);
    }catch{}
    return json({error:dataError.message},500);
  }

  const orderMap=new Map((orders??[]).map((x:any)=>[String(x.id),x]));
  const shipmentMap=new Map((shipments??[]).map((x:any)=>[String(x.id),x]));
  const itemMap=new Map<string,any[]>();

  for(const item of (items??[]) as any[]){
    const key=String(item.order_id);
    const list=itemMap.get(key)??[];
    list.push(item);
    itemMap.set(key,list);
  }

  const destRows=(destinations??[]) as Destination[];
  const groups=new Map<string,{chatId:string;hub:string;type:string;alerts:AlertRow[]}>();
  const results:any[]=[];

  for(const alert of alerts){
    const hub=String(alert.destination_hub??"").trim();
    const override=destRows.find(x=>
      x.destination_hub===hub&&
      (!x.alert_types||x.alert_types.length===0||x.alert_types.includes(alert.alert_type))
    );
    const chatId=String(override?.chat_id??runtime.default_chat_id??"").trim();

    if(!chatId){
      try{
        await markFailure([alert.id],"NO_TELEGRAM_CHAT_ID");
      }catch{}
      results.push({
        ok:false,
        hub,
        type:alert.alert_type,
        count:1,
        error:"NO_TELEGRAM_CHAT_ID",
      });
      continue;
    }

    const key=[chatId,hub,alert.alert_type].join("|");
    const group=groups.get(key)??{
      chatId,
      hub,
      type:alert.alert_type,
      alerts:[],
    };
    group.alerts.push(alert);
    groups.set(key,group);
  }

  for(const group of groups.values()){
    const entries=group.alerts.map((alert,index)=>{
      const order:any=orderMap.get(alert.order_id)??{};
      const shipment:any=shipmentMap.get(alert.shipment_id)??{};
      const products=(itemMap.get(alert.order_id)??[]).map((x:any)=>{
        const variant=x.variant?(" · "+x.variant):"";
        return String(x.product_name??"Sản phẩm")+variant+" x"+String(x.quantity??1);
      }).join("; ")||"—";

      return [
        String(index+1)+". Mã đơn: "+String(order.shopee_order_id??alert.order_id),
        "MVD: "+String(shipment.tracking_number??"—"),
        "Sản phẩm: "+products,
        "COD: "+money(order.cod),
        "Địa chỉ: "+String(order.recipient_address??"—"),
        "Người nhận: "+String(order.recipient_name??"—"),
        "SĐT: "+String(order.recipient_phone??"—"),
      ].join("\n");
    });

    const header=
      title(group.type)+
      "\nHUB: "+(group.hub||"Không xác định")+
      "\nSố đơn: "+group.alerts.length;

    try{
      const ids:string[]=[];
      for(const message of chunks(header,entries)){
        ids.push(await sendMessage(runtime.bot_token,group.chatId,message));
      }
      await completeDelivery(
        group.alerts.map(x=>x.id),
        group.chatId,
        ids
      );
      results.push({
        ok:true,
        hub:group.hub,
        type:group.type,
        count:group.alerts.length,
        chat_id:group.chatId,
        message_count:ids.length,
      });
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      try{
        await markFailure(group.alerts.map(x=>x.id),message);
      }catch{}
      results.push({
        ok:false,
        hub:group.hub,
        type:group.type,
        count:group.alerts.length,
        error:message,
      });
    }
  }

  const ok=results.every(x=>x.ok);
  return json({
    ok,
    enabled:true,
    claimed:alerts.length,
    results,
  },ok?200:502);
});
