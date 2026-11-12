'use client'

import {useMemo,useState} from 'react'
import {
  previewReceivedSkuCorrection,confirmReceivedSkuCorrection,
  type ReceivedSkuCorrectionPreview
} from '@/lib/actions/warehouse-received-sku-correction'
import {formatMoney} from '@/lib/format'

type Product={id:string;sku:string;name:string}
type Variant={
  id:string;variant_name:string;sale_price?:number|string|null
  products?:{id?:string|null;sku?:string|null;name?:string|null}|null
}
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'')
  .replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleUpperCase('vi').trim()

export function WarehouseReceivedSkuCorrection({
  orderItemId,previousVariantId,previousMultiplier,products,variants,previewOnly=false,onSuccess
}:{
  orderItemId:string;previousVariantId:string|null;previousMultiplier:number
  products:Product[];variants:Variant[];previewOnly?:boolean
  onSuccess:(result:{id:string,warehouse_status:string,old_quantity:number,new_quantity:number,targetVariantId:string,multiplier:number})=>void
}){
  const [open,setOpen]=useState(false)
  const [query,setQuery]=useState('')
  const [letter,setLetter]=useState('Tất cả')
  const [productId,setProductId]=useState('')
  const [variantId,setVariantId]=useState('')
  const [multiplier,setMultiplier]=useState(String(previousMultiplier||1))
  const [reason,setReason]=useState('')
  const [preview,setPreview]=useState<ReceivedSkuCorrectionPreview|null>(null)
  const [simulated,setSimulated]=useState<ReceivedSkuCorrectionPreview|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const product=products.find(p=>p.id===productId)
  const selectedVariant=variants.find(v=>v.id===variantId)
  const letters=useMemo(()=>[...new Set(products.map(p=>normalize(p.sku)[0]||'#'))]
    .sort((a,b)=>a.localeCompare(b,'en')),[products])
  const matchingProducts=products.filter(p=>
    (letter==='Tất cả'||(normalize(p.sku)[0]||'#')===letter)&&
    normalize([p.sku,p.name].join(' ')).includes(normalize(query)))
    .sort((a,b)=>normalize(a.sku).localeCompare(normalize(b.sku),'en')).slice(0,80)
  const matchingVariants=variants.filter(v=>v.products?.id===productId)
    .sort((a,b)=>a.variant_name.localeCompare(b.variant_name,'vi'))
  const factor=Number(multiplier)
  const validFactor=Number.isInteger(factor)&&factor>=1&&factor<=100000
  const hasActualChange=variantId!==previousVariantId||factor!==previousMultiplier
  function resetReview(){setPreview(null);setSimulated(null);setError('')}
  async function inspect(){
    if(!variantId||!validFactor||!hasActualChange||busy)return
    setBusy(true);resetReview()
    try{
      setPreview(await previewReceivedSkuCorrection(orderItemId,variantId,factor))
    }catch(e){setError(e instanceof Error?e.message:'Không xem trước được điều chỉnh')}
    finally{setBusy(false)}
  }
  async function confirm(){
    if(!preview?.can_correct||!variantId||!validFactor||busy||reason.trim().length<8)return
    if(previewOnly){
      // Trial only: show the expected stock delta without calling the write RPC.
      setSimulated({...preview});setError('');return
    }
    setBusy(true);setError('')
    try{
      const result=await confirmReceivedSkuCorrection({
        orderItemId,targetVariantId:variantId,multiplier:factor,
        fingerprint:preview.fingerprint,reason:reason.trim()
      })
      setOpen(false);setPreview(null);setReason('')
      onSuccess({...result,targetVariantId:variantId,multiplier:factor})
    }catch(e){
      setPreview(null)
      setError(e instanceof Error?e.message:'Không thể điều chỉnh SKU đã nhập kho')
    }finally{setBusy(false)}
  }
  return <div className="warehouse-received-sku-correction">
    <button type="button" className="warehouse-received-sku-toggle"
      disabled={busy} aria-expanded={open} onClick={()=>{setOpen(x=>!x);resetReview()}}>
      {open?'Thu gọn chỉnh sửa SKU':'Chỉnh sửa SKU / phân loại đã chốt'}
    </button>
    {open&&<div role="region" aria-label="Điều chỉnh SKU của sản phẩm đã nhập kho"
      className="warehouse-received-sku-body">
      {previewOnly&&<small role="status">Thử · không lưu kho</small>}
      <b className="warehouse-received-sku-step">1. Chọn SKU sản phẩm</b>
      {product?<div className="warehouse-received-sku-selected">
        <span><b>{product.sku}</b> · {product.name}</span>
        <button type="button" disabled={busy} onClick={()=>{
          setProductId('');setVariantId('');resetReview()
        }}>Đổi SKU</button>
      </div>:<>
        <input type="search" aria-label="Tìm SKU sản phẩm để điều chỉnh" value={query}
          disabled={busy} placeholder="Tìm mã hoặc tên SKU..." onChange={e=>setQuery(e.target.value)}/>
        <div className="warehouse-received-sku-letters" role="group" aria-label="Lọc SKU theo ABC">
          {['Tất cả',...letters].map(x=><button type="button" key={x}
            className={letter===x?'active':''} aria-pressed={letter===x}
            disabled={busy} onClick={()=>setLetter(x)}>{x}</button>)}
        </div>
        <div className="warehouse-received-sku-results" role="group" aria-label="Chọn SKU sản phẩm">
          {matchingProducts.map(p=><button type="button" key={p.id}
            disabled={busy} onClick={()=>{setProductId(p.id);setVariantId('');resetReview()}}>
            <b>{p.sku}</b> · {p.name}
          </button>)}
          {matchingProducts.length===0&&<small>Không tìm thấy SKU phù hợp.</small>}
        </div>
      </>}
      {product&&<>
        <b className="warehouse-received-sku-step">2. Chọn phân loại của SKU</b>
        <div className="warehouse-received-sku-results" role="group" aria-label="Chọn phân loại SKU">
          {matchingVariants.map(v=><button type="button" key={v.id}
            disabled={busy} aria-pressed={variantId===v.id}
            className={variantId===v.id?'active':''}
            onClick={()=>{setVariantId(v.id);resetReview()}}>
            <span>{v.variant_name}</span>
            <small>{v.sale_price==null?'Chưa có giá':formatMoney(v.sale_price)}</small>
          </button>)}
          {matchingVariants.length===0&&<small>SKU này chưa có phân loại. Tạo trong Danh mục SKU trước khi điều chỉnh.</small>}
        </div>
      </>}
      {selectedVariant&&<div className="warehouse-received-sku-inputs">
        <label>Hệ số quy đổi
          <input type="number" min={1} max={100000} step={1}
            disabled={busy} aria-label="Hệ số SKU mới" value={multiplier}
            onChange={e=>{setMultiplier(e.target.value);resetReview()}}/>
        </label>
        <label>Lý do điều chỉnh
          <textarea rows={2} maxLength={500} disabled={busy} value={reason}
            placeholder="Nêu nguyên nhân ghép sai SKU"
            onChange={e=>setReason(e.target.value)}/>
        </label>
        <button type="button" className="button small" disabled={busy||!validFactor||!hasActualChange}
          onClick={()=>void inspect()}>{busy?'Đang kiểm tra…':'Xem trước điều chỉnh'}</button>
      </div>}
      {preview&&<div className="warehouse-received-sku-review" role="status">
        <b>Đối soát trước khi điều chỉnh</b>
        <span>Kho thực nhận: {preview.warehouse_code||preview.warehouse_id}</span>
        <span>SKU mới: {preview.new_sku} · {preview.new_variant_name}</span>
        <span>Số lượng rút khỏi SKU cũ: {preview.old_quantity}</span>
        <span>Số lượng chuyển vào SKU mới: {preview.new_quantity}</span>
        <span>Tồn SKU cũ hiện tại: {preview.source_balance}</span>
        {preview.sale_history>0||preview.transfer_history>0
          ?<strong>SKU đã có lịch sử bán/chuyển kho; không cho tự động điều chỉnh.</strong>
          :null}
        {!preview.can_correct&&<strong>Không đủ điều kiện đối soát; không được ghi tồn.</strong>}
        <button type="button" className="button primary small"
          disabled={busy||!preview.can_correct||reason.trim().length<8}
          onClick={()=>void confirm()}>
          {busy?'Đang xử lý…':previewOnly?'Xác nhận thử điều chỉnh SKU':'Xác nhận điều chỉnh SKU'}
        </button>
      </div>}
      {simulated&&<div role="status" className="warehouse-received-sku-review">
        <b>Đã thử · chưa lưu</b>
        <span>{simulated.new_sku} · {simulated.new_variant_name}</span>
        <small>Không thay đổi tồn kho thực tế.</small>
        <button type="button" onClick={()=>{setSimulated(null);setPreview(null)}}>Thử phương án khác</button>
      </div>}
      {error&&<p role="alert" className="warehouse-received-sku-error">{error}</p>}
    </div>}
  </div>
}
