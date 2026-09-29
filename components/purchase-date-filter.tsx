import Link from 'next/link'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'

export function PurchaseDateFilter({
  activeRange,
  from,
  to,
  label,
  basePath='/purchase',
}:{
  activeRange:RangeKey
  from:string
  to:string
  label:string
  basePath?:string
}){
  return <div className="purchase-date-filter flat">
    <div className="command-range">
      <Link className={activeRange==='today'?'active':''} href={basePath+'?range=today'}>Hôm nay</Link>
      <Link className={activeRange==='week'?'active':''} href={basePath+'?range=week'}>Tuần này</Link>
      <Link className={activeRange==='month'?'active':''} href={basePath+'?range=month'}>Tháng này</Link>
    </div>

    <form className="purchase-date-inline-form" action={basePath}>
      <input type="hidden" name="range" value="custom"/>
      <label>
        <span>Từ ngày</span>
        <input aria-label="Từ ngày" type="date" name="from" defaultValue={from} required/>
      </label>
      <span className="date-range-arrow">→</span>
      <label>
        <span>Đến ngày</span>
        <input aria-label="Đến ngày" type="date" name="to" defaultValue={to} required/>
      </label>
      <button className="button primary" type="submit">Áp dụng</button>
    </form>

    <div className="range-meta">
      <span>Khoảng đang xem</span>
      <b>{label}</b>
    </div>
  </div>
}
