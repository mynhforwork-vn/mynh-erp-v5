'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/supabase/auth'

export type FinanceTxType='INCOME'|'EXPENSE'

export type FinanceDocumentInput={
  id?:string|null
  document_type:FinanceTxType
  occurred_at:string
  counterparty_name?:string|null
  payment_method:'CASH'|'TRANSFER'|'COMBINED'
  cash_amount?:number
  transfer_amount?:number
  note?:string|null
  post:boolean
  lines:Array<{
    category_id:string
    description:string
    amount:number
    reference_type?:string|null
    reference_id?:string|null
  }>
}

async function actor(){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  if(!['admin','operator'].includes(role)){
    throw new Error('Không có quyền cập nhật tài chính')
  }
  return {supabase,user}
}

function refreshFinance(){
  revalidatePath('/finance')
  revalidatePath('/finance/cashflow')
  revalidatePath('/finance/reports')
}

export async function saveFinanceDocument(input:FinanceDocumentInput){
  try{
    const {supabase}=await actor()
    if(!input?.document_type)return {ok:false as const,error:'Chưa chọn Phiếu thu / Phiếu chi'}
    if(!Array.isArray(input.lines)||!input.lines.length)return {ok:false as const,error:'Phiếu phải có ít nhất một dòng'}

    const lines=input.lines.map(line=>({
      category_id:String(line.category_id??''),
      description:String(line.description??'').trim(),
      amount:Number(line.amount),
      reference_type:String(line.reference_type??'').trim()||null,
      reference_id:String(line.reference_id??'').trim()||null,
    }))
    for(const line of lines){
      if(!line.category_id)return {ok:false as const,error:'Có dòng chưa chọn hạng mục'}
      if(!line.description)return {ok:false as const,error:'Có dòng chưa nhập nội dung'}
      if(!Number.isFinite(line.amount)||line.amount<=0)return {ok:false as const,error:'Số tiền từng dòng phải lớn hơn 0'}
    }

    const occurred=new Date(input.occurred_at)
    if(Number.isNaN(occurred.getTime()))return {ok:false as const,error:'Ngày chứng từ không hợp lệ'}

    const {data,error}=await supabase.rpc('save_finance_document',{
      p_document_id:input.id||null,
      p_document_type:input.document_type,
      p_occurred_at:occurred.toISOString(),
      p_counterparty_name:String(input.counterparty_name??'').trim()||null,
      p_payment_method:input.payment_method,
      p_cash_amount:Number(input.cash_amount??0),
      p_transfer_amount:Number(input.transfer_amount??0),
      p_note:String(input.note??'').trim()||null,
      p_lines:lines,
      p_post:Boolean(input.post),
    })
    if(error)return {ok:false as const,error:error.message}
    refreshFinance()
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể lưu chứng từ')}
  }
}

export async function saveFinanceCategory(input:{
  id?:string|null
  name:string
  tx_type:FinanceTxType
  parent_id?:string|null
  note?:string|null
  is_active?:boolean
}){
  try{
    const {supabase}=await actor()
    const name=String(input?.name??'').trim()
    if(!name)return {ok:false as const,error:'Chưa nhập tên hạng mục'}

    const {data,error}=await supabase.rpc('save_finance_category',{
      p_id:input.id||null,
      p_name:name,
      p_tx_type:input.tx_type,
      p_parent_id:input.parent_id||null,
      p_note:String(input.note??'').trim()||null,
      p_is_active:input.is_active!==false,
    })
    if(error)return {ok:false as const,error:error.message}
    refreshFinance()
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể lưu hạng mục')}
  }
}

export async function cancelFinanceDocument(id:string,reason:string){
  try{
    const {supabase}=await actor()
    if(!id)return {ok:false as const,error:'Thiếu mã phiếu'}
    if(!String(reason??'').trim())return {ok:false as const,error:'Cần nhập lý do huỷ phiếu'}

    const {data,error}=await supabase.rpc('cancel_finance_document',{
      p_document_id:id,
      p_reason:String(reason).trim(),
    })
    if(error)return {ok:false as const,error:error.message}
    refreshFinance()
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể huỷ phiếu')}
  }
}
