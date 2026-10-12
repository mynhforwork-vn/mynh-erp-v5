import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retired: MYNH ERP uses in-app notifications only.
// This endpoint intentionally cannot send messages, access bot tokens or claim alerts.
// Keep a disabled compatibility endpoint during controlled backend decommission.
Deno.serve(() => new Response(
  JSON.stringify({ok:false,error:"Kênh thông báo Telegram đã ngừng sử dụng"}),
  {
    status:410,
    headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},
  },
));
