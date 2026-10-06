import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
  });
}
function secretKey(){
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){
    try{
      const parsed=JSON.parse(modern);
      if(parsed?.default)return parsed.default as string;
    }catch{}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")??"";
    const anon=Deno.env.get("SUPABASE_ANON_KEY")??"";
    const authHeader=req.headers.get("Authorization")??"";
    const token=authHeader.replace(/^Bearer\s+/i,"").trim();
    if(!url||!anon||!token)return json({error:"Unauthorized"},401);

    const userClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser(token);
    if(userError||!user)return json({error:"Unauthorized"},401);
    if(String(user.app_metadata?.role??"viewer")!=="admin")return json({error:"Admin role required"},403);

    const admin=createClient(url,secretKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action??"");

    if(action==="create"){
      const email=String(body?.email??"").trim().toLowerCase();
      const password=String(body?.password??"");
      const role=String(body?.role??"viewer").trim().toLowerCase();
      if(!email||!email.includes("@"))return json({error:"Email không hợp lệ"},400);
      if(password.length<10)return json({error:"Mật khẩu tạm cần ít nhất 10 ký tự"},400);
      if(!["admin","operator","viewer"].includes(role))return json({error:"Vai trò không hợp lệ"},400);

      const {data,error}=await admin.auth.admin.createUser({
        email,
        password,
        email_confirm:true,
        app_metadata:{role},
        user_metadata:{created_from:"MYNH ERP Admin"},
      });
      if(error)return json({error:error.message},400);
      return json({ok:true,user:{id:data.user?.id,email:data.user?.email,role}});
    }


    if(action==="delete"){
      const userId=String(body?.user_id??"").trim();
      if(!userId)return json({error:"Thiếu tài khoản"},400);
      if(userId===user.id)return json({error:"Không thể xóa chính tài khoản Admin đang đăng nhập"},400);

      const {data:target,error:targetError}=await admin.auth.admin.getUserById(userId);
      if(targetError||!target?.user)return json({error:"Tài khoản không tồn tại"},404);

      const {error}=await admin.auth.admin.deleteUser(userId);
      if(error)return json({error:error.message},400);
      return json({ok:true,user:{id:userId,email:target.user.email??null}});
    }

    if(action==="set_password"){
      const userId=String(body?.user_id??"").trim();
      const password=String(body?.password??"");
      if(!userId)return json({error:"Thiếu tài khoản"},400);
      if(password.length<10)return json({error:"Mật khẩu mới cần ít nhất 10 ký tự"},400);
      const {data,error}=await admin.auth.admin.updateUserById(userId,{password});
      if(error)return json({error:error.message},400);
      return json({ok:true,user:{id:data.user?.id,email:data.user?.email}});
    }

    return json({error:"Action không hợp lệ"},400);
  }catch(error){
    return json({error:error instanceof Error?error.message:"Lỗi quản trị tài khoản"},500);
  }
});
