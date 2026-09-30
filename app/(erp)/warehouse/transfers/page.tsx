import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime } from '@/lib/format'
import { WarehouseSectionNav } from '@/components/warehouse-section-nav'
import {
  createStockWarehouseTransfer,
  dispatchWarehouseTransfer,
  receiveWarehouseTransfer,
} from '@/lib/actions/core'

type SP={transfer?:string}

function statusText(status:string){
  if(status==='DRAFT')return 'Nháp'
  if(status==='IN_TRANSIT')return 'Đang chuyển'
  if(status==='RECEIVED')return 'Đã nhận'
  if(status==='CANCELLED')return 'Đã huỷ'
  return status
}

export default async function WarehouseTransfersPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase}=await requireUser()

  const [
    {data:transfers,error:transferError},
    {data:warehouses,error:warehouseError},
    {data:balances,error:balanceError},
  ]=await Promise.all([
    supabase.from('transfer_batches')
      .select('id,status,from_warehouse_id,to_warehouse_id,created_at,transferred_at,received_at,note,from_warehouse:warehouses!transfer_batches_from_warehouse_id_fkey(id,code,name),to_warehouse:warehouses!transfer_batches_to_warehouse_id_fkey(id,code,name),transfer_items(id,order_id,product_variant_id,quantity,orders(shopee_order_id),product_variants(id,variant_name,sale_price,products(id,sku,name)))')
      .order('created_at',{ascending:false})
      .limit(300),
    supabase.from('warehouses').select('id,code,name').eq('is_active',true).order('code').limit(100),
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,warehouse_name,product_variant_id,sku,product_name,variant_name,quantity')
      .gt('quantity',0)
      .order('warehouse_code')
      .limit(2000),
  ])

  const error=transferError??warehouseError??balanceError
  const rows=(transfers??[]) as any[]
  const selected=rows.find(t=>String(t.id)===String(sp.transfer??''))??rows[0]??null
  const draft=rows.filter(t=>t.status==='DRAFT').length
  const inTransit=rows.filter(t=>t.status==='IN_TRANSIT').length
  const received=rows.filter(t=>t.status==='RECEIVED').length

  return <div className="warehouse-screen warehouse-transfer-screen">
    <header className="page-head warehouse-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Chuyển kho <span className="warehouse-optional-tag">Tùy chọn</span></h1>
        <p>Công cụ phụ dùng khi cần điều chuyển tồn giữa các kho; không nằm trong luồng nhập kho bắt buộc.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/warehouse/inventory">← Quay lại Tồn kho</Link>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse/inventory"/>
    {error&&<div className="error-box">Không thể tải dữ liệu chuyển kho: {error.message}</div>}

    <section className="warehouse-status-strip">
      <div><span>Tổng phiếu</span><b>{rows.length}</b><small>Trong dữ liệu hiện tại</small></div>
      <div className="warning"><span>Nháp</span><b>{draft}</b><small>Chờ xuất chuyển</small></div>
      <div className="info"><span>Đang chuyển</span><b>{inTransit}</b><small>Chờ kho đích nhận</small></div>
      <div className="success"><span>Đã nhận</span><b>{received}</b><small>Đã ghi tồn kho</small></div>
    </section>

    <details className="warehouse-create-transfer">
      <summary>+ Tạo chuyển tồn nội bộ</summary>
      <form action={createStockWarehouseTransfer}>
        <label>Kho nguồn
          <select name="from_warehouse_id" required defaultValue="">
            <option value="" disabled>Chọn kho nguồn</option>
            {(warehouses??[]).map((w:any)=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
        </label>
        <label>Kho đích
          <select name="to_warehouse_id" required defaultValue="">
            <option value="" disabled>Chọn kho đích</option>
            {(warehouses??[]).map((w:any)=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
        </label>
        <label>SKU / phân loại
          <select name="product_variant_id" required defaultValue="">
            <option value="" disabled>Chọn SKU đang có tồn</option>
            {(balances??[]).map((b:any)=><option key={b.warehouse_id+'-'+b.product_variant_id} value={b.product_variant_id}>
              {b.warehouse_code} · {b.sku} · {b.variant_name} · tồn {b.quantity}
            </option>)}
          </select>
        </label>
        <label>Số lượng<input name="quantity" type="number" min="1" step="1" required/></label>
        <label className="wide">Ghi chú<input name="note" placeholder="Không bắt buộc"/></label>
        <button className="button primary" type="submit">Tạo phiếu nháp</button>
      </form>
    </details>

    <div className="warehouse-master-detail">
      <section className="card warehouse-transfer-list">
        <div className="card-head"><h2>Danh sách phiếu</h2></div>
        <div className="warehouse-transfer-list-scroll">
          {!rows.length
            ? <div className="empty compact">Chưa có phiếu chuyển kho.</div>
            : rows.map(t=><Link
                href={'/warehouse/transfers?transfer='+t.id}
                key={t.id}
                className={selected?.id===t.id?'active':''}
              >
                <div>
                  <b>{String(t.id).slice(0,8)}</b>
                  <span>{t.from_warehouse?.code??'Khu nhận'} → {t.to_warehouse?.code??'—'}</span>
                </div>
                <div>
                  <span className={'status-pill '+(t.status==='RECEIVED'?'green':t.status==='IN_TRANSIT'?'orange':'gray')}>{statusText(t.status)}</span>
                  <small>{(t.transfer_items??[]).length} dòng</small>
                </div>
              </Link>)}
        </div>
      </section>

      <section className="card warehouse-transfer-detail">
        {!selected
          ? <div className="empty">Chọn một phiếu chuyển.</div>
          : <>
              <div className="warehouse-transfer-detail-head">
                <div>
                  <span className="module-eyebrow">PHIẾU CHUYỂN</span>
                  <h2>{String(selected.id).slice(0,8)}</h2>
                  <p>{selected.from_warehouse?.code??'Khu nhận hàng'} → {selected.to_warehouse?.code??'—'}</p>
                </div>
                <span className={'status-pill '+(selected.status==='RECEIVED'?'green':selected.status==='IN_TRANSIT'?'orange':'gray')}>{statusText(selected.status)}</span>
              </div>

              <div className="warehouse-transfer-meta">
                <div><span>Tạo lúc</span><b>{formatDateTime(selected.created_at)}</b></div>
                <div><span>Xuất chuyển</span><b>{selected.transferred_at?formatDateTime(selected.transferred_at):'—'}</b></div>
                <div><span>Nhận kho</span><b>{selected.received_at?formatDateTime(selected.received_at):'—'}</b></div>
                <div><span>Ghi chú</span><b>{selected.note??'—'}</b></div>
              </div>

              <div className="warehouse-transfer-items">
                <div className="warehouse-subhead"><b>Chi tiết hàng</b><span>{(selected.transfer_items??[]).length} dòng</span></div>
                <table className="table">
                  <thead><tr><th>Đơn nguồn</th><th>SKU bán</th><th>Sản phẩm</th><th>Phân loại</th><th>SL</th></tr></thead>
                  <tbody>{(selected.transfer_items??[]).map((it:any)=><tr key={it.id}>
                    <td>{it.orders?.shopee_order_id??'Chuyển tồn'}</td>
                    <td><b>{it.product_variants?.products?.sku??'—'}</b></td>
                    <td>{it.product_variants?.products?.name??'—'}</td>
                    <td>{it.product_variants?.variant_name??'—'}</td>
                    <td>{it.quantity}</td>
                  </tr>)}</tbody>
                </table>
              </div>

              <div className="warehouse-transfer-actions">
                {selected.status==='DRAFT'&&<form action={dispatchWarehouseTransfer}>
                  <input type="hidden" name="transfer_id" value={selected.id}/>
                  <button className="button primary" type="submit">Xuất chuyển</button>
                </form>}
                {selected.status==='IN_TRANSIT'&&<form action={receiveWarehouseTransfer}>
                  <input type="hidden" name="transfer_id" value={selected.id}/>
                  <button className="button primary" type="submit">Xác nhận kho đã nhận</button>
                </form>}
                {selected.status==='RECEIVED'&&<span className="warehouse-complete-note">✓ Phiếu đã hoàn tất và tồn kho đã được ghi nhận.</span>}
              </div>
            </>}
      </section>
    </div>
  </div>
}
