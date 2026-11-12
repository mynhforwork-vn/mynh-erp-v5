'use server'
import {requireUser} from '@/lib/supabase/auth'
import {
 validColor,validateRuleInput,
 type RowMarkColor,type RowHighlightRule,type RowRuleCondition
} from '@/lib/erp-row-highlights'

const scope='warehouse_receive'
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function enabled(){if(process.env.ERP_TABLE_HIGHLIGHTS_LIVE!=='true')
 throw Error('Chức năng đánh dấu bảng chưa được bật ở môi trường này')}
function validIds(ids:unknown):string[]{
 if(!Array.isArray(ids)||ids.length<1||ids.length>100||
  ids.some(x=>typeof x!=='string'||!uuid.test(x)))
  throw Error('Chọn từ 1 đến 100 đơn hợp lệ mỗi lần')
 return [...new Set(ids)]
}
async function access(write=false){
 enabled()
 const {supabase,user}=await requireUser()
 if(!user?.id||!uuid.test(user.id))throw Error('Cần đăng nhập để sử dụng đánh dấu')
 const role=String(user.app_metadata?.role??'viewer')
 if(!['admin','operator','viewer'].includes(role)||(write&&role==='viewer'))
  throw Error('Không có quyền thao tác đánh dấu')
 return {supabase,user,role}
}
function throwReadable(error:{message:string}|null){
 if(error)throw Error('Không thể lưu hoặc tải đánh dấu bảng. Vui lòng thử lại')
}
export async function listWarehouseHighlights(){
 const {supabase,user}=await access()
 const [marks,rules,flags]=await Promise.all([
  supabase.from('erp_table_row_marks').select('row_id,pinned,color')
   .eq('user_id',user.id).eq('scope',scope).limit(1000),
  supabase.from('erp_table_highlight_rules')
   .select('id,title,enabled,priority,match_mode,conditions,color')
   .eq('user_id',user.id).eq('scope',scope).order('priority',{ascending:true}).limit(50),
  supabase.from('erp_table_row_flags')
   .select('row_id,flag_type,reason').eq('scope',scope).limit(1000)
 ])
 throwReadable(marks.error);throwReadable(rules.error);throwReadable(flags.error)
 return {
  marks:(marks.data??[]) as {row_id:string,pinned:boolean,color:RowMarkColor|null}[],
  rules:(rules.data??[]) as RowHighlightRule[],
  flags:(flags.data??[]) as {row_id:string,flag_type:string,reason:string}[]
 }
}
export async function markWarehouseRows(ids:string[],data:{
 color:RowMarkColor|null;pinned?:boolean
}){
 const rowIds=validIds(ids)
 if(!data||!(data.color===null||validColor(data.color))||
   (data.pinned!==undefined&&typeof data.pinned!=='boolean'))
  throw Error('Màu hoặc thao tác đánh dấu không hợp lệ')
 const {supabase,user}=await access()
 // Preserve other attributes on every partial update; never erase pin
 // when manually clearing the row color.
 const {data:existing,error:readError}=await supabase.from('erp_table_row_marks')
  .select('row_id,pinned,color').eq('scope',scope).eq('user_id',user.id)
  .in('row_id',rowIds)
 throwReadable(readError)
 const byId=new Map((existing??[]).map(r=>[r.row_id,r]))
 const payload=rowIds.map(rowId=>({
  user_id:user.id,scope,row_id:rowId,
  pinned:data.pinned??byId.get(rowId)?.pinned??false,
  color:data.color,
  updated_at:new Date().toISOString()
 }))
 const {error}=await supabase.from('erp_table_row_marks')
  .upsert(payload,{onConflict:'user_id,scope,row_id'})
 throwReadable(error)
 return {updated:rowIds.length}
}
export async function setWarehouseRowFlag(input:{
 rowId:string;flagType:'review'|'followup'|'important'|null;reason?:string
}){
 if(!uuid.test(input?.rowId??''))throw Error('Mã đơn không hợp lệ')
 const {supabase,user,role}=await access(true)
 if(input.flagType===null){
  if(role!=='admin')throw Error('Chỉ Admin được xóa cờ dùng chung')
  const {error}=await supabase.from('erp_table_row_flags').delete()
   .eq('scope',scope).eq('row_id',input.rowId)
  throwReadable(error);return
 }
 if(!['review','followup','important'].includes(input.flagType))
  throw Error('Loại cờ không hợp lệ')
 const reason=String(input.reason??'').trim()
 if(reason.length<4||reason.length>300)throw Error('Lý do cắm cờ phải từ 4 đến 300 ký tự')
 const {data:existing,error:readError}=await supabase.from('erp_table_row_flags')
   .select('created_by').eq('scope',scope).eq('row_id',input.rowId).maybeSingle()
 throwReadable(readError)
 const {error}=await supabase.from('erp_table_row_flags').upsert({
   scope,row_id:input.rowId,flag_type:input.flagType,reason,
   created_by:existing?.created_by??user.id,updated_by:user.id,
   updated_at:new Date().toISOString()
 },{onConflict:'scope,row_id'})
 throwReadable(error)
}
export async function saveWarehouseHighlightRule(input:{
 id?:string;title:string;enabled:boolean;priority:number;
 match_mode:'ALL'|'ANY';color:RowMarkColor;conditions:RowRuleCondition[]
}){
 const parsed=validateRuleInput(input)
 const {supabase,user}=await access()
 if(input.id!==undefined&&!uuid.test(input.id))throw Error('Quy tắc không hợp lệ')
 if(!input.id){
  const {count,error}=await supabase.from('erp_table_highlight_rules')
   .select('id',{count:'exact',head:true}).eq('scope',scope).eq('user_id',user.id)
  throwReadable(error)
  if((count??0)>=25)throw Error('Tối đa 25 quy tắc highlight cho một bảng')
 }
 const payload={...parsed,user_id:user.id,scope,updated_at:new Date().toISOString()}
 if(input.id){
  const {data,error}=await supabase.from('erp_table_highlight_rules').update(payload)
   .eq('id',input.id).eq('user_id',user.id).eq('scope',scope).select('id').single()
  throwReadable(error);return data?.id
 }
 const {data,error}=await supabase.from('erp_table_highlight_rules')
  .insert(payload).select('id').single()
 throwReadable(error)
 return data?.id
}
export async function deleteWarehouseHighlightRule(id:string){
 if(!uuid.test(id))throw Error('Quy tắc không hợp lệ')
 const {supabase,user}=await access()
 const {error}=await supabase.from('erp_table_highlight_rules').delete()
  .eq('id',id).eq('user_id',user.id).eq('scope',scope)
 throwReadable(error)
}
