'use client'

import { useEffect,useMemo,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelPOSSale,returnPOSSale } from '@/lib/actions/sales'
import { ConfirmOperationDialog } from '@/components/confirm-operation-dialog'

type ReturnableItem={
  id:string
  sku:string
  name:string
  variant:string
  quantity:number
  returnedQuantity:number
}

export function SalesHistoryActions({
  saleId,
  invoiceCode,
  saleStatus,
  canOperate,
  items,
}:{
  saleId:string
  invoiceCode:string
  saleStatus:string
  canOperate:boolean
  items:ReturnableItem[]
}){
  const router=useRouter()
  const [mode,setMode]=useState<'cancel'|'return'|null>(null)
  const [reason,setReason]=useState('')
  const [message,setMessage]=useState('')
  const [returnQty,setReturnQty]=useState<Record<string,number>>({})
  const [pending,startTransition]=useTransition()
  const cancellable=saleStatus==='COMPLETED'&&canOperate
  const returnable=['COMPLETED','PARTIAL_RETURN'].includes(saleStatus)&&canOperate

  useEffect(()=>{
    if(!mode)return
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!pending)close()
    }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[mode,pending])
  const availableItems=useMemo(()=>items.map(item=>({
    ...item,
    available:Math.max(0,item.quantity-item.returnedQuantity),
  })).filter(item=>item.available>0),[items])

  function close(){
    if(pending)return
    setMode(null)
    setMessage('')
    setReason('')
    setReturnQty({})
  }

  function submitCancel(){
    setMessage('')
    startTransition(async()=>{
      const result=await cancelPOSSale({sale_id:saleId,reason})
        if(!result.ok){setMessage(result.error);return}
      close()
      router.refresh()
    })
  }

  function submitReturn(){
    setMessage('')
    const selected=availableItems
      .map(item=>({
        sale_item_id:item.id,
        quantity:Math.max(0,Math.min(item.available,Math.trunc(Number(returnQty[item.id]??0)))),
      }))
      .filter(item=>item.quantity>0)
    if(!selected.length){setMessage('Chưa chọn sản phẩm hoặc số lượng hoàn.');return}
    startTransition(async()=>{
      const result=await returnPOSSale({sale_id:saleId,items:selected,reason})
      if(!result.ok){setMessage(result.error);return}
      close()
      router.refresh()
    })
  }

  return <>
    <button
      className="button small"
      type="button"
      disabled={!cancellable||pending}
      onClick={()=>{setMessage('');setReason('');setMode('cancel')}}
      title={!canOperate?'Chỉ Admin/Operator được thao tác':saleStatus!=='COMPLETED'?'Hóa đơn không còn ở trạng thái cho phép huỷ':''}
    >
      Huỷ hóa đơn
    </button>
    <button
      className="button small"
      type="button"
      disabled={!returnable||pending||!availableItems.length}
      onClick={()=>setMode('return')}
      title={!canOperate?'Chỉ Admin/Operator được thao tác':!availableItems.length?'Không còn sản phẩm có thể hoàn':''}
    >
      Hoàn hàng
    </button>

    {mode&&<ConfirmOperationDialog
      title={mode==='cancel'?'Xác nhận huỷ hóa đơn':'Hoàn hàng'}
      kind={mode==='cancel'?'XÁC NHẬN HUỶ':'XÁC NHẬN HOÀN HÀNG'}
      target={invoiceCode}
      description={mode==='cancel'
        ? 'Huỷ hóa đơn sẽ hoàn lại tồn kho, xử lý công nợ và ghi nhận tiền hoàn theo giao dịch.'
        : 'Chọn sản phẩm và số lượng thực tế khách trả. Hệ thống sẽ tự cập nhật tồn kho và số tiền hoàn.'}
      reason={reason} onReasonChange={setReason}
      pending={pending} error={message} onClose={close}
      onConfirm={mode==='cancel'?submitCancel:submitReturn}
      confirmLabel={mode==='cancel'?'Xác nhận huỷ':'Xác nhận hoàn'}
      isDanger={mode==='cancel'}
    >
      {mode==='return'&&<div className="erp-confirm-return-items">
        {availableItems.map(item=><label className="sales-return-line" key={item.id}>
          <span>
            <b>{item.sku}</b>
            <small>{item.name}{item.variant?' · '+item.variant:''}</small>
            <em>Đã bán {item.quantity} · Đã hoàn {item.returnedQuantity} · Còn {item.available}</em>
          </span>
          <input
            aria-label={'Số lượng hoàn '+item.sku}
            type="number" min={0} max={item.available} step={1}
            value={returnQty[item.id]??0}
            onChange={e=>setReturnQty(prev=>({...prev,[item.id]:Math.max(0,Math.min(item.available,Math.trunc(Number(e.target.value)||0)))}))}
          />
        </label>)}
      </div>}
    </ConfirmOperationDialog>}
  </>
}
