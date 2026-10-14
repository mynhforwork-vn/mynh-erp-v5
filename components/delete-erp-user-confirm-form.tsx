'use client'
import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {deleteERPUserPermanent} from '@/lib/actions/core'
import {ConfirmOperationDialog} from '@/components/confirm-operation-dialog'
export function DeleteERPUserConfirmForm({userId,username,returnQuery}:{userId:string;username:string;returnQuery:string}){
  const [open,setOpen]=useState(false),[typed,setTyped]=useState('')
  const [reason,setReason]=useState(''),[error,setError]=useState('')
  const [pending,startTransition]=useTransition(),router=useRouter()
  function close(){setOpen(false);setTyped('');setReason('');setError('')}
  function confirm(){
    if(typed!==username){setError('Username xác nhận chưa đúng');return}
    setError('')
    startTransition(async()=>{
      try{
        const fd=new FormData()
        fd.set('user_id',userId);fd.set('confirm_text',typed)
        fd.set('return_query',returnQuery);fd.set('inline_submit','1')
        const result=await deleteERPUserPermanent(fd)
        router.replace(result.href);router.refresh()
      }catch(err){setError(err instanceof Error?err.message:'Không xóa được User. Vui lòng kiểm tra lại.')}
    })
  }
  return <>
    <button type="button" className="erp-confirm-trigger" onClick={()=>setOpen(true)}>Xóa vĩnh viễn User</button>
    {open&&<ConfirmOperationDialog title="Xóa vĩnh viễn User" kind="XÁC NHẬN XÓA USER"
      target={username} description="Không thể hoàn tác. User có đơn liên kết sẽ không được xóa."
      notice="Nhập chính xác Username. Máy chủ kiểm tra quan hệ trước khi xóa."
      reason={reason} onReasonChange={setReason} error={error} pending={pending}
      onConfirm={confirm} onClose={close} confirmLabel="Xác nhận xóa">
      <label className="erp-confirm-label">Nhập Username
        <input value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="off" disabled={pending} placeholder={username}/>
      </label>
    </ConfirmOperationDialog>}
  </>
}
