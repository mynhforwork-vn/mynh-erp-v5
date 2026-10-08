import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY } from '@/lib/supabase/config'

/**
 * Reverify the CURRENT signed-in ERP account without replacing its session.
 * No passwords, access tokens or verification results are persisted or logged.
 */
export async function verifyAccountPassword(user:{id:string,email?:string|null},password:string){
  if(!password)return {ok:false as const,error:'Vui lòng nhập mật khẩu đăng nhập tài khoản ERP.'}
  if(password.length>1024)return {ok:false as const,error:'Mật khẩu không hợp lệ.'}
  if(!user?.id||!user.email)return {ok:false as const,error:'Tài khoản này không có email để xác minh mật khẩu.'}

  try{
    // A disposable Auth client: signing in must NOT mutate the current
    // SSR cookie session or the browser's login state.
    const verifier=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    })
    const {data,error}=await verifier.auth.signInWithPassword({
      email:user.email,
      password,
    })
    if(error||!data.user||data.user.id!==user.id){
      return {ok:false as const,error:'Mật khẩu đăng nhập không chính xác.'}
    }
    return {ok:true as const}
  }catch{
    return {ok:false as const,error:'Không xác minh được mật khẩu lúc này. Vui lòng thử lại sau.'}
  }
}
