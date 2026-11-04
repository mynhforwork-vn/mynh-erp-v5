import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const dynamic='force-dynamic'
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'Pragma':'no-cache',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function POST(req:Request){
  const origin=req.headers.get('origin')
  // This route returns an active browser session secret; reject cross-origin requests.
  if(!origin||new URL(origin).host!==new URL(req.url).host){
    return NextResponse.json({error:'Yêu cầu không hợp lệ'},{status:403,headers})
  }
  const supabase=await createClient()
  const {data:{user},error:authError}=await supabase.auth.getUser()
  if(authError||!user)return NextResponse.json({error:'Chưa đăng nhập'},{status:401,headers})
  if(!['admin','operator'].includes(String(user.app_metadata?.role??'')))
    return NextResponse.json({error:'Không có quyền sao chép'},{status:403,headers})
  let body:unknown
  try{body=await req.json()}catch{return NextResponse.json({error:'Dữ liệu không hợp lệ'},{status:400,headers})}
  const value=(body&&typeof body==='object'?body:{}) as Record<string,unknown>
  const userId=value.user_id
  const kind=value.kind
  if(typeof userId!=='string'||!UUID.test(userId)||(kind!=='SPC_ST'&&kind!=='SPC_F'))
    return NextResponse.json({error:'Dữ liệu không hợp lệ'},{status:400,headers})
  // Database RPC independently enforces role checks and audits copy without logging secrets.
  const {data,error}=await supabase.rpc('get_erp_user_spc_for_copy',{p_user_id:userId,p_kind:kind})
  if(error||typeof data!=='string'||!data)
    return NextResponse.json({error:'Chưa thể sao chép SPC'},{status:503,headers})
  return NextResponse.json({secret:data},{headers})
}
