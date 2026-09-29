import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { saveDestinationHubConfig } from '@/lib/actions/core'

async function count(q:PromiseLike<{count:number|null}>){
  try{return (await q).count??0}catch{return 0}
}

export default async function WarehousePage(){
  const {supabase}=await requireUser()
  const [waiting,received,warehouses,transfers,hubConfigs]=await Promise.all([
    count(supabase.from('orders').select('*',{count:'exact',head:true}).eq('receive_status','WAITING_RECEIVE')),
    count(supabase.from('orders').select('*',{count:'exact',head:true}).eq('receive_status','RECEIVED')),
    supabase.from('warehouses').select('*').limit(50),
    supabase.from('transfer_batches').select('*').order('created_at',{ascending:false}).limit(20),
    supabase.from('destination_hub_configs')
      .select('id,hub_code,area,region,province_keywords,district_keywords,address_keywords,priority,is_active')
      .order('priority',{ascending:true})
      .order('hub_code',{ascending:true})
      .limit(500),
  ])

  return <>
    <header className="page-head">
      <div>
        <h1>Tổng quan kho</h1>
        <p>Kho nội bộ, luồng nhận hàng và cấu hình nhận diện kho đích từ địa chỉ</p>
      </div>
      <div className="head-actions">
        <Link className="button primary" href="/purchase/orders?receive=WAITING_RECEIVE">Xử lý đơn chờ nhận</Link>
      </div>
    </header>

    <section className="kpi-grid small-grid">
      <Link href="/purchase/orders?receive=WAITING_RECEIVE" className="kpi-card warning">
        <span>Chờ xác nhận nhận</span><b>{waiting}</b><small>Đơn vị vận chuyển đã báo giao thành công</small>
      </Link>
      <Link href="/purchase/orders?receive=RECEIVED" className="kpi-card">
        <span>Đã nhận</span><b>{received}</b><small>Sẵn sàng cho nghiệp vụ tiếp theo</small>
      </Link>
      <div className="kpi-card"><span>Kho nội bộ</span><b>{warehouses.data?.length??0}</b><small>Kho đang cấu hình</small></div>
      <div className="kpi-card"><span>Rule kho đích</span><b>{hubConfigs.data?.filter((x:any)=>x.is_active).length??0}</b><small>Rule nhận diện đang bật</small></div>
    </section>

    <section className="content-grid two">
      <div className="card">
        <div className="card-head"><h2>Danh sách kho nội bộ</h2></div>
        {!warehouses.data?.length
          ? <div className="empty compact">Chưa cấu hình kho.</div>
          : warehouses.data.map((w:any)=><div className="entity-row" key={w.id}>
              <div><b>{w.name??w.code??'Kho'}</b><span>{w.code??w.address??'—'}</span></div>
              <span className="badge green">HOẠT ĐỘNG</span>
            </div>)}
      </div>

      <div className="card">
        <div className="card-head"><h2>Luồng kho</h2></div>
        <div className="flow-stack">
          <div><b>1</b><span>Giao hàng thành công</span><small>→ Chờ nhận</small></div>
          <div><b>2</b><span>Nhân viên xác nhận vật lý</span><small>→ Đã nhận</small></div>
          <div><b>3</b><span>Tạo đợt chuyển kho</span><small>→ Đã chuyển kho</small></div>
          <div><b>4</b><span>Kho đích xác nhận</span><small>→ Ghi nhận tồn kho</small></div>
        </div>
      </div>
    </section>

    <section className="card destination-config-card" id="destination-routing">
      <div className="card-head destination-config-head">
        <div>
          <h2>Cấu hình kho đích</h2>
          <span className="muted">Địa chỉ nhận → Khu vực / Miền → Kho đích. Quận/Huyện và từ khóa bổ sung có ưu tiên cao hơn Tỉnh/Thành.</span>
        </div>
      </div>

      <div className="destination-config-list">
        {(hubConfigs.data??[]).map((row:any)=><form action={saveDestinationHubConfig} className="destination-config-row" key={row.id}>
          <input type="hidden" name="config_id" value={row.id}/>
          <label>Mã hub<input name="hub_code" defaultValue={row.hub_code} required/></label>
          <label>Khu vực<input name="area" defaultValue={row.area} required/></label>
          <label>Miền
            <select name="region" defaultValue={row.region}>
              <option value="Miền Bắc">Miền Bắc</option>
              <option value="Miền Trung">Miền Trung</option>
              <option value="Miền Nam">Miền Nam</option>
            </select>
          </label>
          <label>Tỉnh/Thành<input name="province_keywords" defaultValue={(row.province_keywords??[]).join(', ')}/></label>
          <label>Quận/Huyện<input name="district_keywords" defaultValue={(row.district_keywords??[]).join(', ')}/></label>
          <label>Từ khóa thêm<input name="address_keywords" defaultValue={(row.address_keywords??[]).join(', ')}/></label>
          <label className="priority-field">Ưu tiên<input name="priority" type="number" min="0" defaultValue={row.priority??100}/></label>
          <label className="config-active"><input type="checkbox" name="is_active" defaultChecked={row.is_active}/> Bật</label>
          <button className="button small" type="submit">Lưu</button>
        </form>)}
      </div>

      <form action={saveDestinationHubConfig} className="destination-config-row destination-config-new">
        <label>Mã hub<input name="hub_code" placeholder="VD: HN-Đống Đa" required/></label>
        <label>Khu vực<input name="area" placeholder="Hà Nội" required/></label>
        <label>Miền
          <select name="region" defaultValue="Miền Bắc">
            <option value="Miền Bắc">Miền Bắc</option>
            <option value="Miền Trung">Miền Trung</option>
            <option value="Miền Nam">Miền Nam</option>
          </select>
        </label>
        <label>Tỉnh/Thành<input name="province_keywords" placeholder="Hà Nội, Ha Noi"/></label>
        <label>Quận/Huyện<input name="district_keywords" placeholder="Đống Đa, Dong Da"/></label>
        <label>Từ khóa thêm<input name="address_keywords" placeholder="phường, tuyến đường..."/></label>
        <label className="priority-field">Ưu tiên<input name="priority" type="number" min="0" defaultValue="100"/></label>
        <label className="config-active"><input type="checkbox" name="is_active" defaultChecked/> Bật</label>
        <button className="button small primary" type="submit">+ Thêm rule</button>
      </form>
    </section>
  </>
}
