'use client'

import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {deleteOrderPermanent} from '@/lib/actions/core'
import {ConfirmOperationDialog} from '@/components/confirm-operation-dialog'

export function DeleteOrderConfirmForm({
  orderId,confirmCode,returnQuery,compact=false,onCancel,
}:{
  orderId:string
  confirmCode:string
  returnQuery:string
  compact?:boolean
  onCancel?:()=>void
}){
  const [open,setOpen]=useState(false)
  const [reason,setReason]=useState('')
  const [error,setError]=useState('')
  const [pending,startTransition]=useTransition()
  const router=useRouter()
  const visible=compact||open
  function close(){
    setError('')
    setReason('')
    setOpen(false)
    onCancel?.()
  }
  function submit(){
    setError('')
    startTransition(async()=>{
      try{
        const formData=new FormData()
        formData.set('order_id',orderId)
        formData.set('return_query',returnQuery)
        formData.set('reason',reason)
        const result=await deleteOrderPermanent(formData)
        if(!result.ok){setError(result.error);return}
        router.replace(result.href)
        router.refresh()
      }catch{
        setError('Không kết nối được máy chủ. Hãy kiểm tra danh sách đơn trước khi thử lại.')
      }
    })
  }
  return <>
    {!compact&&<button type="button" className="erp-confirm-trigger" onClick={()=>setOpen(true)}>Xóa vĩnh viễn đơn</button>}
    {visible&&<ConfirmOperationDialog
      title="Xóa vĩnh viễn đơn hàng" kind="XÁC NHẬN XÓA ĐƠN"
      target={confirmCode}
      description="Vui lòng kiểm tra đúng đơn cần xóa. Thao tác này không thể hoàn tác."
      notice="Dữ liệu kho, nhận hàng hoặc đối soát liên quan chỉ được xử lý khi đủ điều kiện an toàn."
      reason={reason} onReasonChange={setReason} error={error} pending={pending}
      onConfirm={submit} onClose={close} confirmLabel="Xác nhận xóa"
    />}
  </>
}
