'use client'

import {useEffect,useMemo,useState} from 'react'
import {useRouter} from 'next/navigation'
import {formatMoney} from '@/lib/format'
import {
  addSkuClassification,editSkuClassification,previewSkuMerge,confirmSkuMerge,
  type SkuMergePreview
} from '@/lib/actions/sku-catalog'

export type CatalogSku={
  id:string,productId:string,sku:string,productName:string,
  variantName:string,salePrice:number,isActive:boolean,
  mergedInto:string|null,balances:Array<{warehouseId:string,warehouse:string,quantity:number}>
}
type Mode='edit'|'add'|'merge'
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'')
  .replace(/đ/g,'d').replace(/Đ/g,'D').toUpperCase().trim()

export function WarehouseSkuCatalog({
  rows,canEdit,canMerge,loadError
}:{
  rows:CatalogSku[],canEdit:boolean,canMerge:boolean,loadError:string|null
}){
  const router=useRouter()
  const [search,setSearch]=useState('')
  const [letter,setLetter]=useState('Tất cả')
  const [classification,setClassification]=useState('Tất cả')
  const [showMerged,setShowMerged]=useState(false)
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [mode,setMode]=useState<Mode>('edit')
  const [sku,setSku]=useState('')
  const [name,setName]=useState('')
  const [variant,setVariant]=useState('')
  const [price,setPrice]=useState('')
  const [targetId,setTargetId]=useState('')
  const [targetSearch,setTargetSearch]=useState('')
  const [mergePreview,setMergePreview]=useState<SkuMergePreview|null>(null)
  const [confirmation,setConfirmation]=useState('')
  const [sameUnit,setSameUnit]=useState(false)
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const selected=rows.find(row=>row.id===selectedId)??null
  const totalUnits=(row:CatalogSku)=>row.balances.reduce((sum,b)=>sum+b.quantity,0)
  const letters=useMemo(()=>[...new Set(rows.map(r=>normalize(r.sku).charAt(0)||'#'))]
    .sort((a,b)=>a.localeCompare(b,'en')),[rows])
  const classifications=useMemo(()=>[...new Set(rows.map(r=>r.variantName))]
    .sort((a,b)=>a.localeCompare(b,'vi')),[rows])
  const filtered=useMemo(()=>rows.filter(row=>
    (showMerged||row.isActive)&&
    (letter==='Tất cả'||(normalize(row.sku).charAt(0)||'#')===letter)&&
    (classification==='Tất cả'||row.variantName===classification)&&
    (!normalize(search)||normalize([row.sku,row.productName,row.variantName].join(' ')).includes(normalize(search)))
  ).sort((a,b)=>normalize(a.sku).localeCompare(normalize(b.sku),'en')||
    a.variantName.localeCompare(b.variantName,'vi')),[rows,search,letter,classification,showMerged])
  const targets=rows.filter(row=>row.isActive&&row.id!==selectedId&&
    normalize([row.sku,row.productName,row.variantName].join(' ')).includes(normalize(targetSearch)))
    .sort((a,b)=>normalize(a.sku).localeCompare(normalize(b.sku),'en')||
      a.variantName.localeCompare(b.variantName,'vi')).slice(0,100)
  const target=rows.find(r=>r.id===targetId)??null
  useEffect(()=>{
    if(!selected)return
    setSku(selected.sku)
    setName(selected.productName)
    setVariant(selected.variantName)
    setPrice(String(selected.salePrice))
    setTargetId('');setTargetSearch('');setMergePreview(null)
    setConfirmation('');setSameUnit(false);setReason('');setError('')
  },[selectedId])
  useEffect(()=>{
    if(!notice)return
    const timeout=window.setTimeout(()=>setNotice(''),5000)
    return ()=>window.clearTimeout(timeout)
  },[notice])
  useEffect(()=>{
    if(!selectedId)return
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busy){setSelectedId(null);setError('')}
    }
    document.addEventListener('keydown',escape)
    return ()=>document.removeEventListener('keydown',escape)
  },[selectedId,busy])

  function open(id:string){
    setSelectedId(id);setMode('edit');setError('')
  }
  function changeMode(next:Mode){
    if(busy)return
    setMode(next);setError('');setMergePreview(null);setTargetId('')
    setConfirmation('');setSameUnit(false);setReason('')
    if(next==='add'){setVariant('');setPrice('')}
    if(next==='edit'&&selected){setVariant(selected.variantName);setPrice(String(selected.salePrice))}
  }
  const validPrice=price.trim()!==''&&Number.isFinite(Number(price))&&
    Number(price)>=0&&Number(price)<=999999999
  const duplicateVariant=mode==='add'&&!!selected&&!!variant.trim()&&
    rows.some(row=>row.productId===selected.productId&&
      normalize(row.variantName)===normalize(variant))
  async function save(){
    if(!selected||busy||!canEdit||!validPrice||duplicateVariant)return
    setBusy(true);setError('')
    try{
      if(mode==='add'){
        await addSkuClassification({
          productId:selected.productId,variantName:variant,salePrice:Number(price)})
      }else{
        await editSkuClassification({
          variantId:selected.id,sku,productName:name,
          variantName:variant,salePrice:Number(price)})
      }
      setNotice(mode==='add'?'Đã tạo phân loại SKU.':'Đã cập nhật SKU.')
      setSelectedId(null)
      router.refresh()
    }catch(e){setError(e instanceof Error?e.message:'Không lưu được SKU')}
    finally{setBusy(false)}
  }
  async function inspect(){
    if(!selected||!target||!canMerge||busy)return
    setBusy(true);setError('');setMergePreview(null)
    setConfirmation('');setSameUnit(false)
    try{setMergePreview(await previewSkuMerge(selected.id,target.id))}
    catch(e){setError(e instanceof Error?e.message:'Không thể xem trước gộp SKU')}
    finally{setBusy(false)}
  }
  async function merge(){
    if(!selected||!target||!mergePreview||!mergePreview.can_merge||
      !canMerge||!sameUnit||busy||normalize(confirmation)!==normalize(selected.sku))return
    setBusy(true);setError('')
    try{
      const result=await confirmSkuMerge({
        sourceId:selected.id,targetId:target.id,fingerprint:mergePreview.fingerprint,
        confirmation,sameUnit,note:reason})
      setNotice('Đã gộp SKU. Chuyển '+Number(result.quantity_moved).toLocaleString('vi-VN')+' đơn vị tồn.')
      setSelectedId(null)
      router.refresh()
    }catch(e){
      setMergePreview(null)
      setError(e instanceof Error?e.message:'Không thể gộp SKU. Vui lòng xem trước lại.')
    }finally{setBusy(false)}
  }
  const blockerEntries=mergePreview?[
    ['Đơn chưa chốt kho',mergePreview.open_orders],
    ['Ghép SKU còn nháp',mergePreview.drafts],
    ['Phiếu chuyển chưa hoàn tất',mergePreview.pending_transfers],
    ['Dòng bán hàng có thể trả',mergePreview.sale_history],
    ['Kho có tồn âm',mergePreview.negative_balances]
  ]:[]

  return <div className="sku-catalog">
    {notice&&<div className="sku-catalog-notice" role="status">{notice}
      <button type="button" aria-label="Đóng thông báo" onClick={()=>setNotice('')}>×</button>
    </div>}
    {loadError&&<p className="error-box">Không thể tải đầy đủ danh mục: {loadError}</p>}
    {!canEdit&&<p className="sku-catalog-readonly">
      Danh mục ở chế độ chỉ xem. Chỉnh sửa và gộp SKU chỉ mở sau khi migration được nghiệm thu và bật quyền ghi.
    </p>}
    <div className={'sku-catalog-layout'+(selected?' is-open':'')}>
      <section className="sku-catalog-main" aria-label="Danh mục SKU">
        <div className="sku-catalog-toolbar">
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
            aria-label="Tìm SKU trong danh mục" placeholder="Tìm mã SKU, sản phẩm hoặc phân loại"/>
          <select value={classification} onChange={e=>setClassification(e.target.value)}
            aria-label="Lọc phân loại">
            <option value="Tất cả">Tất cả phân loại</option>
            {classifications.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <label className="sku-catalog-merged-switch">
            <input type="checkbox" checked={showMerged} onChange={e=>setShowMerged(e.target.checked)}/>
            Hiện SKU đã gộp
          </label>
        </div>
        <div className="sku-catalog-alphabet" role="group" aria-label="Lọc SKU theo ABC">
          {['Tất cả',...letters].map(l=><button type="button" key={l}
            className={letter===l?'active':''} aria-pressed={letter===l}
            onClick={()=>setLetter(l)}>{l}</button>)}
        </div>
        <div className="sku-catalog-count">{filtered.length} phân loại SKU · {new Set(filtered.map(r=>r.productId)).size} mã SKU</div>
        <div className="sku-catalog-table-wrap">
          <table className="sku-catalog-table">
            <thead><tr>
              <th>SKU bán</th><th>Tên sản phẩm</th><th>Phân loại</th>
              <th>Giá bán</th><th>Tổng tồn</th><th>Trạng thái</th>
            </tr></thead>
            <tbody>
            {filtered.map(row=><tr key={row.id} className={selectedId===row.id?'selected':''}>
              <td><button type="button" className="sku-catalog-open" onClick={()=>open(row.id)}
                aria-label={'Xem và quản lý SKU '+row.sku+' phân loại '+row.variantName}>{row.sku}</button></td>
              <td>{row.productName}</td>
              <td>{row.variantName}</td>
              <td className="money">{formatMoney(row.salePrice)}</td>
              <td className="qty">{totalUnits(row).toLocaleString('vi-VN')}</td>
              <td>{row.isActive?'Đang sử dụng':'Đã gộp'}</td>
            </tr>)}
            {filtered.length===0&&<tr><td colSpan={6} className="sku-catalog-empty">Không có SKU phù hợp</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {selected&&<aside className="sku-catalog-drawer" role="dialog"
        aria-label={'Chi tiết SKU '+selected.sku} aria-modal={false}>
        <header className="sku-catalog-drawer-head">
          <div><small>QUẢN LÝ SKU</small><h2>{selected.sku}</h2>
            <p>{selected.productName} · {selected.variantName}</p></div>
          <button type="button" aria-label="Đóng slidebar SKU" disabled={busy}
            onClick={()=>setSelectedId(null)}>×</button>
        </header>
        <div className="sku-catalog-drawer-body">
          {mode!=='add'&&<div className="sku-catalog-stock">
            <b>Tồn kho theo kho nhận</b>
            {selected.balances.length===0?<span>Chưa có giao dịch kho</span>:
            selected.balances.map(b=><div key={b.warehouseId}>
              <span>{b.warehouse}</span><strong>{b.quantity.toLocaleString('vi-VN')}</strong>
            </div>)}
          </div>}
          {selected.isActive?<>
            <div className="sku-catalog-tabs" role="group" aria-label="Thao tác SKU">
              <button type="button" aria-pressed={mode==='edit'} className={mode==='edit'?'active':''}
                onClick={()=>changeMode('edit')}>Sửa SKU</button>
              <button type="button" aria-pressed={mode==='add'} className={mode==='add'?'active':''}
                onClick={()=>changeMode('add')}>Thêm phân loại</button>
              {canMerge&&<button type="button" aria-pressed={mode==='merge'} className={mode==='merge'?'active':''}
                onClick={()=>changeMode('merge')}>Gộp SKU</button>}
            </div>
            {mode==='edit'&&<div className="sku-catalog-form">
              <p className="sku-catalog-hint">Mã và tên sản phẩm dùng chung cho mọi phân loại của SKU này.</p>
              <label>Mã SKU <input value={sku} maxLength={100} disabled={!canEdit||busy}
                onChange={e=>setSku(e.target.value)}/></label>
              <label>Tên sản phẩm <input value={name} maxLength={255} disabled={!canEdit||busy}
                onChange={e=>setName(e.target.value)}/></label>
              <label>Tên phân loại <input value={variant} maxLength={255} disabled={!canEdit||busy}
                onChange={e=>setVariant(e.target.value)}/></label>
              <label>Giá bán <input type="number" inputMode="decimal" min={0} max={999999999}
                step="0.01" value={price} disabled={!canEdit||busy} onChange={e=>setPrice(e.target.value)}/></label>
              <button type="button" className="button primary" onClick={()=>void save()}
                disabled={!canEdit||busy||!validPrice||!sku.trim()||!name.trim()||!variant.trim()}>
                {busy?'Đang lưu…':'Lưu chỉnh sửa'}</button>
            </div>}
            {mode==='add'&&<div className="sku-catalog-form sku-catalog-add-compact">
              <div className="sku-catalog-add-fields">
                <label>Phân loại mới
                  <input value={variant} maxLength={255} autoComplete="off"
                    placeholder="Đỏ / Size M" disabled={!canEdit||busy}
                    onChange={e=>setVariant(e.target.value)}/>
                </label>
                <label>Giá bán
                  <input type="number" inputMode="decimal" min={0} max={999999999}
                    step="0.01" value={price} disabled={!canEdit||busy}
                    onChange={e=>setPrice(e.target.value)}/>
                </label>
              </div>
              {duplicateVariant&&<small role="alert" className="sku-catalog-error">
                Phân loại đã tồn tại trong SKU này.
              </small>}
              <div className="sku-catalog-add-footer">
                <small>Giá riêng · Không nhập kho tự động</small>
                <button type="button" className="button primary" onClick={()=>void save()}
                  disabled={!canEdit||busy||!validPrice||!variant.trim()||duplicateVariant}>
                  {busy?'Đang thêm…':'Thêm phân loại'}
                </button>
              </div>
            </div>}
            {mode==='merge'&&canMerge&&<div className="sku-catalog-form">
              <p className="sku-catalog-hint">
                Gộp phân loại <b>{selected.sku} · {selected.variantName}</b> vào SKU đích.
                Không xóa lịch sử đơn hàng hoặc chứng từ.
              </p>
              <label>SKU đích <input type="search" value={targetSearch} disabled={busy}
                placeholder="Tìm SKU đích…" onChange={e=>{
                  setTargetSearch(e.target.value);setMergePreview(null)}}/></label>
              <div className="sku-catalog-targets" role="group" aria-label="Chọn SKU đích">
                {target&&!targets.some(row=>row.id===target.id)&&<button type="button" className="active"
                  onClick={()=>{setTargetId(target.id);setMergePreview(null)}}>{target.sku} · {target.variantName}</button>}
                {targets.map(row=><button key={row.id} type="button"
                  className={targetId===row.id?'active':''} aria-pressed={targetId===row.id}
                  onClick={()=>{setTargetId(row.id);setMergePreview(null);
                    setConfirmation('');setSameUnit(false)}}>
                  <strong>{row.sku}</strong> · {row.productName} · {row.variantName}
                </button>)}
              </div>
              <button type="button" className="button" disabled={!targetId||busy}
                onClick={()=>void inspect()}>{busy?'Đang kiểm tra…':'Xem trước gộp SKU'}</button>
              {mergePreview&&<>
                <div className="sku-catalog-merge-preview">
                  <b>Đối soát trước khi gộp</b>
                  {mergePreview.warehouses.map(w=><div key={w.warehouse_id}>
                    <span>{w.warehouse}</span><strong>{Number(w.quantity).toLocaleString('vi-VN')} đơn vị</strong>
                  </div>)}
                  <div><span>Tổng SL chuyển</span>
                    <strong>{Number(mergePreview.quantity).toLocaleString('vi-VN')}</strong></div>
                  {blockerEntries.filter(([,count])=>Number(count)>0).map(([title,count])=>
                    <p key={title} className="sku-catalog-merge-blocker">{title}: {count}</p>)}
                  {!mergePreview.can_merge&&<p className="sku-catalog-merge-blocker">
                    Chưa thể gộp. Hãy xử lý các mục bị chặn; lịch sử bán phải được giữ nguyên để bảo đảm trả hàng.</p>}
                </div>
                {mergePreview.can_merge&&<>
                  <label className="sku-catalog-check"><input type="checkbox" checked={sameUnit}
                    onChange={e=>setSameUnit(e.target.checked)} disabled={busy}/>
                    Tôi xác nhận hai phân loại sử dụng cùng đơn vị tồn kho (quy đổi 1:1).</label>
                  <label>Lý do gộp <textarea rows={2} maxLength={500} value={reason}
                    onChange={e=>setReason(e.target.value)} disabled={busy}
                    placeholder="Nhập lý do để lưu lịch sử kiểm toán"/></label>
                  <label>Xác nhận mã SKU nguồn <input value={confirmation} disabled={busy}
                    placeholder={'Nhập '+selected.sku} onChange={e=>setConfirmation(e.target.value)}/></label>
                  <button type="button" className="button primary" onClick={()=>void merge()}
                    disabled={busy||!sameUnit||reason.trim().length<5||
                      normalize(confirmation)!==normalize(selected.sku)}>
                    {busy?'Đang gộp…':'Xác nhận gộp SKU'}
                  </button>
                </>}
              </>}
            </div>}
          </>:<p className="sku-catalog-readonly">SKU đã gộp; lịch sử và chứng từ gốc được giữ lại.</p>}
          {error&&<p className="sku-catalog-error" role="alert">{error}</p>}
        </div>
      </aside>}
    </div>
  </div>
}
