'use server'

import {revalidatePath} from 'next/cache'
import {requireUser} from '@/lib/supabase/auth'
import {
  ROW_COLORS,validateHighlightRule,
  type TableMarkScope,type RowColor,type RowMark,type RowFlag,
  type HighlightRule
} from '@/lib/table-row-highlights'

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function scopeOK(scope:TableMarkScope){
  if(!['warehouse_receive','purchase_orders'].includes(scope))
    throw new Error('Bảng đánh dấu không hợp lệ')
}
function keysOK(keys:string[],max=100){
  if(!Array.isArray(keys)||keys.length<1||keys.length>max||
     new Set(keys).size!==keys.length||keys.some(key=>!UUID.test(key)))
    throw new Error('Danh sách dòng không hợp lệ hoặc vượt giới hạn')
}
async function context(write=false){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  if(!['admin','operator','viewer'].includes(role))
    throw new Error('Không có quyền sử dụng đánh dấu bảng')
  if(write&&process.env.ERP_TABLE_MARKINGS_LIVE!=='true')
    throw new Error('Chế độ đánh dấu bảng chưa mở ghi trên môi trường này')
  return {supabase,user,role}
}
function fail(error:{message:string}|null,defaultMessage:string){
  if(error)throw new Error(defaultMessage)
}
function refresh(scope:TableMarkScope){
  if(scope==='warehouse_receive')revalidatePath('/warehouse/receive')
  else revalidatePath('/purchase/orders')
}
export type TableMarkingSnapshot={
  marks:RowMark[],flags:RowFlag[],rules:HighlightRule[]
}
export async function loadTableRowMarkings(
  scope:TableMarkScope,rowKeys:string[]
):Promise<TableMarkingSnapshot>{
  scopeOK(scope)
  if(!rowKeys.length)return {marks:[],flags:[],rules:[]}
  keysOK(rowKeys,250)
  // Read-only Preview does not touch Production's mark tables.
  if(process.env.ERP_TABLE_MARKINGS_LIVE!=='true')
    return {marks:[],flags:[],rules:[]}
  const {supabase,user}=await context()
  const [marks,flags,rules]=await Promise.all([
    supabase.from('user_table_row_marks')
      .select('row_key,pinned,color').eq('user_id',user.id).eq('scope',scope).in('row_key',rowKeys),
    supabase.from('table_row_flags')
      .select('row_key,flag_type,reason').eq('scope',scope).in('row_key',rowKeys),
    supabase.from('user_table_highlight_rules')
      .select('id,title,enabled,priority,match_mode,conditions,color')
      .eq('user_id',user.id).eq('scope',scope).order('priority',{ascending:true}).limit(20),
  ])
  fail(marks.error,'Không tải được ghim và highlight')
  fail(flags.error,'Không tải được cờ cần chú ý')
  fail(rules.error,'Không tải được quy tắc highlight')
  return {
    marks:(marks.data??[]) as RowMark[],
    flags:(flags.data??[]) as RowFlag[],
    rules:(rules.data??[]) as HighlightRule[]
  }
}
export async function batchSetTableRowMarks(
  scope:TableMarkScope,rowKeys:string[],change:{pinned?:boolean,color?:RowColor|null}
){
  scopeOK(scope);keysOK(rowKeys,100)
  if(change.pinned===undefined&&change.color===undefined)
    throw new Error('Chưa chọn thao tác đánh dấu')
  if(change.color!==undefined&&change.color!==null&&!ROW_COLORS.includes(change.color))
    throw new Error('Màu tô dòng không hợp lệ')
  if(change.pinned!==undefined&&typeof change.pinned!=='boolean')
    throw new Error('Giá trị ghim không hợp lệ')
  const {supabase,user}=await context(true)
  const res=await supabase.from('user_table_row_marks')
    .select('row_key,pinned,color').eq('user_id',user.id).eq('scope',scope).in('row_key',rowKeys)
  fail(res.error,'Không đọc được trạng thái đánh dấu cũ')
  const current=new Map((res.data??[]).map(m=>[String(m.row_key),m]))
  const next=rowKeys.map(row_key=>{
    const prior=current.get(row_key)
    return {
      user_id:user.id,scope,row_key,
      pinned:change.pinned??Boolean(prior?.pinned),
      color:change.color===undefined?prior?.color??null:change.color,
      updated_at:new Date().toISOString()
    }
  })
  const active=next.filter(mark=>mark.pinned||mark.color!==null)
  const cleared=next.filter(mark=>!mark.pinned&&mark.color===null)
  if(active.length){
    const res=await supabase.from('user_table_row_marks')
      .upsert(active,{onConflict:'user_id,scope,row_key'}).select('row_key')
    fail(res.error,'Không thể lưu ghim hoặc màu cho các dòng đã chọn')
    if(res.data?.length!==active.length)throw new Error('Lưu đánh dấu chưa đủ số dòng')
  }
  if(cleared.length){
    const res=await supabase.from('user_table_row_marks')
      .delete().eq('user_id',user.id).eq('scope',scope)
      .in('row_key',cleared.map(mark=>mark.row_key))
    fail(res.error,'Không thể xóa đánh dấu đã chọn')
  }
  refresh(scope)
  return next.length
}
export async function batchSetTableRowFlags(
  scope:TableMarkScope,rowKeys:string[],
  flagType:'attention'|'urgent'|'follow_up'|null,reason=''
){
  scopeOK(scope);keysOK(rowKeys,25)
  if(flagType!==null&&!['attention','urgent','follow_up'].includes(flagType))
    throw new Error('Loại cờ không hợp lệ')
  if(flagType!==null&&(reason.trim().length<8||reason.trim().length>300))
    throw new Error('Lý do gắn cờ cần từ 8 đến 300 ký tự')
  const {supabase,role}=await context(true)
  if(!['admin','operator'].includes(role))throw new Error('Chỉ Admin và Operator được gắn cờ chung')
  const {data,error}=flagType
    ?await supabase.rpc('save_table_row_flags',{
      p_scope:scope,p_row_keys:rowKeys,p_flag_type:flagType,p_reason:reason.trim()
    })
    :await supabase.rpc('clear_table_row_flags',{p_scope:scope,p_row_keys:rowKeys})
  fail(error,'Không thể cập nhật cờ của các đơn đã chọn')
  refresh(scope)
  return Number(data??0)
}
export async function saveTableHighlightRule(
  scope:TableMarkScope,rule:Omit<HighlightRule,'id'>,id?:string
){
  scopeOK(scope);validateHighlightRule(scope,rule)
  if(id!==undefined&&!UUID.test(id))throw new Error('ID quy tắc không hợp lệ')
  const {supabase,user}=await context(true)
  const payload={
    title:rule.title.trim(),enabled:rule.enabled,priority:rule.priority,
    match_mode:rule.match_mode,conditions:rule.conditions,color:rule.color,
    updated_at:new Date().toISOString()
  }
  if(id){
    const {data,error}=await supabase.from('user_table_highlight_rules')
      .update(payload).eq('id',id).eq('user_id',user.id).eq('scope',scope).select('id')
    fail(error,'Không thể cập nhật quy tắc highlight')
    if(!data?.length)throw new Error('Không tìm thấy quy tắc được phép sửa')
  }else{
    const count=await supabase.from('user_table_highlight_rules')
      .select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('scope',scope)
    fail(count.error,'Không đếm được quy tắc hiện có')
    if((count.count??0)>=20)throw new Error('Mỗi bảng chỉ có tối đa 20 quy tắc highlight')
    const result=await supabase.from('user_table_highlight_rules')
      .insert({user_id:user.id,scope,...payload}).select('id')
    fail(result.error,'Không thể tạo quy tắc highlight')
    if(!result.data?.length)throw new Error('Quy tắc chưa được lưu')
  }
  refresh(scope)
}
export async function deleteTableHighlightRule(scope:TableMarkScope,id:string){
  scopeOK(scope)
  if(!UUID.test(id))throw new Error('ID quy tắc không hợp lệ')
  const {supabase,user}=await context(true)
  const r=await supabase.from('user_table_highlight_rules').delete()
    .eq('id',id).eq('user_id',user.id).eq('scope',scope).select('id')
  fail(r.error,'Không thể xóa quy tắc highlight')
  if(!r.data?.length)throw new Error('Quy tắc không tồn tại hoặc đã bị xóa')
  refresh(scope)
}
